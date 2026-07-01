import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  fetchIntegrations,
  connectIntegration,
  disconnectIntegration,
  type IntegrationStatus,
} from '../integrations/integrationsApi';
import { friendlyError } from '../ui/friendlyError';
import './IntegrationsPanel.css';

/* Provider brand glyphs, keyed by the server's provider id. */
const ICONS: Record<string, JSX.Element> = {
  google: (
    <svg viewBox="0 0 24 24" fill="none" className="intg-svg" aria-hidden="true">
      <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285F4" />
      <path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" fill="#34A853" />
      <path d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6z" fill="#FBBC05" />
      <path d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6.1 12 6.1z" fill="#EA4335" />
    </svg>
  ),
  notion: (
    <svg viewBox="0 0 24 24" fill="none" className="intg-svg" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2" stroke="#1C1917" strokeWidth="1.8" />
      <path d="M8 7h8M8 11h5M8 15h6" stroke="#1C1917" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  todoist: (
    <svg viewBox="0 0 24 24" fill="none" className="intg-svg" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="#DB4035" strokeWidth="1.8" />
      <path d="M8 12l3 3 5-5" stroke="#DB4035" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  slack: (
    <svg viewBox="0 0 24 24" fill="none" className="intg-svg" aria-hidden="true">
      <path d="M9 3a2 2 0 1 0 0 4h2V3a2 2 0 0 0-2 0z" fill="#E01E5A" />
      <path d="M3 9a2 2 0 0 0 4 0V7H5a2 2 0 0 0-2 2z" fill="#36C5F0" />
      <path d="M15 21a2 2 0 1 0 0-4h-2v2a2 2 0 0 0 2 2z" fill="#2EB67D" />
      <path d="M21 15a2 2 0 0 0-4 0v2h2a2 2 0 0 0 2-2z" fill="#ECB22E" />
      <path d="M3 15a2 2 0 0 0 4 0v-2H5a2 2 0 0 0-2 2z" fill="#E01E5A" />
      <path d="M9 21a2 2 0 0 0 0-4H7v2a2 2 0 0 0 2 2z" fill="#36C5F0" />
      <path d="M21 9a2 2 0 0 0-4 0v2h2a2 2 0 0 0 2-2z" fill="#2EB67D" />
      <path d="M15 3a2 2 0 1 0 0 4h2V5a2 2 0 0 0-2-2z" fill="#ECB22E" />
    </svg>
  ),
};

/** What each provider lets Nicole do — shown on the card so the value is clear. */
const CAPABILITIES: Record<string, string[]> = {
  google: ['Check & book calendar events', 'Read inbox, draft & send email', 'Add Google Meet links'],
  notion: ['Search your notes & docs', 'Capture new pages by voice'],
  todoist: ['Add tasks by voice', 'Check what’s due'],
  slack: ['Post messages to channels', 'Read recent messages'],
};

/** Providers not yet available to connect — shown as "Coming soon" (disabled). */
const COMING_SOON = new Set(['todoist', 'slack']);

/**
 * The Integrations surface — its own module (not crammed into ProfilePanel).
 * Lists every provider with live connected/configured state and real connect/
 * disconnect against /api/integrations.
 */
export function IntegrationsPanel(): JSX.Element {
  const { token } = useAuth();
  const [items, setItems] = useState<IntegrationStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setItems(await fetchIntegrations(token));
      setError(null);
    } catch {
      setError(friendlyError('integrations_load'));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // If the OAuth popup redirected the main window with ?integration=…, surface it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('integration');
    if (status) {
      void load();
      // Clean the URL so a refresh doesn't re-trigger.
      params.delete('integration');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, [load]);

  const onConnect = useCallback(
    async (provider: string) => {
      if (!token) return;
      setBusy(provider);
      try {
        await connectIntegration(token, provider);
        await load();
      } finally {
        setBusy(null);
      }
    },
    [token, load],
  );

  const onDisconnect = useCallback(
    async (provider: string) => {
      if (!token) return;
      setBusy(provider);
      try {
        await disconnectIntegration(token, provider);
        await load();
      } finally {
        setBusy(null);
      }
    },
    [token, load],
  );

  if (error) {
    return <div className="intg-panel__error" role="alert">{error}</div>;
  }
  if (!items) {
    return <div className="intg-panel__loading">Loading integrations…</div>;
  }

  return (
    <div className="intg-panel">
      <p className="intg-panel__lede">
        Connect your tools so Nicole can act for you: book meetings, draft email,
        capture tasks, post to Slack and more, all by voice.
      </p>
      <ul className="intg-list">
        {items.map((it) => {
          const caps = CAPABILITIES[it.id] ?? [];
          const isBusy = busy === it.id;
          // Coming-soon providers (or any the server hasn't configured) aren't
          // connectable yet — show a "Coming soon" badge and a disabled action.
          const comingSoon = COMING_SOON.has(it.id) || !it.configured;
          return (
            <li
              key={it.id}
              className={`intg-card${it.connected ? ' is-connected' : ''}${comingSoon ? ' is-unavailable' : ''}`}
              data-provider={it.id}
            >
              <div className="intg-card__head">
                <div className="intg-card__icon">{ICONS[it.id]}</div>
                <div className="intg-card__title-wrap">
                  <span className="intg-card__name">{it.name}</span>
                  <span className="intg-card__desc">{it.description}</span>
                </div>
                <span className={`intg-card__status intg-card__status--${it.connected ? 'on' : comingSoon ? 'na' : 'off'}`}>
                  {it.connected ? 'Connected' : comingSoon ? 'Coming soon' : 'Not connected'}
                </span>
              </div>

              {caps.length > 0 && (
                <ul className="intg-card__caps">
                  {caps.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}

              <div className="intg-card__actions">
                {comingSoon ? (
                  <span className="intg-card__note">Coming soon.</span>
                ) : it.connected ? (
                  <button
                    type="button"
                    className="intg-btn intg-btn--ghost"
                    disabled={isBusy}
                    onClick={() => void onDisconnect(it.id)}
                  >
                    {isBusy ? 'Working…' : 'Disconnect'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="intg-btn intg-btn--connect"
                    disabled={isBusy}
                    onClick={() => void onConnect(it.id)}
                  >
                    {isBusy ? 'Connecting…' : 'Connect'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default IntegrationsPanel;
