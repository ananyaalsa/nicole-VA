import type { IncomingMessage } from 'node:http';

/**
 * A tiny in-memory fixed-window rate limiter — no external dependency, no Redis.
 * Good enough to blunt password brute-force / signup abuse on a single instance.
 * (For multi-instance you'd back this with a shared store; see the audit notes.)
 *
 * Keyed by client IP. Each key gets `max` hits per `windowMs`; over that, `hit()`
 * returns false (the caller should 429). Stale buckets are swept opportunistically.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Record a hit for `key`. Returns true if allowed, false if over the limit. */
  hit(key: string, nowMs = Date.now()): boolean {
    // Opportunistic sweep so the map can't grow unbounded from one-off IPs.
    if (this.buckets.size > 10_000) {
      for (const [k, b] of this.buckets) if (b.resetAt <= nowMs) this.buckets.delete(k);
    }
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= nowMs) {
      this.buckets.set(key, { count: 1, resetAt: nowMs + this.windowMs });
      return true;
    }
    if (b.count >= this.max) return false;
    b.count += 1;
    return true;
  }

  /** Seconds until the bucket for `key` resets (for a Retry-After header). */
  retryAfterSec(key: string, nowMs = Date.now()): number {
    const b = this.buckets.get(key);
    if (!b) return 0;
    return Math.max(0, Math.ceil((b.resetAt - nowMs) / 1000));
  }
}

/** Best-effort client IP, honoring a single x-forwarded-for hop (common behind a
 *  proxy/load balancer). Falls back to the socket address. */
export function clientIp(req: IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}
