// web/src/canvas/resultDeck/OverlayFrame.tsx
import { useCallback, useEffect, useRef } from 'react';
import type { JSX, ReactNode } from 'react';
import './ResultDeck.css';

const AUTO_COLLAPSE_MS = 10000;

export interface OverlayFrameProps {
  label: string; icon: string;
  onCollapse(): void; onDismiss(): void;
  children: ReactNode;
}

/** Glassmorphism overlay chrome with a ~10s auto-collapse timer (paused on hover/focus). */
export function OverlayFrame({ label, icon, onCollapse, onDismiss, children }: OverlayFrameProps): JSX.Element {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCollapseRef = useRef(onCollapse);
  onCollapseRef.current = onCollapse;

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);
  const armTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => onCollapseRef.current(), AUTO_COLLAPSE_MS);
  }, [clearTimer]);

  useEffect(() => { armTimer(); return clearTimer; }, [armTimer, clearTimer]);

  return (
    <div
      className="result-overlay"
      data-testid="result-overlay"
      onMouseEnter={clearTimer} onMouseLeave={armTimer}
      onFocus={clearTimer} onBlur={armTimer}
    >
      <button type="button" className="result-overlay__x" onClick={onDismiss} aria-label={`Dismiss ${label}`}>✕</button>
      <div className="result-overlay__head"><span aria-hidden="true">{icon}</span> {label}</div>
      <div className="result-overlay__body">{children}</div>
      <span className="result-overlay__timer" aria-hidden="true" />
    </div>
  );
}

export default OverlayFrame;
