// Activity / streak HTTP API (no framework). Handles:
//   GET  /api/activity/streak        → { streak }   (current streak)
//   POST /api/activity/ping { day }  → { streak }   (mark today active, recount)
// Requires a valid JWT. `day` is the client's LOCAL YYYY-MM-DD so the streak
// respects the user's timezone.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.js';
import { requireAuth } from '../auth/middleware.js';
import { readJsonBody } from '../http/readBody.js';
import { markActive, recentActiveDays, streakFromDays } from './activityDb.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': config.frontendUrl,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(JSON.stringify(body));
}

/** Server's own UTC day key, used as a fallback when the client omits `day`. */
function serverDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function handleActivityRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/activity')) return false;

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }

  const userId = await requireAuth(req, res);
  if (!userId) return true;

  // POST /api/activity/ping — mark today active, return the fresh streak.
  if (url.pathname === '/api/activity/ping' && req.method === 'POST') {
    const body = await readJsonBody(req).catch(() => ({} as Record<string, unknown>));
    const day = typeof body.day === 'string' && DAY_RE.test(body.day) ? body.day : serverDayKey();
    await markActive(userId, day);
    const days = await recentActiveDays(userId);
    sendJson(res, 200, { streak: streakFromDays(days, day) });
    return true;
  }

  // GET /api/activity/streak — current streak (no write).
  if (url.pathname === '/api/activity/streak' && req.method === 'GET') {
    const today = (url.searchParams.get('day') && DAY_RE.test(url.searchParams.get('day')!))
      ? url.searchParams.get('day')!
      : serverDayKey();
    const days = await recentActiveDays(userId);
    sendJson(res, 200, { streak: streakFromDays(days, today) });
    return true;
  }

  sendJson(res, 405, { error: 'method not allowed' });
  return true;
}
