import { describe, it, expect, beforeEach, vi } from 'vitest';

process.env.GEMINI_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://x';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('pg', () => ({
  default: { Pool: vi.fn(() => ({ query: mockQuery, end: vi.fn() })) },
  Pool: vi.fn(() => ({ query: mockQuery, end: vi.fn() })),
}));

import { setLiveStatus, getLiveStatus, formatLiveStatusLine } from './liveStatus.js';

describe('liveStatus store (Postgres-backed)', () => {
  beforeEach(() => mockQuery.mockReset());

  it('upserts the per-user status row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await setLiveStatus('u1', { mode: 'training', state: 'active', skill: 'Cold-call open', startedAt: 1000 });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO nicole2_live_status/);
    expect(sql).toMatch(/ON CONFLICT \(user_id\) DO UPDATE/);
    expect(params[0]).toBe('u1');
    expect(JSON.parse(params[1]).skill).toBe('Cold-call open');
  });

  it('reads a recent status row back', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ status: { mode: 'training', state: 'active', skill: 'Cold-call open', startedAt: 1000 }, updated_at: new Date().toISOString() }],
    });
    const s = await getLiveStatus('u1');
    expect(s?.skill).toBe('Cold-call open');
  });

  it('returns null when there is no row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await getLiveStatus('u2')).toBeNull();
  });

  it('drops a stale row (older than the 15-min window)', async () => {
    const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    mockQuery.mockResolvedValueOnce({ rows: [{ status: { mode: 'training', state: 'active', startedAt: 1 }, updated_at: old }] });
    expect(await getLiveStatus('u1')).toBeNull();
  });

  it('never throws on a DB error (best-effort)', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    await expect(setLiveStatus('u1', { mode: 'training', state: 'active', startedAt: 1 })).resolves.toBeUndefined();
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    expect(await getLiveStatus('u1')).toBeNull();
  });
});

describe('formatLiveStatusLine', () => {
  const now = 600_000;
  it('describes an active drill', () => {
    const line = formatLiveStatusLine({ mode: 'training', state: 'active', skill: 'Cold-call open', startedAt: now - 180_000 }, now);
    expect(line).toContain('currently in a Training drill');
    expect(line).toContain('Cold-call open');
  });
  it('describes a just-completed roleplay with score', () => {
    const line = formatLiveStatusLine({ mode: 'roleplay', state: 'finished', skill: 'Pricing call', startedAt: now - 300_000, finishedAt: now - 60_000, score: 6.4 }, now);
    expect(line).toContain('COMPLETED a Roleplay');
    expect(line).toContain('6.4');
  });
  it('describes a LEFT drill so Nicole does not congratulate it', () => {
    const line = formatLiveStatusLine({ mode: 'training', state: 'left', skill: 'Cold-call open', startedAt: now - 60_000, finishedAt: now - 5000 }, now);
    expect(line).toContain('LEFT WITHOUT completing');
    expect(line).not.toContain('COMPLETED a Training'); // never implies completion
  });
  it('describes entered-but-not-started', () => {
    const line = formatLiveStatusLine({ mode: 'training', state: 'entered', startedAt: now - 5000 }, now);
    expect(line).toContain("hasn't started");
  });
  it('returns null when stale (>15 min)', () => {
    expect(formatLiveStatusLine({ mode: 'training', state: 'active', startedAt: now - 16 * 60_000 }, now)).toBeNull();
  });
});
