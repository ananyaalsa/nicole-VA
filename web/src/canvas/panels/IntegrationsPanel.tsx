// web/src/canvas/panels/IntegrationsPanel.tsx
import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import { useIntegrations } from '../../integrations/useIntegrations';
import { connectIntegration, disconnectIntegration } from '../../integrations/integrationsApi';
import { friendlyError } from '../../ui/friendlyError';
import type { PanelComponentProps } from './registry';

export function IntegrationsPanel({ token }: PanelComponentProps): JSX.Element {
  const { statuses, error, refresh } = useIntegrations(token);
  const [busy, setBusy] = useState<string | null>(null);

  const connect = useCallback(async (id: string) => {
    if (!token) return;
    setBusy(id);
    const r = await connectIntegration(token, id);
    setBusy(null);
    if (r.ok) { window.dispatchEvent(new Event('nicole:integrations-updated')); refresh(); }
  }, [token, refresh]);

  const disconnect = useCallback(async (id: string) => {
    if (!token) return;
    setBusy(id);
    try { await disconnectIntegration(token, id); window.dispatchEvent(new Event('nicole:integrations-updated')); refresh(); }
    catch { /* handled by the error state below */ }
    setBusy(null);
  }, [token, refresh]);

  if (error) return <div className="canvas-integrations" data-testid="integrations-panel"><p className="canvas-integrations__err">{friendlyError('integrations_load')}</p></div>;

  return (
    <div className="canvas-integrations" data-testid="integrations-panel">
      <div className="canvas-integrations__grid">
        {statuses.filter((s) => s.configured).map((s) => (
          <div key={s.id} className="canvas-integrations__item">
            <span className={`canvas-integrations__logo logo--${s.id}`} aria-hidden="true">{s.name.charAt(0)}</span>
            <span className="canvas-integrations__name">{s.name}</span>
            {s.connected
              ? <button type="button" className="canvas-integrations__st ok" disabled={busy === s.id} onClick={() => void disconnect(s.id)}>Connected</button>
              : <button type="button" className="canvas-integrations__st no" disabled={busy === s.id} onClick={() => void connect(s.id)}>Connect →</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
