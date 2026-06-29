import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

process.env.GEMINI_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://x';

// Mock pg with a tiny in-memory upsert/read so the route's now-async DB-backed
// liveStatus round-trips deterministically (no real database).
const { store, mockQuery } = vi.hoisted(() => {
  const store = new Map<string, any>();
  const mockQuery = vi.fn(async (sql: string, params: any[]) => {
    if (/INSERT INTO nicole2_live_status/.test(sql)) {
      store.set(params[0], { status: params[1], updated_at: new Date().toISOString() });
      return { rows: [] };
    }
    if (/SELECT status, updated_at FROM nicole2_live_status/.test(sql)) {
      const row = store.get(params[0]);
      return { rows: row ? [row] : [] };
    }
    return { rows: [] };
  });
  return { store, mockQuery };
});
vi.mock('pg', () => ({
  default: { Pool: vi.fn(() => ({ query: mockQuery, end: vi.fn() })) },
  Pool: vi.fn(() => ({ query: mockQuery, end: vi.fn() })),
}));

import { handleSessionRoute } from './routes.js';

function mockReqRes(method: string, path: string, body?: unknown) {
  const req = new IncomingMessage(new Socket());
  req.method = method; req.url = path; req.headers = {};
  const res = new ServerResponse(req);
  let status = 0; const chunks: string[] = [];
  // @ts-expect-error
  res.writeHead = (s: number) => { status = s; return res; };
  // @ts-expect-error
  res.end = (c?: string) => { if (c) chunks.push(c); };
  process.nextTick(() => {
    if (body !== undefined) req.emit('data', JSON.stringify(body));
    req.emit('end');
  });
  return { req, res, get status() { return status; }, get body() { return chunks.join(''); } };
}

describe('/api/session/status', () => {
  beforeEach(() => store.clear());

  it('upserts then reads the status for the default user', async () => {
    const post = mockReqRes('POST', '/api/session/status', { mode: 'training', state: 'active', skill: 'Cold-call open', startedAt: 1234 });
    expect(await handleSessionRoute(post.req, post.res)).toBe(true);
    expect(JSON.parse(post.body).ok).toBe(true);

    const get = mockReqRes('GET', '/api/session/status');
    await handleSessionRoute(get.req, get.res);
    expect(JSON.parse(get.body).status.skill).toBe('Cold-call open');
  });

  it('ignores non-session paths', async () => {
    const m = mockReqRes('GET', '/api/other');
    expect(await handleSessionRoute(m.req, m.res)).toBe(false);
  });
});
