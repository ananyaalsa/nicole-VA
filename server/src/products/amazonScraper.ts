import { chromium } from 'playwright';

export interface ScrapedProduct {
  title: string; price: string; image: string | null;
  rating: number | null; reviews: number | null; prime: boolean; url: string;
}

const BASE = 'https://www.amazon.com';

/** Pure HTML → products. Detects robot/CAPTCHA pages. No network. */
export function parseAmazonHtml(html: string): { blocked: boolean; products: ScrapedProduct[] } {
  if (/validateCaptcha|not a robot|Robot Check|Enter the characters you see/i.test(html)) {
    return { blocked: true, products: [] };
  }
  const products: ScrapedProduct[] = [];
  // Split on search-result tiles.
  const tiles = html.split(/data-component-type="s-search-result"/).slice(1);
  for (const tile of tiles) {
    const title = match(tile, /aria-label="([^"]+)"/) ?? match(tile, /<span>([^<]{6,})<\/span>/);
    const href = match(tile, /class="a-link-normal"[^>]*href="([^"]+)"/) ?? match(tile, /href="(\/dp\/[^"]+)"/);
    const price = match(tile, /class="a-offscreen">([^<]+)</);
    const image = match(tile, /class="s-image"[^>]*src="([^"]+)"/);
    const ratingRaw = match(tile, /class="a-icon-alt">([\d.]+) out of/);
    const reviewsRaw = match(tile, /s-underline-text">([\d,]+)</);
    const prime = /a-icon-prime/.test(tile);
    if (!title || !href || !price) continue; // require the essentials — no fabricated cards
    products.push({
      title: decode(title), price: decode(price),
      image: image ?? null,
      rating: ratingRaw ? Number(ratingRaw) : null,
      reviews: reviewsRaw ? Number(reviewsRaw.replace(/,/g, '')) : null,
      prime,
      url: href.startsWith('http') ? href : BASE + href,
    });
  }
  return { blocked: false, products };
}

function match(s: string, re: RegExp): string | null { const m = s.match(re); return m ? m[1] : null; }
function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

/** Fetch Amazon search via a headless browser, then parse. Caller wraps in a timeout. */
export async function scrapeAmazon(query: string, limit: number): Promise<{ blocked: boolean; products: ScrapedProduct[] }> {
  const url = `${BASE}/s?k=${encodeURIComponent(query)}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      locale: 'en-US',
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const html = await page.content();
    const { blocked, products } = parseAmazonHtml(html);
    return { blocked, products: products.slice(0, limit) };
  } finally {
    await browser.close();
  }
}
