import { describe, it, expect, vi } from 'vitest';
import { searchProducts } from './productSearch.js';

const P = (title: string) => ({ title, price: '$1', image: null, rating: null, reviews: null, prime: false, url: 'u' });

describe('searchProducts', () => {
  it('returns provider results and caches them per query', async () => {
    const provider = vi.fn().mockResolvedValue({ blocked: false, products: [P('a')] });
    const r1 = await searchProducts('Headset ', { provider, limit: 5 });
    const r2 = await searchProducts('headset', { provider, limit: 5 }); // normalized → cache hit
    expect(r1.products).toHaveLength(1);
    expect(r2.products).toHaveLength(1);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('falls back to blocked on provider throw', async () => {
    const provider = vi.fn().mockRejectedValue(new Error('boom'));
    const r = await searchProducts('xyz-throw', { provider });
    expect(r).toEqual({ blocked: true, products: [] });
  });

  it('falls back to blocked on timeout', async () => {
    const provider = vi.fn(() => new Promise<never>(() => { /* never resolves */ }));
    const r = await searchProducts('xyz-timeout', { provider, timeoutMs: 20 });
    expect(r).toEqual({ blocked: true, products: [] });
  });
});
