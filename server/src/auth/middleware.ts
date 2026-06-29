import type { IncomingMessage, ServerResponse } from 'node:http';
import jwt from 'jsonwebtoken';

/**
 * The signing secret for every auth JWT (and, transitively, the OAuth-state
 * tokens and the integrations encryption-key fallback). It MUST be set in
 * production: a hardcoded fallback would let anyone who can read this source
 * (it's an open repo) forge a token for any user — full account takeover. So we
 * fail CLOSED when NODE_ENV === 'production' and JWT_SECRET is missing/weak,
 * and only allow the well-known dev value outside production for local ergonomics.
 */
const DEV_FALLBACK_SECRET = 'nicole-dev-secret';
function resolveJwtSecret(): string {
  const v = process.env.JWT_SECRET?.trim();
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    if (!v || v === DEV_FALLBACK_SECRET) {
      throw new Error(
        'JWT_SECRET must be set to a strong, unique value in production ' +
          '(missing or using the dev fallback). Refusing to start with a ' +
          'forgeable signing key.',
      );
    }
    if (v.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production.');
    }
    return v;
  }
  return v || DEV_FALLBACK_SECRET;
}

const JWT_SECRET = resolveJwtSecret();

export interface AuthedRequest extends IncomingMessage {
  userId: string;
}

export async function requireAuth(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<string | null> {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return null;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    return payload.sub;
  } catch {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid token' }));
    return null;
  }
}

/**
 * Resolve the user id from a request's Bearer token for the non-framework HTTP
 * routes. In production an invalid/missing token returns null (the caller MUST
 * 401) — never the shared default user, which would silently let anonymous
 * requests read/write that user's data. In dev it falls back to `devUserId` so
 * local testing needs no login.
 */
export function resolveUserId(req: IncomingMessage, devUserId: string): string | null {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const devFallback = process.env.NODE_ENV === 'production' ? null : devUserId;
  if (!token) return devFallback;
  try {
    return (jwt.verify(token, JWT_SECRET) as { sub: string }).sub;
  } catch {
    return devFallback;
  }
}

export { JWT_SECRET };
