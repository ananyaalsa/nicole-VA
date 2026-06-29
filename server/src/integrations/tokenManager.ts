// Returns a CONNECTION with a guaranteed-fresh access token, refreshing via the
// adapter when the stored token has expired (or is within a 60s skew window).
// Adapters whose tokens never expire (Notion, Todoist, Slack) just pass through.

import { getConnection, updateTokens, type Connection, type ProviderId } from './db.js';
import { getAdapter } from './registry.js';

const SKEW_MS = 60_000;

/** Get a usable connection, refreshing the token first if needed. Null if not connected. */
export async function getFreshConnection(
  userId: string,
  provider: ProviderId,
): Promise<Connection | null> {
  const conn = await getConnection(userId, provider);
  if (!conn) return null;

  const adapter = getAdapter(provider);
  const expired = conn.expiresAt != null && conn.expiresAt - SKEW_MS <= Date.now();
  if (!expired || !adapter?.refresh) return conn;

  try {
    const refreshed = await adapter.refresh(conn);
    await updateTokens(userId, provider, refreshed);
    return {
      ...conn,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? conn.refreshToken,
      expiresAt: refreshed.expiresAt ?? null,
    };
  } catch {
    // Refresh failed (revoked / network). Hand back the stale conn; the API call
    // will fail with a clear 401 the relay can report ("reconnect this account").
    return conn;
  }
}
