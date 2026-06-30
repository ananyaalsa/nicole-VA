import { describe, it, expect } from 'vitest';
import { streakFromDays } from './activityDb.js';

describe('activity/streakFromDays', () => {
  it('counts consecutive days ending today', () => {
    const days = ['2026-06-30', '2026-06-29', '2026-06-28'];
    expect(streakFromDays(days, '2026-06-30')).toBe(3);
  });

  it('allows the streak to start yesterday (no open yet today)', () => {
    // Today (07-01) not yet active, but the prior three days are — still a streak.
    const days = ['2026-06-30', '2026-06-29', '2026-06-28'];
    expect(streakFromDays(days, '2026-07-01')).toBe(3);
  });

  it('breaks on a gap', () => {
    const days = ['2026-06-30', '2026-06-28', '2026-06-27']; // 06-29 missing
    expect(streakFromDays(days, '2026-06-30')).toBe(1);
  });

  it('is 0 when neither today nor yesterday is active', () => {
    const days = ['2026-06-25', '2026-06-24'];
    expect(streakFromDays(days, '2026-06-30')).toBe(0);
  });

  it('is 0 with no active days', () => {
    expect(streakFromDays([], '2026-06-30')).toBe(0);
  });

  it('crosses a month boundary correctly', () => {
    const days = ['2026-07-01', '2026-06-30', '2026-06-29'];
    expect(streakFromDays(days, '2026-07-01')).toBe(3);
  });

  it('does not double-count duplicate day keys', () => {
    const days = ['2026-06-30', '2026-06-30', '2026-06-29'];
    expect(streakFromDays(days, '2026-06-30')).toBe(2);
  });
});
