import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNicoleSession } from '../engine/useNicoleSession';
import { useAuth } from '../auth/AuthContext';
import type { TranscriptLine } from '../engine/types';
import { DEFAULT_VOICE } from '../audio/voices';
import { buildPhasePrompt, buildProspectOverlay, type ClientLessonSpec } from './lessonPrompts';
import { advancePhase, type Phase } from './phaseMachine';
import { shouldAdvancePhase, AUTO_PHASES, type AdvanceSignals } from './phaseAdvance';
import { requestScore, type Scorecard, type ResultLine, type DimensionInput } from './scoreApi';

/**
 * A single silent scoring entry produced by Nicole's `training_mark_progress`
 * tool during practice / roleplay. Drives the on-screen scorecard; never spoken.
 */
export interface ScoreEntry {
  /** The framework move the learner was attempting (e.g. "Acknowledge"). */
  dimension: string;
  /** Whether they hit the move. */
  hit: boolean;
  /** A short performance tip shown on the scorecard. */
  tip: string;
}

export interface UseCoachingSessionOptions {
  /** The authored lesson Nicole delivers. */
  lesson: ClientLessonSpec;
  /** Voice for the coach (Nicole). Defaults to DEFAULT_VOICE. */
  coachVoice?: string;
  /** Voice for the roleplay other-party. Defaults to 'Charon'. */
  prospectVoice?: string;
}

export interface UseCoachingSessionResult {
  /** Current training phase. */
  phase: Phase;
  /** Silent scoring entries accumulated this session. */
  scorecard: ScoreEntry[];
  /** Full judge scorecard produced after finishPractice; null until then. */
  scorecardResult: Scorecard | null;
  /** Frozen transcript of the practice run (rep + user lines). */
  practiceTranscript: ResultLine[];
  /** Coach (Nicole) audio amplitude — drives the avatar lip-sync. */
  coachAmplitude: number;
  /** Coach conversation transcript. */
  coachTranscript: TranscriptLine[];
  /** In-progress (realtime) coach speech — for live bubble display. */
  coachRealtime: { you: string; nicole: string };
  /**
   * The transcript to SHOW right now. During the live rep this is the PROSPECT's
   * conversation (a separate voice/session); in every other phase it is the
   * coach's. The screen renders this directly so the prospect's lines are
   * actually transcribed during the rep (they were not before — only the coach's
   * transcript was ever shown, which dropped the prospect's voice and mislabeled
   * the coach as "Prospect").
   */
  activeTranscript: TranscriptLine[];
  /** In-progress (realtime) speech for the ACTIVE speaker (prospect in the rep). */
  activeRealtime: { you: string; nicole: string };
  /** Amplitude of the ACTIVE speaker (prospect in the rep) — drives lip-sync/pulse. */
  activeAmplitude: number;
  /** Whether the live rep (prospect-only session) is currently active. */
  inLiveRep: boolean;
  /** Begin the session (starts the coach; prospect starts only in roleplay). */
  start: () => Promise<void>;
  /** End the session — stops BOTH the coach and the prospect. */
  stop: () => void;
  /** Advance to the next phase (gated by phaseMachine engagement signals). */
  advance: () => void;
  /** Jump straight to the live rep, skipping any remaining teaching phases.
   *  The learner asked to go live now — honor it, no gatekeeping. */
  goLive: () => void;
  /** Append a silent scoring entry (what training_mark_progress would call). */
  markProgress: (entry: ScoreEntry) => void;
  /** Freeze the practice transcript, score it via the judge, and move to debrief. */
  finishPractice: () => Promise<void>;
  /** Return to roleplay_demo for another practice attempt. */
  replayPractice: () => void;
  /** Return to the model phase to re-teach the skill before practising again. */
  reteach: () => void;
  /** @internal escape hatch used by tests to set phase directly. */
  _setPhase?: (phase: Phase) => void;
}

/** The phase whose roleplay needs the second (prospect) voice. */
const ROLEPLAY_PHASE: Phase = 'roleplay_demo';

// ── Scoring helpers ─────────────────────────────────────────────────────────
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'move';

const lessonDimensions = (lesson: ClientLessonSpec): DimensionInput[] =>
  lesson.coreFramework.moves.map((m) => ({ id: slugify(m.step), label: m.step, rubric: m.intent || m.step }));

/** Default voice for the roleplay other-party — a distinct, grounded male voice. */
const DEFAULT_PROSPECT_VOICE = 'Charon';

/** Silent opener so the COACH (Nicole) takes charge and speaks first, rather
 *  than the learner having to break the ice. */
const COACH_OPEN_DIRECTIVE =
  '[OPEN] You are the coach and you lead. Open the session yourself in one warm, brief line, name the skill we are working on from your overlay, and tell the learner what we will do first, then invite them to begin. Do not wait for them to speak first.';

/** Silent opener for the live-rep PROSPECT so the character starts the scene in
 *  character (answers the phone / opens the conversation), like Roleplay mode. */
const PROSPECT_OPEN_DIRECTIVE =
  '[OPEN] Open the scene briefly IN CHARACTER and pull the user in — one short line (e.g. answer the phone, or open the conversation), then wait for their response. Do not explain that this is a role-play. Do not coach.';

/**
 * Orchestrates a two-voice coaching session.
 *
 * A COACH session (mode 'coach') is always active and drives the avatar; its
 * `systemOverlay` is the per-phase prompt for the current phase, rebuilt and
 * reconnected whenever the phase changes. A PROSPECT session (mode 'prospect')
 * is only connected during the live roleplay phase.
 *
 * `markProgress` records silent scoring entries (the `training_mark_progress`
 * tool's payload) into the scorecard; they are never spoken. `stop()` tears down
 * both sessions so nothing leaks.
 */
export function useCoachingSession(
  opts: UseCoachingSessionOptions,
): UseCoachingSessionResult {
  const { lesson, coachVoice = DEFAULT_VOICE, prospectVoice = DEFAULT_PROSPECT_VOICE } =
    opts;

  const [phase, setPhase] = useState<Phase>('intro');
  const [scorecard, setScorecard] = useState<ScoreEntry[]>([]);
  const [scorecardResult, setScorecardResult] = useState<Scorecard | null>(null);
  const [practiceTranscript, setPracticeTranscript] = useState<ResultLine[]>([]);
  const { token } = useAuth();

  // The coach overlay is fully derived from lesson + phase.
  const coachOverlay = useMemo(
    () => buildPhasePrompt(lesson, phase, null),
    [lesson, phase],
  );
  // Mirror the overlay + track which one the live coach session is connected with,
  // so the reconnect effect only reconnects on a REAL phase change (not on the
  // initial connect, which would strand the [OPEN] and stick the room).
  const coachOverlayRef = useRef(coachOverlay);
  coachOverlayRef.current = coachOverlay;
  const reconnectOverlaySeenRef = useRef<string | null>(null);

  // Forward ref so the onToolCall closure below can always call the latest
  // markProgress without capturing a stale closure — markProgress is defined
  // further below, after this hook call.
  const markProgressRef = useRef<(e: ScoreEntry) => void>(() => {});

  // COACH — always active, drives the avatar.
  const coach = useNicoleSession({
    voiceName: coachVoice,
    mode: 'coach',
    systemOverlay: coachOverlay,
    authToken: token,
    onToolCall: (calls) => {
      for (const c of calls) {
        if (c.name === 'training_mark_progress' && c.args) {
          const a = c.args as { dimension?: unknown; hit?: unknown; tip?: unknown };
          markProgressRef.current({
            dimension: String(a.dimension ?? ''),
            hit: !!a.hit,
            tip: String(a.tip ?? ''),
          });
        }
      }
    },
  });

  // PROSPECT — only connected during the live rep. It is a fully in-character
  // other-party (a DIFFERENT voice from Nicole), exactly like Roleplay mode — NOT
  // the coach, NOT silent. Its overlay is the dedicated prospect overlay (the old
  // code mistakenly fed it the coach's "be silent" phase prompt).
  const prospect = useNicoleSession({
    voiceName: prospectVoice,
    mode: 'prospect',
    systemOverlay: buildProspectOverlay(lesson),
    authToken: token,
  });

  // Track whether the session has been started so phase-change effects only
  // (re)connect after the user has begun — not on the initial render.
  const startedRef = useRef(false);
  const prospectActiveRef = useRef(false);

  // Keep stable refs to the session start/stop so effects don't churn on every
  // re-render (useNicoleSession returns fresh closures each render).
  const coachStartRef = useRef(coach.start);
  const coachStopRef = useRef(coach.stop);
  const prospectStartRef = useRef(prospect.start);
  const prospectStopRef = useRef(prospect.stop);
  const coachSendTextRef = useRef(coach.sendText);
  const prospectSendTextRef = useRef(prospect.sendText);
  coachStartRef.current = coach.start;
  coachStopRef.current = coach.stop;
  prospectStartRef.current = prospect.start;
  prospectStopRef.current = prospect.stop;
  coachSendTextRef.current = coach.sendText;
  prospectSendTextRef.current = prospect.sendText;
  // Fire the coach opener once per connect so Nicole speaks first.
  const sentCoachOpenRef = useRef(false);
  // Fire the prospect opener once when the rep session connects so the character
  // answers/greets first IN CHARACTER (the user takes the call), like Roleplay.
  const sentProspectOpenRef = useRef(false);

  // ── Auto-advance evaluator refs ─────────────────────────────────────────
  // Mirror phase/scorecard so the stable evaluate callback reads fresh values.
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const scorecardRef = useRef(scorecard);
  scorecardRef.current = scorecard;

  // Phase-entry tracking (reset on phase change).
  const phaseEnteredAtRef = useRef<number>(Date.now());
  const userTurnsThisPhaseRef = useRef(0);
  const litAtPhaseStartRef = useRef(0);
  const lastUserLineCountRef = useRef(0);

  // Mirror afterNextModelTurn so the stable phase-change effect reads the
  // latest version without re-subscribing.
  const coachAfterTurnRef = useRef(coach.afterNextModelTurn);
  coachAfterTurnRef.current = coach.afterNextModelTurn;

  const start = useCallback(async () => {
    startedRef.current = true;
    // Fresh session → allow the one-shot opener to fire on this connect.
    sentCoachOpenRef.current = false;
    // Record the overlay we're connecting WITH so the reconnect effect doesn't
    // immediately reconnect (which stranded the [OPEN] and stuck the room).
    reconnectOverlaySeenRef.current = coachOverlayRef.current;
    await coachStartRef.current();
  }, []);

  const stop = useCallback(() => {
    startedRef.current = false;
    coachStopRef.current();
    if (prospectActiveRef.current) {
      prospectStopRef.current();
      prospectActiveRef.current = false;
    } else {
      // Stop defensively even if we never marked it active.
      prospectStopRef.current();
    }
  }, []);

  const advance = useCallback(() => {
    // The UI "advance" control reflects an engaged learner, so signal enough
    // turns to clear the phaseMachine gate.
    setPhase((cur) => advancePhase(cur, { learnerTurns: 2 }));
  }, []);

  // Skip straight to the live rep. The learner explicitly asked to go live, so we
  // honor it immediately — no engagement gate, no "let's practice once more". Only
  // valid from a pre-rep phase; once at debrief we don't bounce back.
  const goLive = useCallback(() => {
    setPhase((cur) => (cur === 'debrief' || cur === ROLEPLAY_PHASE ? cur : ROLEPLAY_PHASE));
  }, []);

  const markProgress = useCallback((entry: ScoreEntry) => {
    setScorecard((prev) => [...prev, entry]);
  }, []);
  // Keep the forward ref current so the onToolCall closure always calls the
  // latest version of markProgress (avoids a stale-closure on the hook above).
  markProgressRef.current = markProgress;

  const buildPracticeTranscript = useCallback((): ResultLine[] => {
    // During the live rep the PROSPECT session is the only one live, so it
    // captures the WHOLE back-and-forth: the user's mic ('you') AND the prospect's
    // replies ('nicole'). So the rep transcript comes entirely from the prospect
    // session. (Previously the coach session was kept alive to capture the user's
    // 'you' lines — but that dual-session design is exactly what caused the role
    // confusion; the coach is now stopped for the rep.)
    //
    // Line ids are `l<base36-time>_<N>` with N a module-global monotonic counter,
    // so sorting by that trailing sequence restores true chronological order.
    const seq = (id: string): number => {
      const n = Number(id.slice(id.lastIndexOf('_') + 1));
      return Number.isFinite(n) ? n : 0;
    };
    const merged = prospect.transcript
      .filter((l) => l.speaker === 'you' || l.speaker === 'nicole')
      .map((l) => ({
        id: l.id,
        speaker: (l.speaker === 'you' ? 'you' : 'rep') as 'you' | 'rep',
        text: l.text,
      }))
      .sort((a, b) => seq(a.id) - seq(b.id));
    return merged.map(({ speaker, text }) => ({ speaker, text }));
  }, [prospect.transcript]);

  const finishPractice = useCallback(async () => {
    const transcript = buildPracticeTranscript();
    const dims = lessonDimensions(lesson);
    let sc: Scorecard;
    try {
      sc = await requestScore({ kind: 'training', dimensions: dims, transcript }, token ?? undefined);
    } catch {
      sc = {
        overallScore: 0,
        band: 'needs_work',
        scores: dims.map((d) => ({ dimensionId: d.id, label: d.label, score: 0 as const, band: 'missing' as const, rationale: 'Could not grade.', evidenceQuote: null })),
        signals: { talkRatioPct: 0, questionCount: 0, longestMonologueWords: 0 },
        headline: 'Could not grade that run.',
        worked: { note: '', quote: null },
        fix: { note: 'Try again.', quote: null, why: '' },
        nextTime: 'Run it again.',
        spoken: 'Let us run that again.',
      };
    }
    setPracticeTranscript(transcript);
    setScorecardResult(sc);
    if (prospectActiveRef.current) {
      prospectStopRef.current();
      prospectActiveRef.current = false;
    }
    setPhase('debrief');
  }, [buildPracticeTranscript, lesson, token]);

  const replayPractice = useCallback(() => { setPhase('roleplay_demo'); }, []);
  const reteach = useCallback(() => { setPhase('model'); }, []);

  // Reset phase-tracking counters whenever the phase changes.
  useEffect(() => {
    phaseEnteredAtRef.current = Date.now();
    userTurnsThisPhaseRef.current = 0;
    litAtPhaseStartRef.current = scorecardRef.current.length;
    // lastUserLineCountRef intentionally NOT reset: it tracks total committed
    // 'you' lines in the coach transcript across phases so the delta logic stays
    // correct when the hook re-renders with a new phase.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Count substantive user turns from the committed coach transcript.
  useEffect(() => {
    const youLines = coach.transcript.filter((l) => l.speaker === 'you').length;
    const delta = youLines - lastUserLineCountRef.current;
    if (delta > 0) {
      userTurnsThisPhaseRef.current += delta;
    }
    lastUserLineCountRef.current = youLines;
  }, [coach.transcript]);

  // App-driven evaluator: advance the phase when engagement/time signals are met.
  const evaluate = useCallback(() => {
    if (!startedRef.current) return;
    const ph = phaseRef.current;
    if (!AUTO_PHASES.includes(ph)) return;
    const signals: AdvanceSignals = {
      turns: userTurnsThisPhaseRef.current,
      litDelta: scorecardRef.current.length - litAtPhaseStartRef.current,
      timeInPhaseMs: Date.now() - phaseEnteredAtRef.current,
    };
    if (shouldAdvancePhase(ph, signals)) {
      // Force advance by signalling more than enough learner turns.
      setPhase((cur) => {
        const next = advancePhase(cur, { learnerTurns: 99 });
        // Eagerly update the ref so subsequent evaluator ticks (within the same
        // fake-timer sweep or batch) see the new phase and don't double-advance.
        phaseRef.current = next;
        // Reset the phase-entry tracking now (mirrors the [phase] effect) so
        // the next phase's clock starts clean even before React re-renders.
        phaseEnteredAtRef.current = Date.now();
        userTurnsThisPhaseRef.current = 0;
        litAtPhaseStartRef.current = scorecardRef.current.length;
        return next;
      });
    }
  }, []);

  // Run evaluate on a 2s interval (catches time-ceiling advances when idle).
  useEffect(() => {
    const id = setInterval(evaluate, 2000);
    return () => clearInterval(id);
  }, [evaluate]);

  // Also run evaluate immediately when transcript or scorecard changes.
  useEffect(() => { evaluate(); }, [coach.transcript, scorecard, evaluate]);

  // When the phase changes (after start), tell the coach the new phase's
  // instructions over the SAME live session — as a silent [PHASE] directive,
  // NOT by reconnecting. Reconnecting on every phase change tore the Gemini
  // socket down mid-conversation, which dropped/garbled the user's mic audio and
  // corrupted transcription (this is exactly why training transcribed worse than
  // roleplay, which never reconnects). Deferred via afterNextModelTurn so we don't
  // cut Nicole off mid-sentence.
  //
  // EXCEPTION: the live rep (roleplay_demo) is handled by the dedicated session-
  // swap effect below, NOT here — during the rep the coach is fully torn down so
  // only the prospect is live (one mic → one responder). Sending the coach a
  // [PHASE] directive for roleplay_demo would be pointless (she's stopped) and
  // sending one for debrief is also skipped here because the coach is RESTARTED
  // fresh for debrief (it carries its own [PHASE] kick — see the swap effect).
  //
  // Skip the FIRST overlay value — start() already connected with the intro
  // overlay and the [OPEN] directive handles the opening.
  useEffect(() => {
    if (!startedRef.current) return;
    if (reconnectOverlaySeenRef.current === coachOverlay) return;
    reconnectOverlaySeenRef.current = coachOverlay;
    // The rep and the debrief boundary are owned by the session-swap effect.
    if (phaseRef.current === ROLEPLAY_PHASE || phaseRef.current === 'debrief') return;
    const directive = `[PHASE] The lesson has moved to its next phase. Follow these instructions for what to do now, continuing the SAME conversation naturally (do not greet again):\n${coachOverlay}`;
    coachAfterTurnRef.current(() => { coachSendTextRef.current(directive); });
  }, [coachOverlay]);

  // ── Live-rep session swap ────────────────────────────────────────────────
  // The live rep must feel like a REAL call with one other person — exactly like
  // Roleplay mode, which works. The previous design kept the COACH session live
  // during the rep and merely told her (via prompt) to "stay silent", while ALSO
  // bringing the prospect up. That left TWO live sessions, each with its own mic
  // capture: both heard the user and both replied (two voices), the coach kept
  // answering as a salesperson, and only the coach's transcript was ever shown so
  // the prospect's lines were never transcribed. The real fix is a hard SWAP:
  //
  //   • Entering roleplay_demo  → STOP the coach entirely; START the prospect.
  //     Now there is ONE live session (the prospect) with ONE mic — clean audio,
  //     correct transcription, no role bleed.
  //   • Leaving roleplay_demo   → STOP the prospect; RESTART the coach so she can
  //     deliver the debrief. (finishPractice already stops the prospect and moves
  //     to 'debrief'; this effect restarts the coach for that phase.)
  useEffect(() => {
    if (!startedRef.current) return;
    if (phase === ROLEPLAY_PHASE) {
      // Hand the floor to the prospect: tear the coach down so she can't hear the
      // mic or respond, then bring the prospect up. The coach teardown stops its
      // mic tracks + closes its AudioContexts; we start the prospect on the NEXT
      // tick so the browser has released the mic device before the prospect calls
      // getUserMedia (starting both in the same synchronous tick made the second
      // getUserMedia hang on a device-busy race → the prospect never connected).
      coachStopRef.current();
      if (!prospectActiveRef.current) {
        prospectActiveRef.current = true;
        sentProspectOpenRef.current = false; // allow the opener to fire on connect
        // Defer the prospect's getUserMedia to the next tick so the browser has
        // released the mic from the coach teardown (same-tick re-grab hung).
        // NOTE: do NOT return a cleanup that clears this timer — in React
        // StrictMode the effect mounts → cleans up → re-mounts, which would cancel
        // the only scheduled start and the prospect would never connect. The
        // prospectActiveRef guard already prevents a double start.
        setTimeout(() => {
          if (prospectActiveRef.current) void prospectStartRef.current();
        }, 250);
      }
    } else {
      // Any non-rep phase: ensure the prospect is down.
      if (prospectActiveRef.current) {
        prospectActiveRef.current = false;
        prospectStopRef.current();
      }
      // Returning to a coach-led phase AFTER the rep (i.e. debrief): the coach was
      // torn down for the rep, so restart her and kick her with this phase's
      // overlay so she opens the debrief herself.
      if (phase === 'debrief' && !coach.connected) {
        reconnectOverlaySeenRef.current = coachOverlayRef.current;
        const overlayNow = coachOverlayRef.current;
        void coachStartRef.current().then(() => {
          // After reconnect, kick her into the debrief (the [OPEN]-style nudge).
          coachAfterTurnRef.current(() => {
            coachSendTextRef.current(
              `[PHASE] ${overlayNow}\n\nOpen the debrief now in your own words — do not greet again.`,
            );
          });
        });
      }
    }
  // coach.connected intentionally omitted: we only react to phase transitions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Nicole-first: fire the silent opener ONCE per session, on the first connect,
  // so she takes charge and greets/sets up the drill. It must NOT re-fire on the
  // disconnect→reconnect cycles that happen on every phase change (else she would
  // re-introduce herself at each phase boundary). `sentCoachOpenRef` is reset only
  // in start() (a genuine new session), never on a transient disconnect.
  useEffect(() => {
    if (coach.connected && startedRef.current && !sentCoachOpenRef.current) {
      sentCoachOpenRef.current = true;
      const t = setTimeout(() => coachSendTextRef.current(COACH_OPEN_DIRECTIVE), 500);
      return () => clearTimeout(t);
    }
  }, [coach.connected]);

  // Prospect-first: when the rep session connects, fire its opener ONCE so the
  // character starts the scene in character (exactly like Roleplay's [OPEN]).
  useEffect(() => {
    if (prospect.connected && prospectActiveRef.current && !sentProspectOpenRef.current) {
      sentProspectOpenRef.current = true;
      const t = setTimeout(() => prospectSendTextRef.current(PROSPECT_OPEN_DIRECTIVE), 500);
      return () => clearTimeout(t);
    }
    if (!prospect.connected) sentProspectOpenRef.current = false;
  }, [prospect.connected]);

  // Unmount safety: stop both sessions if still active.
  useEffect(() => {
    return () => {
      coachStopRef.current();
      prospectStopRef.current();
    };
  }, []);

  const inLiveRep = phase === ROLEPLAY_PHASE;

  return {
    phase,
    scorecard,
    scorecardResult,
    practiceTranscript,
    coachAmplitude: coach.amplitude,
    coachTranscript: coach.transcript,
    coachRealtime: coach.realtime,
    // During the live rep the prospect is the only live session, so SHOW its
    // transcript/realtime/amplitude; otherwise show the coach's.
    activeTranscript: inLiveRep ? prospect.transcript : coach.transcript,
    activeRealtime: inLiveRep ? prospect.realtime : coach.realtime,
    activeAmplitude: inLiveRep ? prospect.amplitude : coach.amplitude,
    inLiveRep,
    start,
    stop,
    advance,
    goLive,
    markProgress,
    finishPractice,
    replayPractice,
    reteach,
    // Test-only escape hatch — stripped from production bundles so app code can't
    // bypass the phase-machine gates through it.
    _setPhase:
      process.env.NODE_ENV !== 'production'
        ? (setPhase as (phase: Phase) => void)
        : undefined,
  };
}
