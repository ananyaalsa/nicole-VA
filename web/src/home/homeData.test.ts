import { describe, it, expect } from 'vitest';
import { coachStats } from './homeData';
import type { TrainingRun } from '../training/trainingApi';

/** Minimal run factory — only the fields coachStats reads. */
function run(createdAt: string, score: number | null = 7): TrainingRun {
  return {
    id: Math.floor(Math.abs(Math.sin(createdAt.length) * 1e6)),
    userId: 'u', kind: 'training', profileId: null, personaId: null, scenarioId: null,
    title: 'Drill', score, scorecard: [], transcript: null, createdAt,
  };
}

describe('coachStats — streak', () => {
  it('counts consecutive days INCLUDING across a month boundary', () => {
    // Runs on Jun 1, May 31, May 30 — a 3-day streak that spans May→June. The old
    // dayKey used a 0-indexed unpadded month; this guards the corrected key + the
    // day-by-day walk (which rolls the month over via the Date object).
    const now = new Date('2026-06-01T18:00:00');
    const runs = [
      run('2026-06-01T09:00:00'),
      run('2026-05-31T09:00:00'),
      run('2026-05-30T09:00:00'),
    ];
    expect(coachStats(runs, now).streak).toBe(3);
  });

  it('breaks the streak on a missing day', () => {
    const now = new Date('2026-06-10T18:00:00');
    const runs = [run('2026-06-10T09:00:00'), run('2026-06-08T09:00:00')]; // gap on the 9th
    expect(coachStats(runs, now).streak).toBe(1);
  });

  it('allows the streak to start yesterday (evening gap)', () => {
    const now = new Date('2026-06-10T23:00:00'); // nothing today yet
    const runs = [run('2026-06-09T09:00:00'), run('2026-06-08T09:00:00')];
    expect(coachStats(runs, now).streak).toBe(2);
  });

  it('reports the most recent score and trend', () => {
    const now = new Date('2026-06-10T18:00:00');
    const runs = [run('2026-06-10T09:00:00', 8), run('2026-06-09T09:00:00', 5)];
    const s = coachStats(runs, now);
    expect(s.lastScore).toBe(8);
    expect(s.trend).toBe('up');
  });

  it('handles no runs', () => {
    expect(coachStats([]).streak).toBe(0);
    expect(coachStats([]).lastScore).toBeNull();
  });
});
