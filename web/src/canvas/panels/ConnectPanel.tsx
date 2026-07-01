// web/src/canvas/panels/ConnectPanel.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { connectIntegration } from '../../integrations/integrationsApi';
import { friendlyError } from '../../ui/friendlyError';
import './ConnectPanel.css';

const AUTO_DISMISS_MS = 10000;

/** Nicely-cased provider label, e.g. "slack" → "Slack". */
function label(p: string): string { return p.charAt(0).toUpperCase() + p.slice(1); }

export interface ConnectPanelProps {
  provider: string;
  reason?: string;
  token: string | null;
  onClose(): void;
}

export function ConnectPanel({ provider, reason, token, onClose }: ConnectPanelProps): JSX.Element {
  const [state, setState] = useState<'idle' | 'connecting' | 'done' | 'error'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);
  const armTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => onClose(), AUTO_DISMISS_MS);
  }, [clearTimer, onClose]);

  // Arm on mount; pause on hover/focus; clean up on unmount.
  useEffect(() => { armTimer(); return clearTimer; }, [armTimer, clearTimer]);

  const onConnect = useCallback(async () => {
    if (!token) return;
    clearTimer();
    setState('connecting');
    const r = await connectIntegration(token, provider);
    if (r.ok) {
      window.dispatchEvent(new Event('nicole:integrations-updated'));
      setState('done');
      timerRef.current = setTimeout(() => onClose(), 1200); // brief "Connected ✓" flash
    } else {
      setState('error');
      armTimer(); // resume auto-dismiss
    }
  }, [token, provider, clearTimer, armTimer, onClose]);

  const l = label(provider);
  return (
    <div
      className={`connect-panel connect-panel--${provider}`}
      data-testid="connect-panel"
      onMouseEnter={clearTimer}
      onMouseLeave={armTimer}
      onFocus={clearTimer}
      onBlur={armTimer}
    >
      <button type="button" className="connect-panel__x" onClick={onClose} aria-label="Dismiss">✕</button>
      <div className="connect-panel__row">
        <span className={`connect-panel__logo logo--${provider}`} aria-hidden="true">{l.charAt(0)}</span>
        <div className="connect-panel__txt">
          <strong className="connect-panel__heading">{l}</strong>
          <p>{reason ? reason : `So I can use ${l} for you.`}</p>
        </div>
      </div>
      {state === 'error' && <p className="connect-panel__err">{friendlyError('connect', l)}</p>}
      <div className="connect-panel__actions">
        <button type="button" className="connect-panel__btn primary" disabled={state === 'connecting' || state === 'done'} onClick={() => void onConnect()}>
          {state === 'connecting' ? 'Connecting…' : state === 'done' ? 'Connected ✓' : `Connect ${l}`}
        </button>
        <button type="button" className="connect-panel__btn ghost" onClick={onClose}>Not now</button>
      </div>
      <span className="connect-panel__timer" aria-hidden="true" />
    </div>
  );
}

export default ConnectPanel;
