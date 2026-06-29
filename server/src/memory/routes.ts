// Minimal memory HTTP API (no framework). Handles GET/POST /api/memory and
// DELETE /api/memory/:key. Requires a valid JWT (Authorization: Bearer <token>).
// Returns JSON.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.js';
import { loadFacts, saveFact, forgetFact } from './db.js';
import { requireAuth } from '../auth/middleware.js';

/** Keys the user sets in their profile/settings — tagged source='settings'. */
const PROFILE_KEYS = new Set(['user_about', 'user_goals', 'user_phone', 'user_name']);

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': config.frontendUrl,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(text);
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

/**
 * Try to handle a memory route. Returns true if it matched (and responded),
 * false if the path is not a memory route (so the caller can 404).
 */
export async function handleMemoryRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/memory')) return false;

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }

  const userId = await requireAuth(req, res);
  if (!userId) return true;

  // /api/memory  (collection)
  if (url.pathname === '/api/memory') {
    if (req.method === 'GET') {
      const facts = await loadFacts(userId);
      sendJson(res, 200, { facts });
      return true;
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (!body.fact) {
        sendJson(res, 400, { error: 'fact is required' });
        return true;
      }
      const key = body.key ?? slugify(body.fact);
      // Profile facts the user sets in settings/onboarding are tagged 'settings'
      // (Nicole KNOWS them but did NOT discuss them). Everything else defaults to
      // 'inferred'/'explicit'. Honor an explicit body.source if provided.
      const source =
        body.source ?? (PROFILE_KEYS.has(key) ? 'settings' : undefined);
      const fact = await saveFact({
        userId,
        key,
        fact: body.fact,
        factType: body.factType,
        source,
      });
      sendJson(res, 200, { fact });
      return true;
    }
  }

  // /api/memory/:key  (item)
  const match = url.pathname.match(/^\/api\/memory\/(.+)$/);
  if (match && req.method === 'DELETE') {
    await forgetFact(userId, decodeURIComponent(match[1]));
    sendJson(res, 200, { ok: true });
    return true;
  }

  sendJson(res, 405, { error: 'method not allowed' });
  return true;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .split(/\s+/)
      .slice(0, 4)
      .join('_')
      .replace(/[^a-z0-9_]/g, '') || 'fact'
  );
}
