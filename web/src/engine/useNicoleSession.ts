import { useCallback, useEffect, useRef, useState } from 'react';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  floatTo16BitPCM,
  int16ToFloat32,
} from '../audio/pcm';
import { PlaybackQueue } from '../audio/playbackQueue';
import { extractToolCalls } from './uiCommands';
import type { Speaker, TranscriptLine } from './types';

export type { TranscriptLine, Speaker } from './types';

const VOLUME_STORAGE_KEY = 'nicole_volume';

/** Restore the last chosen volume (0-100) from localStorage; default 80. */
function loadSavedVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw == null) return 80;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 80;
  } catch {
    return 80;
  }
}

/**
 * Map a 0-100 volume level to a Web Audio gain. Loudness is perceived roughly
 * logarithmically, so a linear level wouldn't feel right — we map across a 50 dB
 * range (level 100 → gain 1.0, level 50 → ~0.056, level 0 → true mute), which
 * matches how Discord/Alexa-style volume sliders feel.
 */
export function levelToGain(level: number): number {
  const L = Math.max(0, Math.min(100, Math.round(level)));
  if (L === 0) return 0;
  const dB = (L / 100) * 50 - 50;
  return Math.pow(10, dB / 20);
}

/** Conversation mode forwarded to the backend. */
export type SessionMode = 'talk' | 'coach' | 'prospect';

export interface UseNicoleSessionOptions {
  /** Gemini voice name (e.g. 'Aoede'). */
  voiceName: string;
  /** Conversation mode. Defaults to 'talk'. */
  mode?: SessionMode;
  /** WebSocket relay URL. Defaults to import.meta.env.VITE_SERVER_WS. */
  serverWs?: string;
  /** Optional extra system overlay forwarded in the connect config. */
  systemOverlay?: string;
  /** Optional per-voice style prompt forwarded in the connect config. */
  stylePrompt?: string;
  /** Called when Nicole calls UI-control tools (set_camera, switch_mode, …). */
  onToolCall?: (calls: { name: string; args: Record<string, unknown> }[]) => void;
  /** Called when a server-side integration tool finishes (for success toasts). */
  onToolResult?: (r: { name: string; ok: boolean; summary: string }) => void;
  /** When true, Nicole's audio output is muted (session stays live). */
  aiMuted?: boolean;
  /**
   * The logged-in user's JWT. Sent in the connect message so the server runs the
   * live session AS THIS USER — their memory + their connected integrations.
   * Without it the server falls back to its single default user.
   */
  authToken?: string | null;
}

export interface UseNicoleSessionResult {
  connected: boolean;
  micOn: boolean;
  transcript: TranscriptLine[];
  /** The in-progress (not-yet-committed) line per speaker, rendered as a single
   *  live bubble each. Empty string when that speaker has no pending utterance. */
  realtime: { you: string; nicole: string };
  amplitude: number;
  start: () => Promise<void>;
  stop: () => void;
  /** Clear the visible transcript (after End — durable facts stay in memory). */
  clearTranscript: () => void;
  toggleMic: () => void;
  setVoice: (v: string) => void;
  /** Send a silent text directive to the model (e.g. roleplay "[OPEN]" autostart). */
  sendText: (text: string) => void;
  /** Send a single camera frame (base64 JPEG, no data: prefix) for vision. */
  sendVideoFrame: (base64Jpeg: string) => void;
  /** Nicole's output volume, 0-100. */
  volume: number;
  /** Whether output is muted (gain 0). */
  muted: boolean;
  /** Set absolute volume 0-100. */
  setVolume: (level: number) => void;
  /** Nudge volume by a delta (e.g. +10 / -10) for "louder"/"quieter". */
  adjustVolume: (delta: number) => void;
  /** Mute/unmute output (remembers the prior level). */
  setMuted: (muted: boolean) => void;
  /** Invoke `cb` once on the next turnComplete, or immediately if Nicole is not
   *  currently speaking. Includes a 6s safety timeout so the callback always fires. */
  afterNextModelTurn: (cb: () => void) => void;
}

// --- Tuning constants ------------------------------------------------------

/** Output (Nicole) audio is decoded at 24kHz int16 PCM. */
const OUTPUT_SAMPLE_RATE = 24000;
/** Target mic capture rate sent to the backend. */
const INPUT_SAMPLE_RATE = 16000;
/** ScriptProcessor buffer size (power of two). */
const PROCESSOR_BUFFER_SIZE = 4096;
/** Cap on transcript history to keep memory bounded. */
const MAX_TRANSCRIPT_LINES = 400;

// --- Barge-in / noise gating ----------------------------------------------
// Goal: she should hear you at a NORMAL speaking volume, while a cough or a
// one-second blip still doesn't cut her off. The barge-in gate below ONLY
// governs interrupting her mid-speech — it must NOT be so high that normal
// speech fails to register. Kept low + a short sustain so interrupting is easy.

/** RMS floor below which audio is ignored for barge-in, on the RAW mic signal.
 *  Low so a normal speaking voice interrupts her, high enough to ignore a blip. */
const BARGE_IN_RMS_THRESHOLD = 0.045;
/**
 * Consecutive over-threshold frames before we treat it as a real interruption.
 * One frame (4096 samples @16kHz) ≈ 256ms, so 2 frames ≈ ~500ms — enough to
 * shrug off a single-frame blip/cough, short enough that normal speech
 * interrupts her almost immediately.
 */
const BARGE_IN_SUSTAIN_FRAMES = 2;
/**
 * Mic constraints. ALL of the browser's built-in processing is ON:
 *   - echoCancellation: stops Nicole's own voice feeding back (speaker setups).
 *   - autoGainControl: normalizes a normal-volume voice up to a usable level so
 *     the user never has to shout (a flat manual multiply did this badly and
 *     distorted peaks, which garbled transcription — "hello" x5, gibberish).
 *   - noiseSuppression: cleans the signal so Gemini's transcription is accurate.
 * We send this processed signal straight through — NO manual gain/soft-clip.
 */
const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  },
};

let lineCounter = 0;
function nextLineId(): string {
  lineCounter += 1;
  return `l${Date.now().toString(36)}_${lineCounter}`;
}

function resolveDefaultWs(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  return env?.VITE_SERVER_WS ?? 'ws://localhost:4000/ai-live';
}

interface GeminiPart {
  inlineData?: { mimeType?: string; data?: string };
  text?: string;
}

interface GeminiServerContent {
  modelTurn?: { parts?: GeminiPart[] };
  inputTranscription?: { text?: string };
  outputTranscription?: { text?: string };
  turnComplete?: boolean;
  /** Model finished generating → the reliable signal to close Nicole's bubble.
   *  (turnComplete fires prematurely mid-reply — a known Gemini Live bug.) */
  generationComplete?: boolean;
  /** Model turn canceled (barge-in) → flush audio + close Nicole's bubble. */
  interrupted?: boolean;
}

interface GeminiServerMessage {
  serverContent?: GeminiServerContent;
}

interface RelayMessage {
  type: string;
  payload?: GeminiServerMessage;
  message?: string;
  code?: number;
  reason?: string;
  // tool-result echo (integration tools finishing, for success toasts)
  name?: string;
  ok?: boolean;
  summary?: string;
}

/**
 * Live-voice session hook for Nicole.
 *
 * Owns: a WebSocket to the relay, a mic capture AudioContext (16kHz input),
 * a 24kHz playback AudioContext, a bounded PlaybackQueue, an AnalyserNode for
 * lip-sync amplitude, and the conversation transcript.
 *
 * Leak-safety is the central concern: `stop()` (and unmount) tears down the
 * socket, mic tracks, both AudioContexts, all nodes, the playback timer and
 * the queue, with no dangling timers/intervals/rAF.
 */
export function useNicoleSession(
  opts: UseNicoleSessionOptions,
): UseNicoleSessionResult {
  const {
    voiceName,
    mode = 'talk',
    serverWs,
    systemOverlay,
    stylePrompt,
    onToolCall,
    onToolResult,
    aiMuted = false,
    authToken,
  } = opts;

  const [connected, setConnected] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [amplitude, setAmplitude] = useState(0);
  // Reactive copies of volume state for the UI slider/icon. The ref (declared
  // below) is the source of truth for the audio graph (no re-render to apply gain).
  const [volume, setVolumeState] = useState<number>(loadSavedVolume);
  const [muted, setMutedState] = useState(false);
  const lastLevelRef = useRef<number>(loadSavedVolume() || 80);

  // --- Mutable refs (never trigger re-render) ------------------------------
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // Master output gain — Nicole's adjustable volume (0-100 level → perceptual
  // gain). All playback routes through this so set_volume / the UI slider work.
  const gainNodeRef = useRef<GainNode | null>(null);
  const volumeRef = useRef<number>(loadSavedVolume()); // 0-100
  const queueRef = useRef(new PlaybackQueue<Float32Array>(80));
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const playHeadRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const wantMicRef = useRef(true);
  // Count of consecutive over-threshold mic frames, for sustained barge-in.
  const sustainedSpeechRef = useRef(0);
  const voiceRef = useRef(voiceName);
  // A silent directive to fire ONCE the next time the session reports `ready`.
  // Used by setVoice: after the voice-change reconnect, nudge Nicole to confirm
  // the switch out loud — otherwise the reconnect drops the turn and she stays
  // silent until the user speaks again.
  const pendingReadyDirectiveRef = useRef<string | null>(null);
  // Latest tool-call callback + AI-mute flag, kept in refs so the message
  // handler (a stable callback) always sees the current values.
  const onToolCallRef = useRef(onToolCall);
  onToolCallRef.current = onToolCall;
  const onToolResultRef = useRef(onToolResult);
  onToolResultRef.current = onToolResult;
  const aiMutedRef = useRef(aiMuted);
  aiMutedRef.current = aiMuted;

  // Callbacks waiting for the next completed model turn (used by coaching to
  // avoid cutting Nicole off when pushing the next phase overlay).
  const afterTurnCbsRef = useRef<Array<() => void>>([]);
  const afterTurnTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const nicoleSpeakingRef = useRef(false);

  /** Nicole's turn ended (turnComplete OR barge-in): mark her not-speaking, cancel
   *  the pending safety timeouts, and fire every queued afterNextModelTurn cb. */
  const drainAfterTurnCbs = useCallback(() => {
    nicoleSpeakingRef.current = false;
    for (const t of afterTurnTimersRef.current) clearTimeout(t);
    afterTurnTimersRef.current = [];
    const cbs = afterTurnCbsRef.current;
    afterTurnCbsRef.current = [];
    for (const cb of cbs) { try { cb(); } catch { /* ignore */ } }
  }, []);

  // ── Transcript model — mirrors the proven CHAT-PROJECT pattern, which is the
  //    real fix for fragmentation. Two stores:
  //      • transcript[]  = COMMITTED lines (the chat history).
  //      • realtimeRef   = the CURRENT in-progress utterance per speaker (one
  //        live line each, NOT in transcript[]), surfaced as `realtime` state.
  //    Each inputTranscription/outputTranscription chunk APPENDS (with a dedup +
  //    cumulative-snapshot guard) to the realtime accumulator — it never pushes a
  //    bubble. On turnComplete (or barge-in/stop) we COMMIT the accumulators into
  //    transcript[] as ONE line each and clear realtime. So a slow speaker with
  //    pauses stays one growing line, then becomes one committed bubble.
  const realtimeRef = useRef<Record<Speaker, string>>({ you: '', nicole: '' });
  const [realtime, setRealtime] = useState<{ you: string; nicole: string }>({ you: '', nicole: '' });
  // The speaker who most recently received transcript text. Used to keep the
  // committed transcript in true chronological order: when the OTHER speaker
  // starts, we commit the previous speaker's line FIRST (a real turn boundary),
  // rather than batching both on turnComplete in a fixed order — which reordered
  // lines when input/output transcription arrived with timing skew (the rep
  // appearing to answer before the user finished).
  const lastSpeakerRef = useRef<Speaker | null>(null);

  // Keep the latest opts in a ref so the WS open handler always reads fresh
  // config without re-subscribing.
  const connectCfgRef = useRef({ voiceName, mode, systemOverlay, stylePrompt, authToken });
  connectCfgRef.current = { voiceName, mode, systemOverlay, stylePrompt, authToken };
  voiceRef.current = voiceName;

  /** Append a chunk to a speaker's in-progress (realtime) line. Handles BOTH
   *  incremental deltas and cumulative snapshots, strips dashes, and joins words
   *  with a space when needed. Never commits a bubble. */
  const appendPartial = useCallback((speaker: Speaker, raw: string) => {
    if (!raw) return;
    // Strip em/en-dashes from the displayed transcript (user never wants dashes).
    const chunk = raw.replace(/\s*[—–]\s*/g, ', ');
    if (!chunk) return;

    // Track who is currently speaking so finalizeTurn can commit in true spoken
    // order (most-recent speaker last). We do NOT commit on every switch —
    // input + output transcription legitimately interleave at the chunk level
    // during one exchange, and committing per chunk would shatter the bubbles.
    lastSpeakerRef.current = speaker;

    const prev = realtimeRef.current[speaker];
    let next: string;
    if (!prev) {
      next = chunk.replace(/^\s+/, '');
    } else if (chunk.startsWith(prev)) {
      // Cumulative snapshot (Gemini 3.1 input transcription) → REPLACE.
      next = chunk;
    } else if (prev.endsWith(chunk)) {
      // Exact duplicate tail (dedup guard, as in the chat project) → ignore.
      return;
    } else {
      // Incremental delta → APPEND, inserting a space to avoid run-ons like
      // "goin'?Yeah" → "goin'? Yeah" and word-mashing.
      const needsSpace =
        (/[.?!,)"']$/.test(prev) && /^[A-Za-z0-9]/.test(chunk)) ||
        (/[A-Za-z0-9]$/.test(prev) && /^[A-Za-z0-9]/.test(chunk) && !prev.endsWith(' ') && !chunk.startsWith(' '));
      next = prev + (needsSpace ? ' ' : '') + chunk;
    }
    realtimeRef.current[speaker] = next;
    setRealtime((r) => (r[speaker] === next ? r : { ...r, [speaker]: next }));
  }, []);

  /** Commit a speaker's in-progress line into the transcript as ONE bubble and
   *  clear the realtime accumulator. The single source of "a turn is done". */
  const commitSpeaker = useCallback((speaker: Speaker) => {
    const text = realtimeRef.current[speaker].trim();
    realtimeRef.current[speaker] = '';
    setRealtime((r) => (r[speaker] === '' ? r : { ...r, [speaker]: '' }));
    if (!text) return;
    setTranscript((prevList) => {
      // De-dup an identical consecutive line (matches the chat project).
      const last = prevList[prevList.length - 1];
      if (last && last.speaker === speaker && last.text === text) return prevList;
      return capLines([...prevList, { id: nextLineId(), speaker, text, streaming: false }]);
    });
  }, []);

  /** Finalize the whole turn (on turnComplete): commit any pending lines in the
   *  order they were actually spoken — the MOST-RECENT speaker commits LAST so it
   *  sits at the bottom. (Most turns have only one pending line by now, since the
   *  turn-boundary commit in appendPartial already flushed the previous speaker.) */
  const finalizeTurn = useCallback(() => {
    const last = lastSpeakerRef.current;
    if (last === 'nicole') {
      commitSpeaker('you');
      commitSpeaker('nicole');
    } else {
      // last === 'you' or null → user spoke most recently (or unknown): the rep's
      // line, if any, came first.
      commitSpeaker('nicole');
      commitSpeaker('you');
    }
  }, [commitSpeaker]);

  /** Hard finalize one speaker (barge-in / stop): commit just that speaker. */
  const hardFinalize = useCallback((speaker: Speaker) => {
    commitSpeaker(speaker);
  }, [commitSpeaker]);
  const hardFinalizeRef = useRef(hardFinalize);
  hardFinalizeRef.current = hardFinalize;
  const finalizeTurnRef = useRef(finalizeTurn);
  finalizeTurnRef.current = finalizeTurn;

  // ------------------------------------------------------------------------
  // Playback scheduling (24kHz, back-to-back buffers)
  // ------------------------------------------------------------------------
  const drainQueue = useCallback(() => {
    const ctx = playCtxRef.current;
    if (!ctx) return;
    let frames: Float32Array | undefined;
    // eslint-disable-next-line no-cond-assign
    while ((frames = queueRef.current.dequeue())) {
      const buffer = ctx.createBuffer(1, frames.length, OUTPUT_SAMPLE_RATE);
      buffer.getChannelData(0).set(frames);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      // Route through the master gain so volume control applies:
      // src → analyser → gain → destination (analyser→gain wired in wirePlayback).
      const analyser = analyserRef.current;
      const gain = gainNodeRef.current;
      if (analyser) {
        src.connect(analyser);
      } else if (gain) {
        src.connect(gain);
      } else {
        src.connect(ctx.destination);
      }
      const startAt = Math.max(ctx.currentTime, playHeadRef.current);
      src.start(startAt);
      playHeadRef.current = startAt + buffer.length / OUTPUT_SAMPLE_RATE;
      activeSourcesRef.current.add(src);
      src.onended = () => {
        activeSourcesRef.current.delete(src);
        try {
          src.disconnect();
        } catch {
          /* already disconnected */
        }
      };
    }
  }, []);

  const stopPlayback = useCallback(() => {
    queueRef.current.flush();
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        /* may not have started */
      }
      try {
        src.disconnect();
      } catch {
        /* ignore */
      }
    }
    activeSourcesRef.current.clear();
    playHeadRef.current = 0;
  }, []);

  // ------------------------------------------------------------------------
  // Amplitude (lip-sync) loop
  // ------------------------------------------------------------------------
  const tickAmplitude = useCallback(() => {
    const analyser = analyserRef.current;
    if (analyser && typeof analyser.getByteTimeDomainData === 'function') {
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(buf);
      let sumSq = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / buf.length);
      // Boost a little; clamp 0..1.
      setAmplitude(Math.min(1, rms * 2.2));
    }
    rafRef.current = requestAnimationFrame(tickAmplitude);
  }, []);

  // ------------------------------------------------------------------------
  // Incoming relay message handler
  // ------------------------------------------------------------------------
  const handleRelayMessage = useCallback(
    (msg: RelayMessage) => {
      switch (msg.type) {
        case 'open':
        case 'ready': {
          setConnected(true);
          // Fire any one-shot directive queued for this connect (e.g. the
          // voice-change confirmation), so Nicole speaks right after a reconnect
          // instead of waiting silently for the user's next turn.
          const directive = pendingReadyDirectiveRef.current;
          if (directive) {
            pendingReadyDirectiveRef.current = null;
            const ws = wsRef.current;
            // Small delay so the fresh Gemini session is ready to accept a turn.
            setTimeout(() => {
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'client-text', text: directive }));
              }
            }, 400);
          }
          return;
        }
        case 'error':
          // Surface as a transient — keep the session alive; caller can stop.
          return;
        case 'gemini-close':
          setConnected(false);
          return;
        case 'tool-result':
          if (msg.name) {
            onToolResultRef.current?.({ name: msg.name, ok: !!msg.ok, summary: msg.summary ?? '' });
          }
          return;
        case 'message':
          break;
        default:
          return;
      }

      // UI-control tool calls (set_camera, switch_mode, …) ride at the message
      // level, not under serverContent — extract them before the sc guard so
      // Nicole can operate the UI.
      const toolCalls = extractToolCalls(msg.payload);
      if (toolCalls.length) onToolCallRef.current?.(toolCalls);

      const sc = msg.payload?.serverContent;
      if (!sc) return;

      // Audio parts → decode → enqueue → schedule playback. When the AI is muted
      // we DROP the audio (don't play it) but keep the session fully live.
      const parts = sc.modelTurn?.parts ?? [];
      let enqueuedAudio = false;
      for (const part of parts) {
        const data = part.inlineData?.data;
        if (data && !aiMutedRef.current) {
          const ab = base64ToArrayBuffer(data);
          const int16 = new Int16Array(ab);
          const float = int16ToFloat32(int16);
          queueRef.current.enqueue(float);
          enqueuedAudio = true;
        }
      }
      if (enqueuedAudio) drainQueue();

      // Transcripts → accumulate into the in-progress realtime line per speaker.
      if (sc.inputTranscription?.text) {
        appendPartial('you', sc.inputTranscription.text);
      }
      if (sc.outputTranscription?.text) {
        nicoleSpeakingRef.current = true;
        appendPartial('nicole', sc.outputTranscription.text);
      }

      // Turn boundaries (the chat-project commit points):
      //  - turnComplete → commit BOTH speakers' in-progress lines to the
      //    transcript as one bubble each (user first, then Nicole).
      //  - interrupted (barge-in) → stop her audio + commit Nicole's line.
      if (sc.interrupted) {
        stopPlayback();
        hardFinalizeRef.current('nicole');
        // Barge-in also ends her turn → release any deferred callbacks (else
        // they'd wait out the full 6s safety timeout).
        drainAfterTurnCbs();
      } else if (sc.turnComplete) {
        finalizeTurnRef.current();
        drainAfterTurnCbs();
      }
    },
    [appendPartial, drainQueue, stopPlayback, drainAfterTurnCbs],
  );

  // ------------------------------------------------------------------------
  // Mic capture wiring
  // ------------------------------------------------------------------------
  const sendMicFrame = useCallback((float: Float32Array) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1 /* OPEN */) return;
    if (!wantMicRef.current) return;
    const int16 = floatTo16BitPCM(float);
    // .buffer is typed ArrayBufferLike under strict lib; slice() narrows to a
    // plain ArrayBuffer and yields exactly the bytes backing this view.
    const ab = int16.buffer.slice(
      int16.byteOffset,
      int16.byteOffset + int16.byteLength,
    ) as ArrayBuffer;
    const b64 = arrayBufferToBase64(ab);
    ws.send(
      JSON.stringify({
        type: 'client-msg',
        payload: {
          audio: {
            data: b64,
            mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
          },
        },
      }),
    );
  }, []);

  const wireMic = useCallback(
    (stream: MediaStream) => {
      const Ctor =
        (globalThis as unknown as { AudioContext?: typeof AudioContext })
          .AudioContext ??
        (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;

      let micCtx: AudioContext;
      try {
        micCtx = new Ctor({ sampleRate: INPUT_SAMPLE_RATE });
      } catch {
        micCtx = new Ctor();
      }
      micCtxRef.current = micCtx;

      const source = micCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      // ScriptProcessor is deprecated but adequate and synchronous for now.
      const processor = micCtx.createScriptProcessor
        ? micCtx.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1)
        : null;
      processorRef.current = processor;

      if (processor) {
        processor.onaudioprocess = (ev: AudioProcessingEvent) => {
          const input = ev.inputBuffer.getChannelData(0);
          // Send the browser-processed signal as-is (echo-cancel + AGC + noise
          // suppression already did the work). A copy is needed because the live
          // buffer is reused each tick. NO manual gain/soft-clip — that distorted
          // peaks and garbled the transcription.
          const frame = new Float32Array(input);

          // Barge-in gate: only a REAL, SUSTAINED utterance interrupts Nicole.
          // A single loud frame (a cough, a phone buzz, a door, a stray word
          // from someone nearby) is NOT enough — the energy must stay above the
          // noise floor for several consecutive frames before she yields. This
          // makes her a patient listener instead of flinching at every blip.
          let sumSq = 0;
          for (let i = 0; i < frame.length; i++) sumSq += frame[i] * frame[i];
          const rms = Math.sqrt(sumSq / frame.length);

          if (rms > BARGE_IN_RMS_THRESHOLD) {
            sustainedSpeechRef.current += 1;
          } else {
            // Reset on any quiet frame — momentary noise can't accumulate.
            sustainedSpeechRef.current = 0;
          }

          const nicoleIsSpeaking =
            queueRef.current.length > 0 || activeSourcesRef.current.size > 0;
          if (
            wantMicRef.current &&
            nicoleIsSpeaking &&
            sustainedSpeechRef.current >= BARGE_IN_SUSTAIN_FRAMES
          ) {
            stopPlayback();
            // Barge-in: close Nicole's bubble now so the user's reply starts fresh.
            hardFinalizeRef.current('nicole');
            sustainedSpeechRef.current = 0;
          }

          sendMicFrame(frame);
        };
        source.connect(processor);
        // Connect to destination to keep the processor pulling in some browsers.
        processor.connect(micCtx.destination);
      }
    },
    [sendMicFrame, stopPlayback],
  );

  // ------------------------------------------------------------------------
  // Playback context + analyser
  // ------------------------------------------------------------------------
  const wirePlayback = useCallback(() => {
    const Ctor =
      (globalThis as unknown as { AudioContext?: typeof AudioContext })
        .AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;

    let playCtx: AudioContext;
    try {
      playCtx = new Ctor({ sampleRate: OUTPUT_SAMPLE_RATE });
    } catch {
      playCtx = new Ctor();
    }
    playCtxRef.current = playCtx;
    playHeadRef.current = playCtx.currentTime;

    // Master gain → destination. Initial value from the persisted volume (set at
    // t=0 so the first frame isn't clipped). All playback connects through this.
    if (playCtx.createGain) {
      const gain = playCtx.createGain();
      const g = levelToGain(volumeRef.current);
      if (typeof gain.gain?.setValueAtTime === 'function') {
        gain.gain.setValueAtTime(g, playCtx.currentTime);
      } else if (gain.gain) {
        gain.gain.value = g;
      }
      gain.connect(playCtx.destination);
      gainNodeRef.current = gain;
    }

    if (playCtx.createAnalyser) {
      const analyser = playCtx.createAnalyser();
      analyser.fftSize = 256;
      // Analyser feeds the gain (so the wave reads pre-volume amplitude, and
      // audio is attenuated by the gain on its way to the speakers).
      if (gainNodeRef.current) analyser.connect(gainNodeRef.current);
      else analyser.connect(playCtx.destination);
      analyserRef.current = analyser;
    }

    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(tickAmplitude);
    }
  }, [tickAmplitude]);

  /**
   * Apply a 0-100 volume level: ramp the master gain smoothly (no click) and
   * persist. Exposed via setVolume() and the set_volume/adjust_volume tools.
   */
  const applyVolume = useCallback((level: number, persist = true) => {
    const L = Math.max(0, Math.min(100, Math.round(level)));
    volumeRef.current = L;
    const gain = gainNodeRef.current;
    const ctx = playCtxRef.current;
    if (gain && ctx) {
      const g = levelToGain(L);
      try {
        gain.gain.setTargetAtTime(g, ctx.currentTime, 0.03); // ~30ms ease, no click
      } catch {
        gain.gain.value = g;
      }
    }
    if (persist) {
      try { localStorage.setItem(VOLUME_STORAGE_KEY, String(L)); } catch { /* ignore */ }
    }
  }, []);

  /** Set absolute volume 0-100 (used by the slider and set_volume tool). */
  const setVolume = useCallback((level: number) => {
    const L = Math.max(0, Math.min(100, Math.round(level)));
    if (L > 0) lastLevelRef.current = L;
    setVolumeState(L);
    setMutedState(L === 0);
    applyVolume(L);
  }, [applyVolume]);

  /** Nudge volume by +/- amount (default 10), perceptual. For "louder"/"quieter". */
  const adjustVolume = useCallback((delta: number) => {
    setVolume(volumeRef.current + delta);
  }, [setVolume]);

  /** Mute/unmute: zero the gain but remember the level so unmute restores it. */
  const setMuted = useCallback((m: boolean) => {
    if (m) {
      if (volumeRef.current > 0) lastLevelRef.current = volumeRef.current;
      setMutedState(true);
      setVolumeState(0);
      applyVolume(0, false); // don't persist a muted 0 as the preferred level
    } else {
      const restore = lastLevelRef.current || 80;
      setMutedState(false);
      setVolumeState(restore);
      applyVolume(restore);
    }
  }, [applyVolume]);

  // ------------------------------------------------------------------------
  // WebSocket open / connect
  // ------------------------------------------------------------------------
  const openSocket = useCallback(
    (url: string) => {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        const cfg = connectCfgRef.current;
        ws.send(
          JSON.stringify({
            type: 'connect',
            // The user's JWT so the server runs this session as them (their
            // memory + their connected integrations). Omitted = server default.
            ...(cfg.authToken ? { authToken: cfg.authToken } : {}),
            config: {
              voiceName: cfg.voiceName,
              mode: cfg.mode,
              ...(cfg.systemOverlay
                ? { systemOverlay: cfg.systemOverlay }
                : {}),
              ...(cfg.stylePrompt ? { stylePrompt: cfg.stylePrompt } : {}),
            },
          }),
        );
        setConnected(true);
      };
      ws.onmessage = (ev: MessageEvent) => {
        let parsed: RelayMessage | null = null;
        try {
          parsed = JSON.parse(ev.data) as RelayMessage;
        } catch {
          return;
        }
        if (parsed) handleRelayMessage(parsed);
      };
      ws.onerror = () => {
        /* keep alive; surfaced via connected=false on close */
      };
      ws.onclose = () => {
        setConnected(false);
      };
    },
    [handleRelayMessage],
  );

  // ------------------------------------------------------------------------
  // Public: start
  // ------------------------------------------------------------------------
  const start = useCallback(async () => {
    const url = serverWs ?? resolveDefaultWs();

    // Mic first so permission prompt happens before we open the socket.
    const md = (
      navigator as unknown as {
        mediaDevices?: {
          getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
        };
      }
    ).mediaDevices;
    if (md?.getUserMedia) {
      // Request the browser's built-in echo cancellation + noise suppression +
      // auto-gain so steady background noise (fans, traffic, hum, room echo) is
      // filtered before it ever reaches us or Gemini. Fall back to plain audio
      // if the constraints aren't supported.
      let stream: MediaStream;
      try {
        stream = await md.getUserMedia(MIC_CONSTRAINTS);
      } catch {
        stream = await md.getUserMedia({ audio: true });
      }
      streamRef.current = stream;
      wantMicRef.current = true;
      setMicOn(true);
      wireMic(stream);
    }

    wirePlayback();
    openSocket(url);
  }, [serverWs, wireMic, wirePlayback, openSocket]);

  // ------------------------------------------------------------------------
  // Teardown (used by stop, setVoice, unmount)
  // ------------------------------------------------------------------------
  const teardown = useCallback(
    (opts2?: { keepTranscript?: boolean }) => {
      // Stop rAF loop.
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Commit any in-progress lines so nothing is lost on stop.
      hardFinalizeRef.current('you');
      hardFinalizeRef.current('nicole');

      // Stop and clear playback.
      stopPlayback();

      // Close socket. If it's still CONNECTING, calling close() now aborts the
      // handshake ("WebSocket is closed before the connection is established").
      // Defer the close until it opens so the abort is clean either way.
      const ws = wsRef.current;
      if (ws) {
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => {
            try {
              ws.close();
            } catch {
              /* ignore */
            }
          };
        } else {
          ws.onopen = null;
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        }
        wsRef.current = null;
      }

      // Stop mic tracks.
      const stream = streamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
        streamRef.current = null;
      }

      // Disconnect nodes.
      if (processorRef.current) {
        processorRef.current.onaudioprocess = null;
        try {
          processorRef.current.disconnect();
        } catch {
          /* ignore */
        }
        processorRef.current = null;
      }
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect();
        } catch {
          /* ignore */
        }
        sourceNodeRef.current = null;
      }
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch {
          /* ignore */
        }
        analyserRef.current = null;
      }

      // Close audio contexts.
      const micCtx = micCtxRef.current;
      if (micCtx) {
        try {
          void micCtx.close();
        } catch {
          /* ignore */
        }
        micCtxRef.current = null;
      }
      const playCtx = playCtxRef.current;
      if (playCtx) {
        try {
          void playCtx.close();
        } catch {
          /* ignore */
        }
        playCtxRef.current = null;
      }

      queueRef.current.flush();

      setConnected(false);
      setMicOn(false);
      setAmplitude(0);
      if (!opts2?.keepTranscript) {
        // start() does not clear transcript by default; stop() leaves it.
      }
    },
    [stopPlayback],
  );

  // ------------------------------------------------------------------------
  // Public: stop
  // ------------------------------------------------------------------------
  const stop = useCallback(() => {
    teardown({ keepTranscript: true });
  }, [teardown]);

  /** Wipe the on-screen transcript (e.g. after ending a session). Durable facts
   *  are already persisted to memory live by Nicole's save_memory tool, so the
   *  visible chat can be cleared without losing anything important. */
  const clearTranscript = useCallback(() => {
    realtimeRef.current.you = '';
    realtimeRef.current.nicole = '';
    setRealtime({ you: '', nicole: '' });
    setTranscript([]);
  }, []);

  // ------------------------------------------------------------------------
  // Public: toggleMic
  // ------------------------------------------------------------------------
  const toggleMic = useCallback(() => {
    const stream = streamRef.current;
    setMicOn((prev) => {
      const nextOn = !prev;
      wantMicRef.current = nextOn;
      if (stream) {
        for (const track of stream.getTracks()) track.enabled = nextOn;
      }
      return nextOn;
    });
  }, []);

  // ------------------------------------------------------------------------
  // Public: setVoice (reconnect with new voice, preserving transcript)
  // ------------------------------------------------------------------------
  const setVoice = useCallback(
    (v: string) => {
      voiceRef.current = v;
      connectCfgRef.current = { ...connectCfgRef.current, voiceName: v };
      // Queue a one-shot confirmation so Nicole speaks in the NEW voice as soon
      // as the reconnect is ready — without this the turn is dropped and she
      // stays silent until the user speaks again.
      pendingReadyDirectiveRef.current =
        '[VOICE CHANGED] Your voice has just been switched. In one short, warm line, confirm the change out loud now (e.g. "How does this voice sound?") so the user hears the new voice. Do not wait for them to speak first.';

      // Tear down socket + audio but keep mic stream and transcript so the
      // reconnect is seamless.
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      stopPlayback();

      const oldWs = wsRef.current;
      if (oldWs) {
        oldWs.onopen = null;
        oldWs.onmessage = null;
        oldWs.onerror = null;
        oldWs.onclose = null;
        try {
          oldWs.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }

      const playCtx = playCtxRef.current;
      if (playCtx) {
        try {
          void playCtx.close();
        } catch {
          /* ignore */
        }
        playCtxRef.current = null;
      }
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch {
          /* ignore */
        }
        analyserRef.current = null;
      }

      // Re-open playback + socket with the new voice.
      wirePlayback();
      openSocket(serverWs ?? resolveDefaultWs());
    },
    [stopPlayback, wirePlayback, openSocket, serverWs],
  );

  // ------------------------------------------------------------------------
  // Unmount cleanup
  // ------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      teardown({ keepTranscript: true });
      // Cancel any pending afterNextModelTurn safety timers so they never fire
      // into a torn-down session.
      for (const t of afterTurnTimersRef.current) clearTimeout(t);
      afterTurnTimersRef.current = [];
      afterTurnCbsRef.current = [];
    };
    // teardown is stable (useCallback) — run cleanup only on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendText = useCallback((text: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && text) {
      ws.send(JSON.stringify({ type: 'client-text', text }));
    }
  }, []);

  const sendVideoFrame = useCallback((base64Jpeg: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && base64Jpeg) {
      ws.send(
        JSON.stringify({
          type: 'client-msg',
          payload: { video: { data: base64Jpeg, mimeType: 'image/jpeg' } },
        }),
      );
    }
  }, []);

  /** Invoke `cb` once Nicole's current utterance is complete (turnComplete).
   *  If she is not currently speaking, fires immediately. A 6-second safety
   *  timeout ensures the callback always fires even if turnComplete is never
   *  received (e.g. network drop mid-stream). */
  const afterNextModelTurn = useCallback((cb: () => void) => {
    if (!nicoleSpeakingRef.current) { cb(); return; }
    afterTurnCbsRef.current.push(cb);
    // Safety cap: never wait more than 6s. The timer id is tracked so the
    // turn-end drain (or unmount) can cancel it — preventing a stale fire.
    const timer = setTimeout(() => {
      const ti = afterTurnTimersRef.current.indexOf(timer);
      if (ti >= 0) afterTurnTimersRef.current.splice(ti, 1);
      const i = afterTurnCbsRef.current.indexOf(cb);
      if (i >= 0) { afterTurnCbsRef.current.splice(i, 1); try { cb(); } catch { /* ignore */ } }
    }, 6000);
    afterTurnTimersRef.current.push(timer);
  }, []);

  return {
    connected,
    micOn,
    transcript,
    realtime,
    amplitude,
    start,
    stop,
    clearTranscript,
    toggleMic,
    setVoice,
    sendText,
    sendVideoFrame,
    volume,
    muted,
    setVolume,
    adjustVolume,
    setMuted,
    afterNextModelTurn,
  };
}

/** Keep only the most recent MAX_TRANSCRIPT_LINES lines. */
function capLines(lines: TranscriptLine[]): TranscriptLine[] {
  if (lines.length <= MAX_TRANSCRIPT_LINES) return lines;
  return lines.slice(lines.length - MAX_TRANSCRIPT_LINES);
}
