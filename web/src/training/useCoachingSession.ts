import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNicoleSession } from '../engine/useNicoleSession';
import { useAuth } from '../auth/AuthContext';
import type { TranscriptLine } from '../engine/types';
import { DEFAULT_VOICE } from '../audio/voices';
import { buildPhasePrompt, type ClientLessonSpec } from './lessonPrompts';
import { advancePhase, type Phase } from './phaseMachine';
import { shouldAdvancePhase, AUTO_PHASES, type AdvanceSignals } from './phaseAdvance';

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
  /** Coach (Nicole) audio amplitude — drives the avatar lip-sync. */
  coachAmplitude: number;
  /** Coach conversation transcript. */
  coachTranscript: TranscriptLine[];
  /** In-progress (realtime) coach speech — for live bubble display. */
  coachRealtime: { you: string; nicole: string };
  /** Begin the session (starts the coach; prospect starts only in roleplay). */
  start: () => Promise<void>;
  /** End the session — stops BOTH the coach and the prospect. */
  stop: () => void;
  /** Advance to the next phase (gated by phaseMachine engagement signals). */
  advance: () => void;
  /** Append a silent scoring entry (what training_mark_progress would call). */
  markProgress: (entry: ScoreEntry) => void;
}

/** The phase whose roleplay needs the second (prospect) voice. */
const ROLEPLAY_PHASE: Phase = 'roleplay_demo';

/** Default voice for the roleplay other-party — a distinct, grounded male voice. */
const DEFAULT_PROSPECT_VOICE = 'Charon';

/** Silent opener so the COACH (Nicole) takes charge and speaks first, rather
 *  than the learner having to break the ice. */
const COACH_OPEN_DIRECTIVE =
  '[OPEN] You are the coach and you lead. Open the session yourself in one warm, brief line, name the skill we are working on from your overlay, and tell the learner what we will do first, then invite them to begin. Do not wait for them to speak first.';

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
  const { token } = useAuth();

  // The coach overlay is fully derived from lesson + phase.
  const coachOverlay = useMemo(
    () => buildPhasePrompt(lesson, phase, null),
    [lesson, phase],
  );

  // COACH — always active, drives the avatar.
  const coach = useNicoleSession({
    voiceName: coachVoice,
    mode: 'coach',
    systemOverlay: coachOverlay,
    authToken: token,
  });

  // PROSPECT — only connected during the roleplay phase. The overlay is the
  // roleplay phase prompt (the same prompt also instructs the coach to go silent).
  const prospect = useNicoleSession({
    voiceName: prospectVoice,
    mode: 'prospect',
    systemOverlay: buildPhasePrompt(lesson, ROLEPLAY_PHASE, null),
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
  coachStartRef.current = coach.start;
  coachStopRef.current = coach.stop;
  prospectStartRef.current = prospect.start;
  prospectStopRef.current = prospect.stop;
  coachSendTextRef.current = coach.sendText;
  // Fire the coach opener once per connect so Nicole speaks first.
  const sentCoachOpenRef = useRef(false);

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

  const markProgress = useCallback((entry: ScoreEntry) => {
    setScorecard((prev) => [...prev, entry]);
  }, []);

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

  // When the phase changes (after start), reconnect the coach so the backend
  // receives the new phase overlay. Deferred via afterNextModelTurn so Nicole
  // isn't cut off mid-sentence when the phase boundary fires.
  useEffect(() => {
    if (!startedRef.current) return;
    coachAfterTurnRef.current(() => { void coachStartRef.current(); });
    // coachOverlay is the meaningful trigger; re-run when it changes.
  }, [coachOverlay]);

  // Bring the prospect session up only during the roleplay phase, and tear it
  // down when leaving (or on unmount).
  useEffect(() => {
    if (!startedRef.current) return;
    if (phase === ROLEPLAY_PHASE) {
      if (!prospectActiveRef.current) {
        prospectActiveRef.current = true;
        void prospectStartRef.current();
      }
    } else if (prospectActiveRef.current) {
      prospectActiveRef.current = false;
      prospectStopRef.current();
    }
  }, [phase]);

  // Nicole-first: once the coach session connects, fire a silent opener so she
  // takes charge and greets/sets up the drill, instead of waiting for the user.
  useEffect(() => {
    if (coach.connected && startedRef.current && !sentCoachOpenRef.current) {
      sentCoachOpenRef.current = true;
      const t = setTimeout(() => coachSendTextRef.current(COACH_OPEN_DIRECTIVE), 500);
      return () => clearTimeout(t);
    }
    if (!coach.connected) sentCoachOpenRef.current = false;
  }, [coach.connected]);

  // Unmount safety: stop both sessions if still active.
  useEffect(() => {
    return () => {
      coachStopRef.current();
      prospectStopRef.current();
    };
  }, []);

  return {
    phase,
    scorecard,
    coachAmplitude: coach.amplitude,
    coachTranscript: coach.transcript,
    coachRealtime: coach.realtime,
    start,
    stop,
    advance,
    markProgress,
  };
}
