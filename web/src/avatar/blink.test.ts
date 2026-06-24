import { describe, it, expect } from 'vitest';
import { nextBlinkDelay, BLINK_DURATION_MS } from './blink';

describe('nextBlinkDelay', () => {
  it('returns the lower bound (2000) when rand() === 0', () => {
    expect(nextBlinkDelay(() => 0)).toBe(2000);
  });

  it('returns the upper bound (6000) when rand() === 1', () => {
    expect(nextBlinkDelay(() => 1)).toBe(6000);
  });

  it('returns the midpoint (4000) when rand() === 0.5', () => {
    expect(nextBlinkDelay(() => 0.5)).toBe(4000);
  });

  it('always falls within [2000, 6000] for random inputs', () => {
    for (let i = 0; i < 1000; i++) {
      const delay = nextBlinkDelay(Math.random);
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThanOrEqual(6000);
    }
  });

  it('defaults to Math.random and stays in range', () => {
    const delay = nextBlinkDelay();
    expect(delay).toBeGreaterThanOrEqual(2000);
    expect(delay).toBeLessThanOrEqual(6000);
  });
});

describe('BLINK_DURATION_MS', () => {
  it('is a short, positive duration', () => {
    expect(BLINK_DURATION_MS).toBe(120);
    expect(BLINK_DURATION_MS).toBeGreaterThan(0);
  });
});
