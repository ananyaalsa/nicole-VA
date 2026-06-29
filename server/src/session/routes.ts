// server/src/session/routes.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.js';
import { resolveUserId } from '../auth/middleware.js';
import { readJsonBody } from '../http/readBody.js';
import { setLiveStatus, getLiveStatus, type LiveStatus } from './liveStatus.js';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': config.frontendUrl,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(JSON.stringify(body));
}

export async function handleSessionRoute(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/session')) return false;

  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return true; }

  // Per-user; requires auth in production (dev falls back to the default user).
  const userId = resolveUserId(req, config.userId);
  if (!userId) { sendJson(res, 401, { error: 'Unauthorized' }); return true; }

  if (url.pathname === '/api/session/status') {
    if (req.method === 'POST') {
      const b = await readJsonBody(req);
      const mode = b.mode === 'roleplay' ? 'roleplay' : 'training';
      const state = ['entered', 'active', 'finished', 'left'].includes(b.state) ? b.state : 'entered';
      const status: LiveStatus = {
        mode,
        state,
        skill: typeof b.skill === 'string' ? b.skill : undefined,
        startedAt: typeof b.startedAt === 'number' ? b.startedAt : Date.now(),
        finishedAt: typeof b.finishedAt === 'number' ? b.finishedAt : undefined,
        score: typeof b.score === 'number' ? b.score : undefined,
      };
      await setLiveStatus(userId, status);
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (req.method === 'GET') {
      sendJson(res, 200, { status: await getLiveStatus(userId) });
      return true;
    }
  }
  sendJson(res, 405, { error: 'method not allowed' });
  return true;
}
