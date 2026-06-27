// The Gemini Live relay — the stability-critical heart of Nicole 2.0.
//
// One LiveSession bridges a single browser WebSocket to a Gemini Live session
// server-side (the API key never reaches the browser). It owns:
//   - opening the Gemini session with the assembled Nicole prompt + voice + tools
//   - relaying audio/transcripts both directions
//   - capturing session-resumption handles and AUTO-RECONNECTING on drops,
//     reusing the handle so the conversation continues with no "Hello" re-intro
//   - a PROACTIVE-RECONNECT watchdog that refreshes the session before Gemini's
//     ~2h resume-handle boundary (shouldProactiveReconnect)
//   - LIVE SUMMARIZATION: when the turn buffer grows large, compress older turns
//     and reconnect seeded with [SUMMARY] so context never overflows (the fix for
//     "can't run 30+ minutes")
//   - dispatching memory tool calls (save_memory / forget_memory) + training
//     scoring to handlers
//
// The Gemini client is injected (GenAILike) so the whole thing is unit-testable
// with a fake — no API key needed in tests.

import { buildLiveConfig } from './liveConfig.js';
import { buildSystemPrompt } from '../prompt/nicolePrompt.js';
import { formatMemoryBlock } from '../memory/memoryBlock.js';
import { buildActivityDigest } from '../memory/activityDigest.js';
import { MEMORY_TOOL_DECLS, handleMemoryTool } from '../memory/memoryTools.js';
import { UI_CONTROL_TOOL_DECLS, UI_CONTROL_TOOL_NAMES, TRAINING_TOOL_DECLS } from './uiControlTools.js';
import { allConfiguredToolDecls } from '../integrations/registry.js';
import { isIntegrationTool, dispatchIntegrationTool } from '../integrations/toolDispatch.js';
import { loadFacts, loadDisplayName } from '../memory/db.js';
import { summarizeTurns } from './summarizer.js';
import { shouldSummarize, splitForSummary, estimateTokens } from '../session/summaryTrigger.js';
import {
  shouldProactiveReconnect,
  RESUME_HANDLE_MAX_AGE_MS,
} from '../session/sessionTiming.js';
import { getLiveStatus, formatLiveStatusLine } from '../session/liveStatus.js';
import type { Turn, SessionConfig } from '../types.js';

/** Minimal shape of a Gemini Live session we depend on. */
export interface LiveSessionHandle {
  sendRealtimeInput?: (payload: unknown) => void;
  sendClientContent?: (payload: unknown) => void;
  sendToolResponse?: (payload: unknown) => void;
  send?: (payload: unknown) => void;
  close?: () => void;
}

/** Callbacks Gemini invokes on the live session. */
export interface LiveCallbacks {
  onopen?: () => void;
  onmessage?: (m: any) => void;
  onerror?: (e: any) => void;
  onclose?: (e: any) => void;
}

/** Minimal shape of the @google/genai client we depend on. */
export interface GenAILike {
  live: {
    connect: (args: {
      model: string;
      config: Record<string, unknown>;
      callbacks: LiveCallbacks;
    }) => Promise<LiveSessionHandle>;
  };
}

/** What the client WS adapter must provide so the relay can talk back. */
export interface ClientChannel {
  send: (msg: unknown) => void;
  isOpen: () => boolean;
  close: () => void;
}

export interface LiveSessionDeps {
  ai: GenAILike;
  model: string;
  userId: string;
  client: ClientChannel;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  /** Override summarizer (tests inject a fake to avoid a real API call). */
  summarize?: (turns: Turn[]) => Promise<string>;
  /** Override fact loader (tests inject a fake to avoid a real DB). */
  loadUserFacts?: (userId: string) => Promise<{ key: string; fact: string; factType: string; userId: string }[]>;
  /** Override the display-name loader (tests inject a fake to avoid a real DB). */
  loadDisplayName?: (userId: string) => Promise<string | null>;
  /** Override the recent-activity digest builder (tests / DI). */
  loadActivity?: (userId: string) => Promise<string[]>;
  /** Override memory tool handler (tests). */
  onMemoryTool?: (name: string, args: any, userId: string) => Promise<{ ok: boolean }>;
  /** Called when a training_mark_progress tool fires (frontend relays it). */
}

/**
 * Owns ONE browser<->Gemini bridge for its lifetime, surviving Gemini socket
 * drops, proactive refreshes, and summary-driven reconnects transparently.
 */
export class LiveSession {
  private session: LiveSessionHandle | null = null;
  private readonly deps: LiveSessionDeps;
  private readonly now: () => number;

  private sessionConfig: SessionConfig | null = null;
  private resumeHandle: string | null = null;
  private resumeHandleAt: number | null = null;
  private sessionOpenedAt = 0;

  // Rolling conversation state.
  private turns: Turn[] = [];
  private runningSummary = '';
  private pendingUserText = '';
  private pendingNicoleText = '';

  // True while the user is mid-utterance (don't reconnect mid-speech).
  private userSpeaking = false;
  // Guards against overlapping reconnect/summarize operations.
  private busy = false;
  private closed = false;

  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor(deps: LiveSessionDeps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
  }

  /** Open the first Gemini session for this client's chosen voice/mode. */
  async connect(cfg: SessionConfig): Promise<void> {
    this.sessionConfig = cfg;
    await this.openGemini();
    this.startWatchdog();
  }

  /** Forward a client message (mic audio / text) to Gemini. */
  forwardClientMessage(payload: any): void {
    if (!this.session) return;
    // Track speaking state from a lightweight client hint if present.
    if (payload && typeof payload === 'object' && 'userSpeaking' in payload) {
      this.userSpeaking = !!payload.userSpeaking;
    }
    try {
      if (typeof this.session.sendRealtimeInput === 'function') {
        this.session.sendRealtimeInput(payload);
      } else if (typeof this.session.sendClientContent === 'function') {
        this.session.sendClientContent(payload);
      } else if (typeof this.session.send === 'function') {
        this.session.send(payload);
      }
    } catch {
      /* surfaced via onerror */
    }
  }

  /**
   * Send a TEXT turn to Gemini (not audio). Used for silent directives like the
   * training autostart "[NEW LESSON] begin now" prompt — the system drives the
   * session, the user doesn't have to speak first. Uses sendClientContent with a
   * proper turns structure (sendRealtimeInput is audio-only).
   */
  sendText(text: string): void {
    if (!text) return;
    // The browser may fire an opener ([OPEN]/[STATUS]/[WEATHER]) right after our
    // `ready` signal, but the Gemini session object isn't assigned until
    // ai.live.connect() resolves — which can be slower than the client's delay
    // (this stranded the coach's [OPEN] and stuck the training room). If the
    // session isn't ready yet, QUEUE the text and flush it once setup completes.
    if (!this.session) {
      this.pendingTexts.push(text);
      return;
    }
    this.dispatchText(text);
  }

  /** Texts requested before the Gemini session was ready, flushed on setup. */
  private pendingTexts: string[] = [];

  private dispatchText(text: string): void {
    if (!this.session || !text) return;
    try {
      if (typeof this.session.sendClientContent === 'function') {
        this.session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true,
        });
      } else if (typeof this.session.send === 'function') {
        this.session.send({
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true,
        });
      }
    } catch {
      /* surfaced via onerror */
    }
  }

  /** Flush any text queued before the session was ready (called once connected). */
  private flushPendingTexts(): void {
    if (!this.session || this.pendingTexts.length === 0) return;
    const queued = this.pendingTexts;
    this.pendingTexts = [];
    for (const t of queued) this.dispatchText(t);
  }

  /** Forward a tool response from the client to Gemini. */
  forwardToolResponse(payload: unknown): void {
    try {
      this.session?.sendToolResponse?.(payload);
    } catch {
      /* ignore */
    }
  }

  /** Change voice: reconnect (resume handle preserved) with the new voice. */
  async setVoice(voiceName: string): Promise<void> {
    if (!this.sessionConfig) return;
    this.sessionConfig = { ...this.sessionConfig, voiceName };
    await this.reconnect('voice-change');
  }

  /** Tear everything down — closes Gemini + stops the watchdog. */
  close(): void {
    this.closed = true;
    this.stopWatchdog();
    // Drop any queued opener text so it can't fire on a later reconnect.
    this.pendingTexts = [];
    try {
      this.session?.close?.();
    } catch {
      /* ignore */
    }
    this.session = null;
  }

  /** Expose turns (for the close-out summary + tests). */
  getTurns(): Turn[] {
    return this.turns;
  }

  // ---- internals -----------------------------------------------------------

  private async buildConfig(): Promise<Record<string, unknown>> {
    const cfg = this.sessionConfig!;
    const loader = this.deps.loadUserFacts ?? loadFacts;
    let memoryBlock = '';
    try {
      const facts = await loader(this.deps.userId);
      // The user's name (a users-table column, not a memory fact) so Nicole knows
      // who she's talking to from the FIRST message — she was asking "what's your
      // name?" because it was never in her context.
      let displayName: string | undefined;
      const nameLoader = this.deps.loadDisplayName ?? loadDisplayName;
      try { displayName = (await nameLoader(this.deps.userId)) ?? undefined; } catch { /* ignore */ }
      // Only Talk mode gets the cross-mode activity digest (Training/Roleplay
      // sessions Nicole can truthfully reference). Coach/prospect sessions skip
      // it — they're inside an activity, not reflecting on past ones.
      let activityLines: string[] | undefined;
      let liveStatusLine: string | undefined;
      if (cfg.mode === 'talk') {
        const digest = this.deps.loadActivity ?? buildActivityDigest;
        try { activityLines = await digest(this.deps.userId); } catch { /* ignore */ }
        const ls = getLiveStatus(this.deps.userId);
        if (ls) liveStatusLine = formatLiveStatusLine(ls, this.now()) ?? undefined;
      }
      memoryBlock = formatMemoryBlock(facts as any, { displayName, activityLines, liveStatusLine });
    } catch {
      memoryBlock = '';
    }
    // Tools are GATED BY MODE so a practice session can never take real-world
    // actions on the user's accounts:
    //   • talk     → everything (integrations, UI control, memory).
    //   • coach    → training scoring + memory only. NO integrations (it must
    //                never book a meeting / send mail mid-lesson) and NO UI
    //                control (the screen drives training, not the model).
    //   • prospect → NOTHING. It's a character in a roleplay — no integrations,
    //                no UI control, no memory writes. Just conversation.
    // This was a real bug: a roleplay created an actual calendar event.
    const mode = cfg.mode ?? 'talk';
    // Integration tools are key-gated (only providers with server keys appear),
    // AND only ever exposed in Talk mode.
    const integrationDecls = mode === 'talk' ? allConfiguredToolDecls() : [];
    const functionDeclarations =
      mode === 'talk'
        ? [...MEMORY_TOOL_DECLS, ...UI_CONTROL_TOOL_DECLS, ...integrationDecls]
        : mode === 'coach'
          ? [...MEMORY_TOOL_DECLS, ...TRAINING_TOOL_DECLS]
          : []; // prospect: no tools at all
    const systemPrompt = buildSystemPrompt({
      mode,
      memoryBlock,
      summary: this.runningSummary,
      overlay: cfg.systemOverlay,
      stylePrompt: cfg.stylePrompt,
      // Only teach Nicole about integrations when she actually has the tools.
      integrationsEnabled: integrationDecls.length > 0,
    });
    return buildLiveConfig({
      systemPrompt,
      voiceName: cfg.voiceName,
      tools: functionDeclarations.length
        ? [{ functionDeclarations }]
        : [],
      // Real-time Google Search grounding so Nicole can answer news/weather/
      // flights/prices/latest-fact questions with current info.
      searchEnabled: true,
    });
  }

  private async openGemini(): Promise<void> {
    const config = await this.buildConfig();
    // Reuse a still-fresh resume handle so Gemini restores prior state.
    const handleFresh =
      this.resumeHandle != null &&
      this.resumeHandleAt != null &&
      this.now() - this.resumeHandleAt < RESUME_HANDLE_MAX_AGE_MS;
    if (handleFresh) {
      (config as any).sessionResumption = { handle: this.resumeHandle };
    }

    this.session = await this.deps.ai.live.connect({
      model: this.deps.model,
      config,
      callbacks: {
        onopen: () => this.deps.client.send({ type: 'ready' }),
        onmessage: (m: any) => this.onGeminiMessage(m),
        onerror: (e: any) =>
          this.deps.client.send({ type: 'error', message: String(e?.message ?? e) }),
        onclose: (e: any) => this.onGeminiClose(e),
      },
    });
    this.sessionOpenedAt = this.now();
    // The session object now exists — flush any text queued before it was ready.
    this.flushPendingTexts();
  }

  private onGeminiMessage(m: any): void {
    // Gemini signals it's truly ready for turns with setupComplete — flush any
    // opener text that was queued before the session could accept it.
    if (m?.setupComplete) this.flushPendingTexts();
    // Relay verbatim to the browser (audio + everything).
    if (this.deps.client.isOpen()) {
      this.deps.client.send({ type: 'message', payload: m });
    }

    // Capture a fresh resume handle.
    try {
      const update = m?.sessionResumptionUpdate;
      if (update?.newHandle && update?.resumable) {
        this.resumeHandle = update.newHandle;
        this.resumeHandleAt = this.now();
      }
    } catch {
      /* never break the proxy */
    }

    // goAway: Gemini warns ~60s before it closes the connection. In TALK mode we
    // reconnect now (resuming via the handle) BEFORE the socket drops, so the
    // long-lived assistant stays up seamlessly. In a COACH/PROSPECT session we do
    // NOT proactively reconnect — a practice rep is short and bounded, and a
    // mid-lesson reconnect froze transcription and made her re-greet. If such a
    // session ever outlives the connection, the drop-handler reconnects it.
    try {
      if (m?.goAway && this.sessionConfig?.mode === 'talk' && !this.busy && !this.userSpeaking) {
        void this.reconnect('goaway');
      }
    } catch {
      /* never break the proxy */
    }

    // Accumulate transcripts → turns (for summary + close-out memory).
    try {
      const sc = m?.serverContent;
      if (sc) {
        if (sc.inputTranscription?.text) this.pendingUserText += sc.inputTranscription.text;
        if (sc.outputTranscription?.text) this.pendingNicoleText += sc.outputTranscription.text;
        if (sc.turnComplete) this.flushTurn();
      }
    } catch {
      /* ignore */
    }

    // Dispatch tool calls (memory). Gemini delivers function calls on toolCall.
    void this.maybeHandleToolCalls(m);
  }

  private flushTurn(): void {
    if (this.pendingUserText.trim()) {
      this.turns.push({ role: 'user', text: this.pendingUserText.trim() });
      this.pendingUserText = '';
    }
    if (this.pendingNicoleText.trim()) {
      this.turns.push({ role: 'nicole', text: this.pendingNicoleText.trim() });
      this.pendingNicoleText = '';
    }
    // After a completed turn, consider summarizing to keep context bounded.
    void this.maybeSummarize();
  }

  private async maybeHandleToolCalls(m: any): Promise<void> {
    try {
      const calls = m?.toolCall?.functionCalls;
      if (!Array.isArray(calls) || calls.length === 0) return;
      const handler = this.deps.onMemoryTool ?? handleMemoryTool;
      const responses: any[] = [];
      for (const call of calls) {
        const name = call?.name;
        const args = call?.args ?? {};
        if (name === 'save_memory' || name === 'forget_memory') {
          const res = await handler(name, args, this.deps.userId);
          responses.push({ id: call?.id, name, response: { result: res.ok ? 'ok' : 'error' } });
        }
        // training_mark_progress is handled client-side (drives the scorecard);
        // we still ack it so Gemini isn't left waiting.
        else if (name === 'training_mark_progress') {
          responses.push({ id: call?.id, name, response: { result: 'ok' } });
        }
        // UI-control tools (set_camera, switch_mode, set_voice, mute_ai,
        // mute_mic, end_session) are performed by the BROWSER — the raw toolCall
        // is already relayed to the client in onGeminiMessage. Here we just ack
        // Gemini so the turn completes.
        else if (UI_CONTROL_TOOL_NAMES.has(name)) {
          responses.push({ id: call?.id, name, response: { result: 'ok' } });
        }
        // Integration tools (calendar/email/tasks/slack/notion/spotify) run
        // SERVER-SIDE because the OAuth tokens live here. We return a short,
        // speakable summary as the function result so Nicole reads it back.
        else if (isIntegrationTool(name)) {
          // HARD GATE: only Talk mode may take real-world actions on the user's
          // accounts. A coach/prospect session that somehow emits an integration
          // call (e.g. a resumed session with stale declarations) is refused —
          // never let a roleplay book a meeting or send mail.
          if ((this.sessionConfig?.mode ?? 'talk') !== 'talk') {
            responses.push({
              id: call?.id,
              name,
              response: { result: 'error', summary: 'Not available during a practice session.' },
            });
            continue;
          }
          const result = await dispatchIntegrationTool(name, args, this.deps.userId);
          responses.push({
            id: call?.id,
            name,
            response: { result: result.ok ? 'ok' : 'error', summary: result.summary },
          });
          // Echo the result to the BROWSER so it can show a success/error toast
          // (the raw toolCall was already relayed for the in-progress toast).
          if (this.deps.client.isOpen()) {
            this.deps.client.send({
              type: 'tool-result',
              name,
              ok: result.ok,
              summary: result.summary,
            });
          }
        }
      }
      if (responses.length && this.session?.sendToolResponse) {
        this.session.sendToolResponse({ functionResponses: responses });
      }
    } catch {
      /* tool errors never break the live session */
    }
  }

  private async maybeSummarize(): Promise<void> {
    if (this.busy || this.closed) return;
    const estTokens = estimateTokens(this.turns.map((t) => t.text).join(' '));
    if (!shouldSummarize(this.turns.length, estTokens)) return;
    if (this.userSpeaking) return; // never summarize mid-utterance

    this.busy = true;
    try {
      const { toSummarize, toKeep } = splitForSummary(this.turns);
      if (toSummarize.length === 0) return;
      const summarizer = this.deps.summarize ?? summarizeTurns;
      const fresh = await summarizer(toSummarize);
      // Merge with any prior running summary so nothing is lost.
      this.runningSummary = this.runningSummary
        ? `${this.runningSummary} ${fresh}`.trim()
        : fresh;
      this.turns = toKeep;
      // Reconnect seeded with the new [SUMMARY] so the live context is light.
      // We already hold `busy`, so call the unguarded form.
      await this.doReconnect();
    } catch {
      /* if summarization fails, keep going on the existing session */
    } finally {
      this.busy = false;
    }
  }

  private onGeminiClose(e: any): void {
    if (this.closed) return;
    const code = e?.code;
    const reason = e?.reason ?? '';
    // Auto-reconnect on drops, reusing the resume handle (seamless continue).
    // Terminal billing/quota closes are relayed to the client to stop storms.
    if (isTerminalClose(code, reason)) {
      this.deps.client.send({ type: 'gemini-close', code, reason });
      this.deps.client.close();
      return;
    }
    this.deps.client.send({ type: 'reconnecting' });
    void this.reconnect('drop').catch(() => {
      if (this.deps.client.isOpen()) {
        this.deps.client.send({ type: 'gemini-close', code, reason });
        this.deps.client.close();
      }
    });
  }

  /** Close the current Gemini session and open a fresh one (handle reused).
   *  Guarded so overlapping triggers (goAway + drop + proactive) can't stack into
   *  duplicate reconnects. (maybeSummarize sets `busy` itself, so it calls the
   *  unguarded doReconnect directly.) */
  private async reconnect(_why: string): Promise<void> {
    if (this.closed || this.busy) return;
    this.busy = true;
    try {
      await this.doReconnect();
    } finally {
      this.busy = false;
    }
  }

  /** The actual close-and-reopen. Callers must hold the `busy` guard. */
  private async doReconnect(): Promise<void> {
    if (this.closed) return;
    try { this.session?.close?.(); } catch { /* ignore */ }
    this.session = null;
    await this.openGemini();
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    // Check once a minute whether we should proactively refresh the session
    // before the resume-handle boundary. Cheap; cleared on close.
    this.watchdog = setInterval(() => void this.tickWatchdog(), 60_000);
    // Avoid keeping the process alive solely for this timer.
    (this.watchdog as any)?.unref?.();
  }

  private async tickWatchdog(): Promise<void> {
    if (this.closed || this.busy || !this.session) return;
    // Proactive refresh is for the long-lived TALK assistant only — never
    // interrupt a bounded coach/prospect practice session.
    if (this.sessionConfig?.mode !== 'talk') return;
    const sessionAge = this.now() - this.sessionOpenedAt;
    const handleAge = this.resumeHandleAt == null ? null : this.now() - this.resumeHandleAt;
    if (shouldProactiveReconnect(sessionAge, handleAge, this.userSpeaking)) {
      // reconnect() holds the busy guard itself — don't pre-set it (that made the
      // guarded reconnect early-return and the proactive refresh never ran).
      await this.reconnect('proactive');
    }
  }

  private stopWatchdog(): void {
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
  }
}

/**
 * A terminal close is non-retryable (billing / quota / region). Everything else
 * is a normal rotation/drop we reconnect through. Mirrors CHAT's filter.
 */
export function isTerminalClose(code: number | undefined, reason: string): boolean {
  return (
    code === 1011 &&
    /spending cap|quota|exceeded|billing|credits?|deplet|prepay|resource exhausted|permission|not available in your country|location is not supported/i.test(
      reason,
    )
  );
}
