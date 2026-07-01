import { scrapeAmazon, type ScrapedProduct } from './amazonScraper.js';

export interface ProductSearchResult { blocked: boolean; products: ScrapedProduct[]; }
export type ProductSearchProvider = (query: string, limit: number) => Promise<ProductSearchResult>;

interface SearchOpts { limit?: number; timeoutMs?: number; provider?: ProductSearchProvider; }

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; result: ProductSearchResult }>();
const norm = (q: string) => q.trim().toLowerCase();

const FALLBACK: ProductSearchResult = { blocked: true, products: [] };

export async function searchProducts(query: string, opts: SearchOpts = {}): Promise<ProductSearchResult> {
  const limit = opts.limit ?? 5;
  const timeoutMs = opts.timeoutMs ?? 16_000;
  const provider = opts.provider ?? scrapeAmazon;
  const key = norm(query);

  // Note: no Date.now() ban here — this is server code (unlike workflow scripts).
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ProductSearchResult>((resolve) => { timer = setTimeout(() => resolve(FALLBACK), timeoutMs); });
  try {
    const result = await Promise.race([provider(key, limit), timeout]);
    if (!result.blocked && result.products.length) cache.set(key, { at: Date.now(), result });
    return result;
  } catch {
    return FALLBACK;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
