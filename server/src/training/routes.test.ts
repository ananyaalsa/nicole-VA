import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Config loads at import time.
process.env.GEMINI_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://x';

const {
  mockListProfilesFull,
  mockGenerateCustomSpec,
  mockSaveTrainingRun,
  mockListTrainingHistory,
  mockGetTrainingRun,
} = vi.hoisted(() => ({
  mockListProfilesFull: vi.fn(),
  mockGenerateCustomSpec: vi.fn(),
  mockSaveTrainingRun: vi.fn(),
  mockListTrainingHistory: vi.fn(),
  mockGetTrainingRun: vi.fn(),
}));

vi.mock('./profiles.js', () => ({
  listProfilesFull: mockListProfilesFull,
}));
vi.mock('./specGenerator.js', () => ({
  generateCustomSpec: mockGenerateCustomSpec,
}));
vi.mock('./historyDb.js', () => ({
  saveTrainingRun: mockSaveTrainingRun,
  listTrainingHistory: mockListTrainingHistory,
  getTrainingRun: mockGetTrainingRun,
}));

import { handleTrainingRoute } from './routes.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeReq(method: string, url: string, body?: unknown): IncomingMessage {
  const req = new EventEmitter() as unknown as IncomingMessage;
  (req as any).method = method;
  (req as any).url = url;
  // Emit the body on next tick so listeners attached inside the handler fire.
  if (body !== undefined) {
    queueMicrotask(() => {
      req.emit('data', Buffer.from(JSON.stringify(body)));
      req.emit('end');
    });
  } else {
    queueMicrotask(() => req.emit('end'));
  }
  return req;
}

interface CapturedRes {
  res: ServerResponse;
  status: () => number;
  json: () => any;
}

function makeRes(): CapturedRes {
  let status = 0;
  let payload = '';
  const res = {
    writeHead(s: number) {
      status = s;
      return res;
    },
    end(text?: string) {
      payload = text ?? '';
      return res;
    },
  } as unknown as ServerResponse;
  return {
    res,
    status: () => status,
    json: () => (payload ? JSON.parse(payload) : undefined),
  };
}

describe('training/routes', () => {
  beforeEach(() => {
    mockListProfilesFull.mockReset();
    mockGenerateCustomSpec.mockReset();
    mockSaveTrainingRun.mockReset();
    mockListTrainingHistory.mockReset();
    mockGetTrainingRun.mockReset();
  });

  it('returns false for a non-training path', async () => {
    const { res } = makeRes();
    const handled = await handleTrainingRoute(makeReq('GET', '/api/memory'), res);
    expect(handled).toBe(false);
  });

  it('GET /api/training/profiles returns the full profile list', async () => {
    mockListProfilesFull.mockReturnValue([{ id: 'sales', name: 'Sales Coach' }]);
    const cap = makeRes();
    const handled = await handleTrainingRoute(makeReq('GET', '/api/training/profiles'), cap.res);
    expect(handled).toBe(true);
    expect(cap.status()).toBe(200);
    expect(cap.json().profiles).toEqual([{ id: 'sales', name: 'Sales Coach' }]);
  });

  it('POST /api/training/generate calls generateCustomSpec and returns the spec', async () => {
    mockGenerateCustomSpec.mockResolvedValue({ ok: true, spec: { id: 'x', title: 'T' } });
    const cap = makeRes();
    const handled = await handleTrainingRoute(
      makeReq('POST', '/api/training/generate', { skill: 'negotiation', title: 'Deal' }),
      cap.res,
    );
    expect(handled).toBe(true);
    expect(cap.status()).toBe(200);
    expect(mockGenerateCustomSpec).toHaveBeenCalledTimes(1);
    const [input, id] = mockGenerateCustomSpec.mock.calls[0];
    expect(input.skill).toBe('negotiation');
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^custom-/);
    expect(cap.json()).toEqual({ ok: true, spec: { id: 'x', title: 'T' } });
  });

  it('POST /api/training/generate surfaces a generation failure', async () => {
    mockGenerateCustomSpec.mockResolvedValue({ ok: false, error: 'bad json' });
    const cap = makeRes();
    await handleTrainingRoute(makeReq('POST', '/api/training/generate', { title: 'X' }), cap.res);
    expect(cap.json()).toEqual({ ok: false, error: 'bad json' });
  });

  it('GET /api/training/history lists runs', async () => {
    mockListTrainingHistory.mockResolvedValue([{ id: 1, title: 'Run' }]);
    const cap = makeRes();
    const handled = await handleTrainingRoute(makeReq('GET', '/api/training/history'), cap.res);
    expect(handled).toBe(true);
    expect(cap.status()).toBe(200);
    expect(cap.json().runs).toEqual([{ id: 1, title: 'Run' }]);
  });

  it('POST /api/training/history saves a run and returns its id', async () => {
    mockSaveTrainingRun.mockResolvedValue({ id: 99 });
    const cap = makeRes();
    const handled = await handleTrainingRoute(
      makeReq('POST', '/api/training/history', { kind: 'roleplay', title: 'My Run' }),
      cap.res,
    );
    expect(handled).toBe(true);
    expect(cap.status()).toBe(200);
    expect(mockSaveTrainingRun).toHaveBeenCalledTimes(1);
    expect(mockSaveTrainingRun.mock.calls[0][0].title).toBe('My Run');
    expect(cap.json()).toEqual({ id: 99 });
  });

  it('POST /api/training/history rejects when title is missing', async () => {
    const cap = makeRes();
    await handleTrainingRoute(makeReq('POST', '/api/training/history', { kind: 'roleplay' }), cap.res);
    expect(cap.status()).toBe(400);
    expect(mockSaveTrainingRun).not.toHaveBeenCalled();
  });

  it('GET /api/training/history/:id returns one run', async () => {
    mockGetTrainingRun.mockResolvedValue({ id: 5, title: 'One' });
    const cap = makeRes();
    const handled = await handleTrainingRoute(makeReq('GET', '/api/training/history/5'), cap.res);
    expect(handled).toBe(true);
    expect(cap.status()).toBe(200);
    expect(mockGetTrainingRun).toHaveBeenCalledWith(expect.any(String), 5);
    expect(cap.json().run).toEqual({ id: 5, title: 'One' });
  });

  it('GET /api/training/history/:id 404s when missing', async () => {
    mockGetTrainingRun.mockResolvedValue(null);
    const cap = makeRes();
    await handleTrainingRoute(makeReq('GET', '/api/training/history/777'), cap.res);
    expect(cap.status()).toBe(404);
  });
});
