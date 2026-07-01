// Link-preview enrichment: given a few URLs (from Nicole's web-search grounding),
// fetch each page's Open Graph metadata (title, image, site name) so the client
// can render rich link CARDS with a thumbnail — the "give me the actual links
// with pictures" experience for shoppable queries (Amazon, flights, hotels).
//
// Best-effort + safe: short timeout, capped count, only http(s), returns whatever
// it could resolve. No third-party API needed.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.js';
import { requireAuth } from '../auth/middleware.js';
import { readJsonBody } from '../http/readBody.js';

const MAX_URLS = 8;
const FETCH_TIMEOUT_MS = 4000;

export interface LinkPreview {
  url: string;
  title: string;
  image: string | null;
  site: string | null;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': config.frontendUrl,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(JSON.stringify(body));
}

/** Pull a meta property/name value out of raw HTML (first match). */
function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    // property="og:image" content="..."  OR  content="..." property="og:image"
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']|` +
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`,
      'i',
    );
    const m = re.exec(html);
    const val = m?.[1] ?? m?.[2];
    if (val) return val.trim();
  }
  return null;
}

function titleTag(html: string): string | null {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return m?.[1]?.trim() || null;
}

function hostname(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

/** Fetch one URL's preview. Never throws — returns a minimal record on failure. */
async function previewOne(url: string): Promise<LinkPreview> {
  const host = hostname(url);
  const fallback: LinkPreview = { url, title: host ?? url, image: null, site: host };
  if (!/^https?:\/\//i.test(url)) return fallback;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        // A desktop UA so sites return their normal OG-tagged HTML.
        'User-Agent': 'Mozilla/5.0 (compatible; NicoleBot/1.0; +https://alsatalk.ai)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html')) return fallback;
    // Only read the head-ish part; OG tags live near the top. Cap at 200KB.
    const buf = await res.text();
    const html = buf.slice(0, 200_000);
    const title = metaContent(html, ['og:title', 'twitter:title']) ?? titleTag(html) ?? fallback.title;
    let image = metaContent(html, ['og:image', 'twitter:image', 'twitter:image:src']);
    if (image && image.startsWith('//')) image = 'https:' + image;
    if (image && image.startsWith('/') && host) image = `https://${host}${image}`;
    const site = metaContent(html, ['og:site_name']) ?? host;
    return { url, title, image: image ?? null, site };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

export async function handleLinksRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/api/links/preview') return false;
  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return true; }
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'method not allowed' }); return true; }

  const userId = await requireAuth(req, res);
  if (!userId) return true;

  const body = await readJsonBody(req).catch(() => ({} as Record<string, unknown>));
  const urls = Array.isArray(body.urls) ? (body.urls as unknown[]).filter((u): u is string => typeof u === 'string') : [];
  const unique = [...new Set(urls)].slice(0, MAX_URLS);
  const previews = await Promise.all(unique.map(previewOne));
  sendJson(res, 200, { previews });
  return true;
}
