import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNicoleSession } from '../engine/useNicoleSession';
import type { TranscriptLine } from '../engine/types';
import { DEFAULT_VOICE } from '../audio/voices';
import { buildPhasePrompt, type ClientLessonSpec } from './lessonPrompts';
import { advancePhase, type Phase } from './phaseMachine';

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
  });

  // PROSPECT — only connected during the roleplay phase. The overlay is the
  // roleplay phase prompt (the same prompt also instructs the coach to go silent).
  const prospect = useNicoleSession({
    voiceName: prospectVoice,
    mode: 'prospect',
    systemOverlay: buildPhasePrompt(lesson, ROLEPLAY_PHASE, null),
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
  coachStartRef.current = coach.start;
  coachStopRef.current = coach.stop;
  prospectStartRef.current = prospect.start;
  prospectStopRef.current = prospect.stop;

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

  // When the phase changes (after start), reconnect the coach so the backend
  // receives the new phase overlay. useNicoleSession reads systemOverlay from a
  // ref on each connect, so a fresh start() picks up the updated overlay.
  useEffect(() => {
    if (!startedRef.current) return;
    void coachStartRef.current();
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
    start,
    stop,
    advance,
    markProgress,
  };
}
