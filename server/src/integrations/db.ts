// Token store for connected third-party integrations.
//
// One row per (user_id, provider). Holds the OAuth tokens, granted scopes, and
// expiry so the relay can act on the user's behalf server-side. Tokens are
// encrypted at rest with AES-256-GCM (see crypto.ts) so a DB leak doesn't expose
// live credentials. Mirrors the ensureSchema()-per-domain pattern used by
// memory/db.ts and training/historyDb.ts on the shared pg Pool.

import { pool } from '../memory/db.js';
import { encryptSecret, decryptSecret } from './crypto.js';

/** A provider we can connect to. Kept as a string union for tool dispatch. */
export type ProviderId =
  | 'google'
  | 'notion'
  | 'todoist'
  | 'slack';

/** A stored connection, decrypted, as the rest of the server consumes it. */
export interface Connection {
  userId: string;
  provider: ProviderId;
  accessToken: string;
  refreshToken: string | null;
  /** Unix ms when the access token expires, or null if it doesn't. */
  expiresAt: number | null;
  scopes: string[];
  /** Free-form provider metadata (e.g. Slack team id, Spotify product). */
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface ConnectionRow {
  user_id: string;
  provider: string;
  access_token: string; // encrypted
  refresh_token: string | null; // encrypted
  expires_at: string | null; // timestamptz
  scopes: string[] | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ConnectionRow): Connection {
  return {
    userId: row.user_id,
    provider: row.provider as ProviderId,
    accessToken: decryptSecret(row.access_token),
    refreshToken: row.refresh_token ? decryptSecret(row.refresh_token) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
    scopes: row.scopes ?? [],
    meta: row.meta ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Create the integrations table if it doesn't exist. Idempotent. */
export async function ensureIntegrationsSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nicole2_integrations (
      id serial PRIMARY KEY,
      user_id text NOT NULL,
      provider text NOT NULL,
      access_token text NOT NULL,
      refresh_token text,
      expires_at timestamptz,
      scopes text[],
      meta jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE (user_id, provider)
    )
  `);
}

/** Upsert a connection for (user, provider). Tokens are encrypted before write. */
export async function saveConnection(c: {
  userId: string;
  provider: ProviderId;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  scopes?: string[];
  meta?: Record<string, unknown>;
}): Promise<void> {
  const encAccess = encryptSecret(c.accessToken);
  const encRefresh = c.refreshToken ? encryptSecret(c.refreshToken) : null;
  const expiresAt = c.expiresAt ? new Date(c.expiresAt).toISOString() : null;
  await pool.query(
    `INSERT INTO nicole2_integrations
       (user_id, provider, access_token, refresh_token, expires_at, scopes, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, provider) DO UPDATE
       SET access_token = EXCLUDED.access_token,
           refresh_token = COALESCE(EXCLUDED.refresh_token, nicole2_integrations.refresh_token),
           expires_at = EXCLUDED.expires_at,
           scopes = EXCLUDED.scopes,
           meta = EXCLUDED.meta,
           updated_at = now()`,
    [
      c.userId,
      c.provider,
      encAccess,
      encRefresh,
      expiresAt,
      c.scopes ?? [],
      JSON.stringify(c.meta ?? {}),
    ],
  );
}

/** Load one connection, or null if the user hasn't connected that provider. */
export async function getConnection(
  userId: string,
  provider: ProviderId,
): Promise<Connection | null> {
  const { rows } = await pool.query<ConnectionRow>(
    `SELECT * FROM nicole2_integrations WHERE user_id = $1 AND provider = $2`,
    [userId, provider],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** List the providers a user has connected (no token material). */
export async function listConnections(
  userId: string,
): Promise<Array<{ provider: ProviderId; scopes: string[]; updatedAt: string }>> {
  const { rows } = await pool.query<ConnectionRow>(
    `SELECT provider, scopes, updated_at FROM nicole2_integrations WHERE user_id = $1`,
    [userId],
  );
  return rows.map((r) => ({
    provider: r.provider as ProviderId,
    scopes: r.scopes ?? [],
    updatedAt: r.updated_at,
  }));
}

/** Remove a connection (disconnect). No-op if not connected. */
export async function deleteConnection(
  userId: string,
  provider: ProviderId,
): Promise<void> {
  await pool.query(
    `DELETE FROM nicole2_integrations WHERE user_id = $1 AND provider = $2`,
    [userId, provider],
  );
}

/** Update just the token fields after a refresh. */
export async function updateTokens(
  userId: string,
  provider: ProviderId,
  t: { accessToken: string; refreshToken?: string | null; expiresAt?: number | null },
): Promise<void> {
  const encAccess = encryptSecret(t.accessToken);
  const encRefresh = t.refreshToken ? encryptSecret(t.refreshToken) : null;
  const expiresAt = t.expiresAt ? new Date(t.expiresAt).toISOString() : null;
  await pool.query(
    `UPDATE nicole2_integrations
       SET access_token = $3,
           refresh_token = COALESCE($4, refresh_token),
           expires_at = $5,
           updated_at = now()
     WHERE user_id = $1 AND provider = $2`,
    [userId, provider, encAccess, encRefresh, expiresAt],
  );
}
