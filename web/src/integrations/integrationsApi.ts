// Frontend client for the integrations API (/api/integrations).
// Connect opens the provider's OAuth consent in a popup; on success the popup
// lands on the app with ?integration=connected:<provider> and we re-fetch status.

export interface IntegrationStatus {
  id: string;
  name: string;
  description: string;
  /** Server has client id/secret for this provider (else it can't be connected). */
  configured: boolean;
  /** This user has an active connection. */
  connected: boolean;
  scopes: string[];
  connectedAt: string | null;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Fetch the status of every integration for the current user. */
export async function fetchIntegrations(token: string): Promise<IntegrationStatus[]> {
  const res = await fetch('/api/integrations', { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`integrations ${res.status}`);
  const data = await res.json();
  return data.providers ?? [];
}

/** Disconnect a provider for the current user. */
export async function disconnectIntegration(token: string, provider: string): Promise<void> {
  const res = await fetch(`/api/integrations/${provider}/disconnect`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`disconnect ${res.status}`);
}

/** Result of an OAuth connect attempt. */
export interface ConnectResult {
  /** true if the provider connected, false on error/cancel. */
  ok: boolean;
  /** Provider id that connected (when ok). */
  provider?: string;
  /** Short error string when !ok. */
  error?: string;
}

/**
 * Start the OAuth connect flow in a popup. The server's callback returns a tiny
 * self-closing bridge page that postMessages the result back here and closes —
 * so the MAIN window never reloads and no stray tab is left. We resolve as soon
 * as that message arrives (or the user closes the popup). The connect route is a
 * top-level redirect, so we pass the JWT via ?token=.
 */
export function connectIntegration(token: string, provider: string): Promise<ConnectResult> {
  const url = `/api/integrations/${provider}/connect?token=${encodeURIComponent(token)}`;
  return new Promise((resolve) => {
    const popup = window.open(url, 'nicole-oauth', 'width=520,height=680');
    if (!popup) {
      // Popup blocked — fall back to a full-page redirect.
      window.location.href = url;
      resolve({ ok: false, error: 'popup_blocked' });
      return;
    }

    // The bridge page reports back via BroadcastChannel + a localStorage write.
    // Both are same-origin and survive the provider's Cross-Origin-Opener-Policy
    // (which nulls window.opener), so this works where postMessage(opener) won't.
    let settled = false;
    let bc: BroadcastChannel | null = null;
    try { bc = new BroadcastChannel('nicole-oauth'); } catch { bc = null; }

    const finish = (result: ConnectResult) => {
      if (settled) return;
      settled = true;
      if (bc) { bc.onmessage = null; try { bc.close(); } catch { /* noop */ } }
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('message', onMessage);
      clearInterval(timer);
      try { localStorage.removeItem('nicole_oauth_result'); } catch { /* noop */ }
      resolve(result);
    };

    const handle = (integration: unknown) => {
      if (typeof integration !== 'string') return;
      const [kind, value] = integration.split(':');
      if (kind === 'connected') finish({ ok: true, provider: value });
      else finish({ ok: false, error: value || 'error' });
    };

    if (bc) bc.onmessage = (e) => handle((e.data as { integration?: unknown })?.integration);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'nicole_oauth_result' || !e.newValue) return;
      try { handle((JSON.parse(e.newValue) as { integration?: unknown }).integration); } catch { /* noop */ }
    };
    window.addEventListener('storage', onStorage);
    // Best-effort opener message (when COOP didn't sever it).
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { source?: string; integration?: unknown } | null;
      if (data?.source === 'nicole-oauth') handle(data.integration);
    };
    window.addEventListener('message', onMessage);

    // Safety net: stop waiting if the popup is closed before reporting. COOP can
    // block reading popup.closed, so guard it.
    const timer = setInterval(() => {
      let closed = false;
      try { closed = popup.closed; } catch { closed = false; }
      if (closed) finish({ ok: false, error: 'closed' });
    }, 800);
  });
}
