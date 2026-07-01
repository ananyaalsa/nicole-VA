import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

process.env.GEMINI_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://x';

import { handleLinksRoute } from './routes.js';

const TEST_TOKEN = jwt.sign({ sub: 'test-user' }, process.env.JWT_SECRET ?? 'nicole-dev-secret');

function makeReqRes(method: string, path: string, body?: any) {
  const listeners: Record<string, (arg?: any) => void> = {};
  const req: any = {
    method,
    url: path,
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
    on: (ev: string, cb: (arg?: any) => void) => {
      listeners[ev] = cb;
      if (ev === 'end') {
        queueMicrotask(() => {
          if (body !== undefined) listeners['data']?.(JSON.stringify(body));
          listeners['end']?.();
        });
      }
      return req;
    },
  };
  const res: any = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    bodyText: '',
    writeHead(status: number, headers: Record<string, string>) { this.statusCode = status; this.headers = headers; },
    end(text: string) { this.bodyText = text ?? ''; this._done?.(); },
    _done: undefined as undefined | (() => void),
  };
  const done = new Promise<void>((resolve) => (res._done = resolve));
  return { req, res, done };
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('handleLinksRoute', () => {
  it('returns false for non-links paths', async () => {
    const { req, res } = makeReqRes('GET', '/api/memory');
    expect(await handleLinksRoute(req, res)).toBe(false);
  });

  it('enriches URLs with OG title + image (best-effort)', async () => {
    const html = `<html><head>
      <meta property="og:title" content="Cool Widget">
      <meta property="og:image" content="https://img.example.com/w.jpg">
      <meta property="og:site_name" content="ExampleShop">
    </head></html>`;
    vi.stubGlobal('fetch', vi.fn(async () => ({
      headers: { get: (k: string) => (k === 'content-type' ? 'text/html; charset=utf-8' : null) },
      text: async () => html,
    })) as any);

    const { req, res, done } = makeReqRes('POST', '/api/links/preview', { urls: ['https://example.com/widget'] });
    expect(await handleLinksRoute(req, res)).toBe(true);
    await done;
    const out = JSON.parse(res.bodyText);
    expect(out.previews).toHaveLength(1);
    expect(out.previews[0].title).toBe('Cool Widget');
    expect(out.previews[0].image).toBe('https://img.example.com/w.jpg');
    expect(out.previews[0].site).toBe('ExampleShop');
  });

  it('falls back to hostname when a fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }) as any);
    const { req, res, done } = makeReqRes('POST', '/api/links/preview', { urls: ['https://shop.acme.com/x'] });
    await handleLinksRoute(req, res);
    await done;
    const out = JSON.parse(res.bodyText);
    expect(out.previews[0].image).toBeNull();
    expect(out.previews[0].site).toBe('shop.acme.com');
  });

  it('ignores non-http(s) urls (no fetch) and caps the count', async () => {
    const spy = vi.fn(async () => { throw new Error('should not fetch'); });
    vi.stubGlobal('fetch', spy as any);
    const { req, res, done } = makeReqRes('POST', '/api/links/preview', { urls: ['ftp://x', 'javascript:alert(1)'] });
    await handleLinksRoute(req, res);
    await done;
    const out = JSON.parse(res.bodyText);
    expect(out.previews).toHaveLength(2);
    expect(spy).not.toHaveBeenCalled();
  });
});
