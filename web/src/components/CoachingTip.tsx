import { useEffect } from 'react';
import type { JSX } from 'react';
import './CoachingTip.css';

export interface CoachingTipProps {
  /** The tip text (plain; never spoken). */
  tip: string;
  /** What triggered it — drives the accent color/label. */
  kind: 'silence' | 'rambling' | 'conceding';
  /** A key that changes per distinct tip, so it re-animates + the auto-dismiss resets. */
  signalId: number;
  onDismiss: () => void;
}

const LABEL: Record<CoachingTipProps['kind'], string> = {
  silence: 'Nudge from Nicole',
  rambling: 'Quick note',
  conceding: "Don't give up",
};

/**
 * TRAINING-ONLY. A small coaching-tip card that slides in during the live rep when
 * the learner is stuck, auto-dismissing after a few seconds (or on tap). It is
 * TEXT only — Nicole has no voice during the rep — so it never interrupts the call.
 */
export function CoachingTip({ tip, kind, signalId, onDismiss }: CoachingTipProps): JSX.Element {
  useEffect(() => {
    const t = setTimeout(onDismiss, 7000);
    return () => clearTimeout(t);
    // Re-arm whenever a NEW tip arrives (signalId changes).
  }, [signalId, onDismiss]);

  return (
    <button
      type="button"
      className={`coaching-tip coaching-tip--${kind}`}
      data-testid="coaching-tip"
      onClick={onDismiss}
      aria-live="polite"
    >
      <span className="coaching-tip__label">{LABEL[kind]}</span>
      <span className="coaching-tip__text">{tip}</span>
    </button>
  );
}

export default CoachingTip;
