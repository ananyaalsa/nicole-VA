import { describe, it, expect } from 'vitest';
import { RateLimiter } from './rateLimit.js';

describe('RateLimiter', () => {
  it('allows up to `max` hits then blocks within the window', () => {
    const rl = new RateLimiter(3, 1000);
    const t = 1000;
    expect(rl.hit('ip', t)).toBe(true);
    expect(rl.hit('ip', t)).toBe(true);
    expect(rl.hit('ip', t)).toBe(true);
    expect(rl.hit('ip', t)).toBe(false); // 4th over the limit
  });

  it('resets after the window elapses', () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.hit('ip', 1000)).toBe(true);
    expect(rl.hit('ip', 1500)).toBe(false); // still in window
    expect(rl.hit('ip', 2001)).toBe(true); // window passed → allowed again
  });

  it('tracks keys independently', () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.hit('a', 1000)).toBe(true);
    expect(rl.hit('b', 1000)).toBe(true); // different key, own bucket
    expect(rl.hit('a', 1000)).toBe(false);
  });

  it('reports seconds until reset', () => {
    const rl = new RateLimiter(1, 10_000);
    rl.hit('ip', 1000);
    expect(rl.retryAfterSec('ip', 1000)).toBe(10);
    expect(rl.retryAfterSec('ip', 6000)).toBe(5);
  });
});
