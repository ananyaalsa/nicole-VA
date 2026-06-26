import { describe, it, expect } from 'vitest';
import { setLiveStatus, getLiveStatus, formatLiveStatusLine } from './liveStatus.js';

describe('liveStatus store', () => {
  it('stores and reads per-user status', () => {
    setLiveStatus('u1', { mode: 'training', state: 'active', skill: 'Cold-call open', startedAt: 1000 });
    expect(getLiveStatus('u1')?.skill).toBe('Cold-call open');
    expect(getLiveStatus('u2')).toBeNull();
  });
});

describe('formatLiveStatusLine', () => {
  const now = 600_000;
  it('describes an active drill', () => {
    const line = formatLiveStatusLine({ mode: 'training', state: 'active', skill: 'Cold-call open', startedAt: now - 180_000 }, now);
    expect(line).toContain('currently in a Training drill');
    expect(line).toContain('Cold-call open');
  });
  it('describes a just-finished roleplay with score', () => {
    const line = formatLiveStatusLine({ mode: 'roleplay', state: 'finished', skill: 'Pricing call', startedAt: now - 300_000, finishedAt: now - 60_000, score: 6.4 }, now);
    expect(line).toContain('just finished a Roleplay');
    expect(line).toContain('6.4');
  });
  it('describes entered-but-not-started', () => {
    const line = formatLiveStatusLine({ mode: 'training', state: 'entered', startedAt: now - 5000 }, now);
    expect(line).toContain("hasn't started");
  });
  it('returns null when stale (>15 min)', () => {
    expect(formatLiveStatusLine({ mode: 'training', state: 'active', startedAt: now - 16 * 60_000 }, now)).toBeNull();
  });
});
