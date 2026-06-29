import type { IncomingMessage, ServerResponse } from 'node:http';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../memory/db.js';
import { requireAuth, JWT_SECRET } from './middleware.js';
import { config } from '../config.js';
import { readJsonBody } from '../http/readBody.js';
import { RateLimiter, clientIp } from '../http/rateLimit.js';
import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  sweepExpiredRefreshTokens,
  REFRESH_TTL_MS,
} from './refreshTokens.js';

/** Name of the httpOnly refresh-token cookie. */
const REFRESH_COOKIE = 'nicole_rt';
const IS_PROD = config.nodeEnv === 'production';

/** bcrypt work factor. 12 is the 2025 baseline for password hashing. */
const BCRYPT_ROUNDS = 12;
/** Per-IP brute-force guards: 10 login attempts / 15 min, 5 signups / hour. */
const loginLimiter = new RateLimiter(10, 15 * 60 * 1000);
const signupLimiter = new RateLimiter(5, 60 * 60 * 1000);

function tooMany(res: ServerResponse, retryAfterSec: number): void {
  res.writeHead(429, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': config.frontendUrl,
    'Retry-After': String(retryAfterSec),
  });
  res.end(JSON.stringify({ error: 'Too many attempts. Please wait and try again.' }));
}
/** A throwaway bcrypt hash compared against when a login email doesn't exist, so
 *  the response time matches the real-user path and emails can't be enumerated
 *  via timing. (Hash of a random string; the value is irrelevant.) */
const DUMMY_HASH = '$2b$12$I0kDR7ryvZ1N2umpZ3.0ieuZHb5Tgg.3iEXdfPRkwBr6.2p7RZxyS';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  preferred_voice: string;
  onboarding_done: boolean;
  created_at: string;
}

function mapUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    preferredVoice: row.preferred_voice,
    onboardingDone: row.onboarding_done,
  };
}

/** Build CORS headers. Credentials must be allowed (the refresh cookie rides
 *  fetch with credentials:'include'), which requires a SPECIFIC origin, never '*'. */
function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': config.frontendUrl,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    ...extra,
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders(extraHeaders) });
  res.end(text);
}

/** Access token (Bearer) — short-lived so a leak is bounded to 24h; the long-
 *  lived secret is the httpOnly refresh cookie, never readable from JS. */
function makeToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '24h' });
}

/** Set-Cookie value for the httpOnly refresh token. SameSite=Lax so it still
 *  rides the top-level OAuth redirect; Secure in production. */
function refreshCookie(raw: string): string {
  const maxAge = Math.floor(REFRESH_TTL_MS / 1000);
  const parts = [
    `${REFRESH_COOKIE}=${raw}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (IS_PROD) parts.push('Secure');
  return parts.join('; ');
}

/** Clearing cookie (logout). */
function clearRefreshCookie(): string {
  const parts = [`${REFRESH_COOKIE}=`, 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0'];
  if (IS_PROD) parts.push('Secure');
  return parts.join('; ');
}

/** Read the refresh token from the Cookie header. */
function readRefreshCookie(req: IncomingMessage): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === REFRESH_COOKIE) return v.join('=') || null;
  }
  return null;
}

/** Issue access token + set a fresh refresh cookie, then respond with {token,user}. */
async function sendAuthSuccess(res: ServerResponse, status: number, user: ReturnType<typeof mapUser>): Promise<void> {
  const refresh = await issueRefreshToken(user.id);
  const token = makeToken(user.id);
  sendJson(res, status, { token, user }, { 'Set-Cookie': refreshCookie(refresh) });
}

export async function handleAuthRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/auth')) return false;

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }

  // POST /api/auth/signup
  if (url.pathname === '/api/auth/signup' && req.method === 'POST') {
    const ip = clientIp(req);
    if (!signupLimiter.hit(ip)) { tooMany(res, signupLimiter.retryAfterSec(ip)); return true; }
    const body = await readJsonBody(req);
    const { email, password, displayName } = body;
    if (!email || !password || !displayName) {
      sendJson(res, 400, { error: 'email, password, and displayName are required' });
      return true;
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
      sendJson(res, 400, { error: 'Password must be 8–200 characters' });
      return true;
    }
    if (typeof email !== 'string' || email.length > 320 || !email.includes('@')) {
      sendJson(res, 400, { error: 'A valid email is required' });
      return true;
    }
    try {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const { rows } = await pool.query<UserRow>(
        `INSERT INTO nicole2_users (email, password_hash, display_name)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [email.toLowerCase().trim(), passwordHash, displayName.trim()],
      );
      const user = mapUser(rows[0]);
      await sendAuthSuccess(res, 201, user);
    } catch (err: any) {
      if (err.code === '23505') {
        sendJson(res, 409, { error: 'An account with this email already exists' });
      } else {
        sendJson(res, 500, { error: 'Failed to create account' });
      }
    }
    return true;
  }

  // POST /api/auth/login
  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    const ip = clientIp(req);
    if (!loginLimiter.hit(ip)) { tooMany(res, loginLimiter.retryAfterSec(ip)); return true; }
    const body = await readJsonBody(req);
    const { email, password } = body;
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      sendJson(res, 400, { error: 'email and password are required' });
      return true;
    }
    const { rows } = await pool.query<UserRow>(
      `SELECT * FROM nicole2_users WHERE email = $1`,
      [email.toLowerCase().trim()],
    );
    const row = rows[0];
    // Always run a bcrypt compare — against a dummy hash when the email doesn't
    // exist — so the response time is the same whether or not the account exists.
    // Otherwise an attacker can enumerate registered emails by timing the reply.
    const valid = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !valid) {
      sendJson(res, 401, { error: 'Invalid email or password' });
      return true;
    }
    const user = mapUser(row);
    await sendAuthSuccess(res, 200, user);
    return true;
  }

  // POST /api/auth/refresh — exchange the httpOnly refresh cookie for a new access
  // token (rotating the refresh token). This is how a 24h access token is renewed
  // without the user re-logging-in, and how the app restores a session on load.
  if (url.pathname === '/api/auth/refresh' && req.method === 'POST') {
    void sweepExpiredRefreshTokens();
    const presented = readRefreshCookie(req);
    if (!presented) { sendJson(res, 401, { error: 'No session' }); return true; }
    const rotated = await rotateRefreshToken(presented);
    if (!rotated) {
      // Invalid/expired refresh token — clear the stale cookie.
      sendJson(res, 401, { error: 'Session expired' }, { 'Set-Cookie': clearRefreshCookie() });
      return true;
    }
    const { rows } = await pool.query<UserRow>(`SELECT * FROM nicole2_users WHERE id = $1`, [rotated.userId]);
    if (!rows[0]) { sendJson(res, 401, { error: 'Session expired' }, { 'Set-Cookie': clearRefreshCookie() }); return true; }
    const token = makeToken(rotated.userId);
    sendJson(res, 200, { token, user: mapUser(rows[0]) }, { 'Set-Cookie': refreshCookie(rotated.token) });
    return true;
  }

  // POST /api/auth/logout — revoke the refresh token + clear the cookie.
  if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
    const presented = readRefreshCookie(req);
    if (presented) await revokeRefreshToken(presented);
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearRefreshCookie() });
    return true;
  }

  // GET /api/auth/me
  if (url.pathname === '/api/auth/me' && req.method === 'GET') {
    const userId = await requireAuth(req, res);
    if (!userId) return true;
    const { rows } = await pool.query<UserRow>(
      `SELECT * FROM nicole2_users WHERE id = $1`,
      [userId],
    );
    if (!rows[0]) {
      sendJson(res, 404, { error: 'User not found' });
      return true;
    }
    sendJson(res, 200, mapUser(rows[0]));
    return true;
  }

  // PATCH /api/auth/me
  if (url.pathname === '/api/auth/me' && req.method === 'PATCH') {
    const userId = await requireAuth(req, res);
    if (!userId) return true;
    const body = await readJsonBody(req);
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    if (body.displayName !== undefined) {
      sets.push(`display_name = $${idx++}`);
      vals.push(body.displayName);
    }
    if (body.preferredVoice !== undefined) {
      sets.push(`preferred_voice = $${idx++}`);
      vals.push(body.preferredVoice);
    }
    if (body.onboardingDone !== undefined) {
      sets.push(`onboarding_done = $${idx++}`);
      vals.push(body.onboardingDone);
    }
    if (sets.length === 0) {
      sendJson(res, 400, { error: 'No fields to update' });
      return true;
    }
    vals.push(userId);
    const { rows } = await pool.query<UserRow>(
      `UPDATE nicole2_users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    if (!rows[0]) {
      sendJson(res, 404, { error: 'User not found' });
      return true;
    }
    sendJson(res, 200, mapUser(rows[0]));
    return true;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
  return true;
}
