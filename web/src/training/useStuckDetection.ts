import { useEffect, useRef, useState } from 'react';
import type { TranscriptLine } from '../engine/types';

/**
 * TRAINING-ONLY. Watches the live rep (the prospect transcript) for moments where
 * the learner seems STUCK, so the screen can surface a short on-screen coaching
 * tip from Nicole — WITHOUT any extra Gemini session or voice (purely client-side
 * heuristics on signals we already have). Never used in pure Roleplay.
 */
export type StuckType = 'silence' | 'rambling' | 'conceding';
export interface StuckSignal {
  type: StuckType;
  /** Monotonic id so the same continuous stuck-state doesn't re-fire repeatedly. */
  id: number;
}

export interface UseStuckDetectionOptions {
  /** The live-rep transcript (prospect session): 'you' = learner, 'nicole' = prospect. */
  transcript: TranscriptLine[];
  /** Only detect while the rep is actually active + the learner can speak. */
  active: boolean;
}

const SILENCE_TICKS = 9;          // ~9s of no learner line (1s ticks) → "silence"
const RAMBLE_WORDS = 90;          // a single learner turn longer than this → "rambling"
const CONCEDE = /\b(okay fine|ok fine|no problem|sorry to bother|never ?mind|forget it|i (don'?t|do not) know|whatever you (think|say)|i give up|maybe later)\b/i;

/** Returns the current stuck signal (or null). Resets when the learner speaks again. */
export function useStuckDetection({ transcript, active }: UseStuckDetectionOptions): StuckSignal | null {
  const [signal, setSignal] = useState<StuckSignal | null>(null);
  const seqRef = useRef(0);
  const lastYouCountRef = useRef(0);
  // Quiet-time measured in interval ticks (not wall clock) so it's deterministic
  // and easy to fake-timer in tests; reset whenever either party produces a line.
  const quietTicksRef = useRef(0);

  // Inspect each committed line: a new learner line resets the clock + may itself be
  // a ramble/concession; a new prospect line just resets the silence clock.
  const youLines = transcript.filter((l) => l.speaker === 'you');
  const youCount = youLines.length;
  const lastLineText = transcript.length ? transcript[transcript.length - 1].text : '';
  const lastSpeaker = transcript.length ? transcript[transcript.length - 1].speaker : null;

  useEffect(() => {
    if (!active) { setSignal(null); return; }
    quietTicksRef.current = 0; // any new line resets the silence clock
    // A brand-new learner line clears any stuck signal (they recovered) and is
    // checked for ramble/concession.
    if (youCount > lastYouCountRef.current) {
      lastYouCountRef.current = youCount;
      const last = youLines[youLines.length - 1]?.text ?? '';
      const words = last.split(/\s+/).filter(Boolean).length;
      if (CONCEDE.test(last)) { seqRef.current += 1; setSignal({ type: 'conceding', id: seqRef.current }); return; }
      if (words >= RAMBLE_WORDS) { seqRef.current += 1; setSignal({ type: 'rambling', id: seqRef.current }); return; }
      setSignal(null); // a normal turn → not stuck
      return;
    }
    // A prospect line (no new learner line) just resets the silence clock.
    if (lastSpeaker === 'nicole') setSignal((s) => (s?.type === 'silence' ? null : s));
  }, [youCount, lastLineText, lastSpeaker, active, youLines]);

  // Silence watchdog: count 1s ticks of quiet; once past the threshold, nudge once
  // and re-arm (so it doesn't spam every second). Reset by any new line above.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      quietTicksRef.current += 1;
      if (quietTicksRef.current >= SILENCE_TICKS) {
        quietTicksRef.current = 0;
        seqRef.current += 1;
        setSignal({ type: 'silence', id: seqRef.current });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  return signal;
}
