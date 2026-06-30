import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

process.env.GEMINI_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://x';

// Mock the DB layer so no real Postgres is needed.
const { markActive, recentActiveDays } = vi.hoisted(() => ({
  markActive: vi.fn(),
  recentActiveDays: vi.fn(),
}));
vi.mock('./activityDb.js', async () => {
  const actual = await vi.importActual<typeof import('./activityDb.js')>('./activityDb.js');
  return { ...actual, markActive, recentActiveDays };
});

import { handleActivityRoute } from './routes.js';

const TEST_TOKEN = jwt.sign({ sub: 'test-user' }, process.env.JWT_SECRET ?? 'nicole-dev-secret');

function makeReqRes(method: string, path: string, body?: any) {
  const listeners: Record<string, (arg?: any) => void> = {};
  const req: any = {
    method,
    url: path,
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
    on: (ev: string, cb: (arg?: any) => void) => {
      listeners[ev] = cb;
      if (ev === 'end') {
        queueMicrotask(() => {
          if (body !== undefined) listeners['data']?.(JSON.stringify(body));
          listeners['end']?.();
        });
      }
      return req;
    },
  };
  const res: any = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    bodyText: '',
    writeHead(status: number, headers: Record<string, string>) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(text: string) {
      this.bodyText = text ?? '';
      this._done?.();
    },
    _done: undefined as undefined | (() => void),
  };
  const done = new Promise<void>((resolve) => (res._done = resolve));
  return { req, res, done };
}

beforeEach(() => {
  markActive.mockReset();
  recentActiveDays.mockReset();
});

describe('handleActivityRoute', () => {
  it('returns false for non-activity paths', async () => {
    const { req, res } = makeReqRes('GET', '/api/memory');
    expect(await handleActivityRoute(req, res)).toBe(false);
  });

  it('POST /api/activity/ping marks today active and returns the streak', async () => {
    markActive.mockResolvedValue(undefined);
    recentActiveDays.mockResolvedValue(['2026-06-30', '2026-06-29']);
    const { req, res, done } = makeReqRes('POST', '/api/activity/ping', { day: '2026-06-30' });
    expect(await handleActivityRoute(req, res)).toBe(true);
    await done;
    expect(markActive).toHaveBeenCalledWith('test-user', '2026-06-30');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.bodyText)).toEqual({ streak: 2 });
  });

  it('GET /api/activity/streak returns the streak without writing', async () => {
    recentActiveDays.mockResolvedValue(['2026-06-30']);
    const { req, res, done } = makeReqRes('GET', '/api/activity/streak?day=2026-06-30');
    expect(await handleActivityRoute(req, res)).toBe(true);
    await done;
    expect(markActive).not.toHaveBeenCalled();
    expect(JSON.parse(res.bodyText)).toEqual({ streak: 1 });
  });

  it('falls back to a server day when an invalid day is sent', async () => {
    markActive.mockResolvedValue(undefined);
    recentActiveDays.mockResolvedValue([]);
    const { req, res, done } = makeReqRes('POST', '/api/activity/ping', { day: 'garbage' });
    await handleActivityRoute(req, res);
    await done;
    // markActive still called with *some* valid YYYY-MM-DD (the server's own day).
    expect(markActive).toHaveBeenCalledWith('test-user', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(res.statusCode).toBe(200);
  });
});
