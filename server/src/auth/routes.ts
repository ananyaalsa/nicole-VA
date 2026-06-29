import type { IncomingMessage, ServerResponse } from 'node:http';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../memory/db.js';
import { requireAuth, JWT_SECRET } from './middleware.js';
import { config } from '../config.js';
import { readJsonBody } from '../http/readBody.js';

/** bcrypt work factor. 12 is the 2025 baseline for password hashing. */
const BCRYPT_ROUNDS = 12;
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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': config.frontendUrl,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(text);
}

function makeToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '30d' });
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
      const token = makeToken(user.id);
      sendJson(res, 201, { token, user });
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
    const token = makeToken(user.id);
    sendJson(res, 200, { token, user });
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
