// Opaque refresh tokens for the auth flow.
//
// The access token (JWT) is short-lived (24h). The refresh token is a long-lived
// (30d) random opaque string delivered as an httpOnly cookie — JS never sees it,
// so XSS can't steal it. Only its SHA-256 hash is stored, so a DB leak can't be
// replayed to mint access tokens. Every successful refresh ROTATES the token
// (old one revoked, new one issued) so a captured refresh token has a short life.

import crypto from 'node:crypto';
import { pool } from '../memory/db.js';

/** 30 days, in ms — the refresh-token / "stay logged in" window. */
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Hash a raw refresh token for storage/lookup (never store the raw token). */
function hash(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Mint a new refresh token for `userId`, persist its hash, return the RAW token
 *  (to set as the cookie). */
export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await pool.query(
    `INSERT INTO nicole2_refresh_tokens (token_hash, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [hash(raw), userId, expiresAt.toISOString()],
  );
  return raw;
}

/** Look up a (non-expired) refresh token and return its userId, or null. */
export async function userIdForRefreshToken(raw: string): Promise<string | null> {
  if (!raw) return null;
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM nicole2_refresh_tokens
     WHERE token_hash = $1 AND expires_at > now()`,
    [hash(raw)],
  );
  return rows[0]?.user_id ?? null;
}

/** Revoke a single refresh token (logout, or after rotation). */
export async function revokeRefreshToken(raw: string): Promise<void> {
  if (!raw) return;
  await pool.query(`DELETE FROM nicole2_refresh_tokens WHERE token_hash = $1`, [hash(raw)]);
}

/** Rotate: revoke the presented token and issue a fresh one for the same user.
 *  Returns the new raw token, or null if the presented token was invalid. */
export async function rotateRefreshToken(raw: string): Promise<{ userId: string; token: string } | null> {
  const userId = await userIdForRefreshToken(raw);
  if (!userId) return null;
  await revokeRefreshToken(raw);
  const token = await issueRefreshToken(userId);
  return { userId, token };
}

/** Best-effort sweep of expired rows (called opportunistically). */
export async function sweepExpiredRefreshTokens(): Promise<void> {
  try {
    await pool.query(`DELETE FROM nicole2_refresh_tokens WHERE expires_at <= now()`);
  } catch { /* best-effort */ }
}
