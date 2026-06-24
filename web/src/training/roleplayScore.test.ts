import { describe, it, expect } from 'vitest';
import { scoreRoleplay } from './roleplayScore';

describe('scoreRoleplay', () => {
  it('is 0 when there were no turns and no words', () => {
    expect(scoreRoleplay(0, 0)).toBe(0);
  });

  it('gives a low score for a single short turn', () => {
    const low = scoreRoleplay(1, 3);
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(4);
  });

  it('gives a high score for many turns with many words, capped at 10', () => {
    const high = scoreRoleplay(40, 600);
    expect(high).toBe(10);
  });

  it('never exceeds 10 no matter how large the inputs', () => {
    expect(scoreRoleplay(1000, 100000)).toBe(10);
  });

  it('never goes below 0 for nonsensical negative inputs', () => {
    expect(scoreRoleplay(-5, -10)).toBe(0);
  });

  it('is monotonic non-decreasing in the number of turns', () => {
    let prev = -1;
    for (let turns = 0; turns <= 30; turns++) {
      const s = scoreRoleplay(turns, 20);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('is monotonic non-decreasing in the number of words', () => {
    let prev = -1;
    for (let words = 0; words <= 400; words += 10) {
      const s = scoreRoleplay(4, words);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('rewards a fuller rep over a thinner one', () => {
    const thin = scoreRoleplay(2, 10);
    const full = scoreRoleplay(8, 120);
    expect(full).toBeGreaterThan(thin);
  });
});
