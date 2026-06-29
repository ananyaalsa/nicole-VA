// Signed OAuth `state` so the callback can trust which user + provider a consent
// belongs to (CSRF protection + user binding). We reuse the JWT secret to sign a
// short-lived token rather than keeping server-side session state — the callback
// is stateless and verifies the signature before storing any tokens.

import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../auth/middleware.js';
import type { ProviderId } from './db.js';

interface StatePayload {
  userId: string;
  provider: ProviderId;
}

/** Sign a state token valid for 10 minutes (the consent window). */
export function signState(userId: string, provider: ProviderId): string {
  return jwt.sign({ userId, provider }, JWT_SECRET, { expiresIn: '10m' });
}

/** Verify + decode a state token from the OAuth callback. Returns null if bad. */
export function verifyState(state: string): StatePayload | null {
  try {
    const p = jwt.verify(state, JWT_SECRET) as StatePayload & { iat: number; exp: number };
    if (!p.userId || !p.provider) return null;
    return { userId: p.userId, provider: p.provider };
  } catch {
    return null;
  }
}
