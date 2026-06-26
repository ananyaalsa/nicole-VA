// server/src/session/routes.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { JWT_SECRET } from '../auth/middleware.js';
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

function resolveUserId(req: IncomingMessage): string {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return config.userId;
  try { return (jwt.verify(token, JWT_SECRET) as { sub: string }).sub; } catch { return config.userId; }
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

export async function handleSessionRoute(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/session')) return false;
  const userId = resolveUserId(req);

  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return true; }

  if (url.pathname === '/api/session/status') {
    if (req.method === 'POST') {
      const b = await readBody(req);
      const mode = b.mode === 'roleplay' ? 'roleplay' : 'training';
      const state = ['entered', 'active', 'finished'].includes(b.state) ? b.state : 'entered';
      const status: LiveStatus = {
        mode,
        state,
        skill: typeof b.skill === 'string' ? b.skill : undefined,
        startedAt: typeof b.startedAt === 'number' ? b.startedAt : Date.now(),
        finishedAt: typeof b.finishedAt === 'number' ? b.finishedAt : undefined,
        score: typeof b.score === 'number' ? b.score : undefined,
      };
      setLiveStatus(userId, status);
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (req.method === 'GET') {
      sendJson(res, 200, { status: getLiveStatus(userId) });
      return true;
    }
  }
  sendJson(res, 405, { error: 'method not allowed' });
  return true;
}
