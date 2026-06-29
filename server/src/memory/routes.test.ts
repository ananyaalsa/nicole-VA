import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

process.env.GEMINI_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://x';

// Mock the DB layer so no real Postgres is needed. Use vi.hoisted so the mock
// functions exist before vi.mock's factory (which is hoisted to the top) runs.
const { loadFacts, saveFact, forgetFact } = vi.hoisted(() => ({
  loadFacts: vi.fn(),
  saveFact: vi.fn(),
  forgetFact: vi.fn(),
}));
vi.mock('./db.js', () => ({ loadFacts, saveFact, forgetFact }));

import { handleMemoryRoute } from './routes.js';

// The route now requires a valid JWT (Authorization: Bearer <token>); mint one
// with the same default dev secret the middleware uses.
const TEST_TOKEN = jwt.sign({ sub: 'test-user' }, process.env.JWT_SECRET ?? 'nicole-dev-secret');

/** Build a fake req/res pair; res captures status + body. */
function makeReqRes(method: string, path: string, body?: any) {
  const listeners: Record<string, (arg?: any) => void> = {};
  const req: any = {
    method,
    url: path,
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
    on: (ev: string, cb: (arg?: any) => void) => {
      listeners[ev] = cb;
      // Emit the body only once the consumer has registered its 'end' listener.
      // The route now awaits auth before readBody(), so a one-shot microtask
      // could fire before the listeners exist — drive it off 'end' registration.
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
  loadFacts.mockReset();
  saveFact.mockReset();
  forgetFact.mockReset();
});

describe('handleMemoryRoute', () => {
  it('returns false for non-memory paths', async () => {
    const { req, res } = makeReqRes('GET', '/something-else');
    const handled = await handleMemoryRoute(req, res);
    expect(handled).toBe(false);
  });

  it('GET /api/memory returns the facts', async () => {
    loadFacts.mockResolvedValue([{ key: 'name', fact: 'Gaurav' }]);
    const { req, res, done } = makeReqRes('GET', '/api/memory');
    const handled = await handleMemoryRoute(req, res);
    await done;
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.bodyText)).toEqual({ facts: [{ key: 'name', fact: 'Gaurav' }] });
  });

  it('POST /api/memory upserts a fact', async () => {
    saveFact.mockResolvedValue({ key: 'name', fact: 'Gaurav' });
    const { req, res, done } = makeReqRes('POST', '/api/memory', { fact: 'Gaurav runs Alsatronix' });
    await handleMemoryRoute(req, res);
    await done;
    expect(saveFact).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('POST /api/memory without fact is a 400', async () => {
    const { req, res, done } = makeReqRes('POST', '/api/memory', { key: 'x' });
    await handleMemoryRoute(req, res);
    await done;
    expect(res.statusCode).toBe(400);
    expect(saveFact).not.toHaveBeenCalled();
  });

  it('DELETE /api/memory/:key forgets a fact', async () => {
    forgetFact.mockResolvedValue(undefined);
    const { req, res, done } = makeReqRes('DELETE', '/api/memory/name');
    await handleMemoryRoute(req, res);
    await done;
    expect(forgetFact).toHaveBeenCalledWith(expect.any(String), 'name');
    expect(res.statusCode).toBe(200);
  });
});
