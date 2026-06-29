// Signed OAuth `state` so the callback can trust which user + provider a consent
// belongs to (CSRF protection + user binding). We reuse the JWT secret to sign a
// short-lived token rather than keeping server-side session state — the callback
// is stateless and verifies the signature before storing any tokens.

import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { JWT_SECRET } from '../auth/middleware.js';
import type { ProviderId } from './db.js';

interface StatePayload {
  userId: string;
  provider: ProviderId;
}

/**
 * Consumed state ids, so a state token works exactly ONCE. Without this, a signed
 * state captured from logs/history/referrer could be replayed within its 10-min
 * window to re-bind an integration. Entries auto-expire after the token's max age.
 */
const CONSUMED = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;
function sweepConsumed(now: number): void {
  for (const [jti, exp] of CONSUMED) if (exp <= now) CONSUMED.delete(jti);
}

/** Sign a state token valid for 10 minutes (the consent window). */
export function signState(userId: string, provider: ProviderId): string {
  return jwt.sign({ userId, provider, jti: randomUUID() }, JWT_SECRET, { expiresIn: '10m' });
}

/** Verify + decode a state token from the OAuth callback. Returns null if bad or
 *  already used (single-use replay protection). */
export function verifyState(state: string, nowMs = Date.now()): StatePayload | null {
  try {
    const p = jwt.verify(state, JWT_SECRET) as StatePayload & { jti?: string; iat: number; exp: number };
    if (!p.userId || !p.provider) return null;
    // Single-use: reject a state we've already consumed; otherwise mark it used.
    if (p.jti) {
      sweepConsumed(nowMs);
      if (CONSUMED.has(p.jti)) return null;
      CONSUMED.set(p.jti, nowMs + STATE_TTL_MS);
    }
    return { userId: p.userId, provider: p.provider };
  } catch {
    return null;
  }
}
