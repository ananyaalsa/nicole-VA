import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestScore, postLiveStatus } from './scoreApi';

beforeEach(() => { vi.restoreAllMocks(); });

describe('requestScore', () => {
  it('POSTs and returns the scorecard', async () => {
    const sc = { overallScore: 7, band: 'proficient', scores: [], signals: {}, headline: 'h', worked: {}, fix: {}, nextTime: '', spoken: '' };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ scorecard: sc }) })) as any);
    const out = await requestScore({ kind: 'training', dimensions: [], transcript: [] });
    expect(out.overallScore).toBe(7);
  });
});

describe('postLiveStatus', () => {
  it('never throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }) as any);
    await expect(postLiveStatus({ mode: 'training', state: 'entered', startedAt: 1 })).resolves.toBeUndefined();
  });
});
