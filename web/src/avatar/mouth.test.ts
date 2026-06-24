import { describe, it, expect } from 'vitest';
import { mouthOpenness, visemeFromOpenness } from './mouth';

describe('mouthOpenness', () => {
  it('stays at ~0 when amplitude is 0 and prev is 0', () => {
    expect(mouthOpenness(0, 0)).toBeCloseTo(0, 5);
  });

  it('moves meaningfully toward open after one step from silence', () => {
    const step = mouthOpenness(1, 0);
    // target = clamp(1 * 1.4) = 1; one smoothing step from 0 => 0.5
    expect(step).toBeGreaterThan(0.3);
  });

  it('is monotonically increasing across steps toward 1 with loud input', () => {
    let prev = 0;
    let last = prev;
    for (let i = 0; i < 10; i++) {
      const next = mouthOpenness(1, prev);
      expect(next).toBeGreaterThan(last);
      expect(next).toBeLessThanOrEqual(1);
      last = next;
      prev = next;
    }
  });

  it('trends back toward 0 when amplitude drops to silence', () => {
    const high = mouthOpenness(1, 0.9);
    const dropping = mouthOpenness(0, high);
    expect(dropping).toBeLessThan(high);
  });

  it('clamps the result to <= 1 even when amplitude exceeds 1', () => {
    expect(mouthOpenness(5, 1)).toBeLessThanOrEqual(1);
    expect(mouthOpenness(100, 0.9)).toBeLessThanOrEqual(1);
  });

  it('clamps negative amplitude to 0 (target trends down)', () => {
    const result = mouthOpenness(-3, 0.5);
    expect(result).toBeLessThan(0.5);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('defaults prev to 0', () => {
    expect(mouthOpenness(0)).toBeCloseTo(0, 5);
  });
});

describe('visemeFromOpenness', () => {
  it('maps 0.1 to closed', () => {
    expect(visemeFromOpenness(0.1)).toBe('closed');
  });

  it('maps 0.4 to mid', () => {
    expect(visemeFromOpenness(0.4)).toBe('mid');
  });

  it('maps 0.9 to open', () => {
    expect(visemeFromOpenness(0.9)).toBe('open');
  });

  it('honors exact thresholds (0.15 -> mid, 0.55 -> open)', () => {
    expect(visemeFromOpenness(0.149)).toBe('closed');
    expect(visemeFromOpenness(0.15)).toBe('mid');
    expect(visemeFromOpenness(0.549)).toBe('mid');
    expect(visemeFromOpenness(0.55)).toBe('open');
  });
});
