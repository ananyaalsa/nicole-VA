// GET /api/brief — a once-a-day "daily brief" aggregation for the home-screen
// card. Reuses the existing read-only integration tools (calendar, email,
// tasks) via dispatchIntegrationTool, so there's no duplicate API logic. Each
// section degrades gracefully: if a provider isn't connected/configured, that
// section is simply omitted (the card hides empty sections).

import type { IncomingMessage, ServerResponse } from 'node:http';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { JWT_SECRET } from '../auth/middleware.js';
import { getAdapter } from './registry.js';
import { dispatchIntegrationTool } from './toolDispatch.js';
import { getConnection } from './db.js';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': config.frontendUrl,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(JSON.stringify(body));
}

function resolveUserId(req: IncomingMessage): string | null {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    return (jwt.verify(token, JWT_SECRET) as { sub: string }).sub;
  } catch {
    return null;
  }
}

/** Has the user connected this provider AND is it configured server-side? */
async function isLive(userId: string, provider: 'google' | 'todoist'): Promise<boolean> {
  const adapter = getAdapter(provider);
  if (!adapter?.isConfigured()) return false;
  return (await getConnection(userId, provider)) !== null;
}

export async function handleBriefRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/api/brief') return false;

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method not allowed' });
    return true;
  }

  const userId = resolveUserId(req);
  if (!userId) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return true;
  }

  const [googleLive, todoistLive] = await Promise.all([
    isLive(userId, 'google'),
    isLive(userId, 'todoist'),
  ]);

  // Fire the read tools we have connections for, in parallel. Each returns a
  // speakable summary + structured data; we surface both.
  const tasks: Array<Promise<{ key: string; ok: boolean; summary: string; data?: unknown }>> = [];
  const run = (key: string, tool: string, args: Record<string, unknown>) =>
    dispatchIntegrationTool(tool, args, userId).then((r) => ({ key, ok: r.ok, summary: r.summary, data: r.data }));

  if (googleLive) {
    tasks.push(run('calendar', 'list_calendar_events', { maxResults: 5 }));
    tasks.push(run('email', 'list_emails', { maxResults: 5, query: 'is:unread' }));
  }
  if (todoistLive) {
    tasks.push(run('tasks', 'list_tasks', { filter: 'today | overdue' }));
  }

  const settled = await Promise.allSettled(tasks);
  const sections: Record<string, { summary: string; data?: unknown }> = {};
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value.ok) {
      sections[s.value.key] = { summary: s.value.summary, data: s.value.data };
    }
  }

  sendJson(res, 200, {
    available: googleLive || todoistLive,
    connected: { google: googleLive, todoist: todoistLive },
    sections,
  });
  return true;
}
