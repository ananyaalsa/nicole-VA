// Tiny HTTP helpers shared by the provider adapters. Node 18+ has global fetch.

/** An upstream-provider HTTP failure. Carries the status for branching but NOT
 *  the raw response body — that can contain tokens/workspace metadata that must
 *  never propagate to a client-facing error. The body is logged server-side only. */
export class ProviderHttpError extends Error {
  constructor(public readonly status: number, public readonly url: string) {
    super(`Provider request failed (${status})`);
    this.name = 'ProviderHttpError';
  }
}

/** Log the upstream failure detail server-side (never returned to the client). */
function logProviderError(method: string, url: string, status: number, body: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[integrations] ${method} ${redactUrl(url)} → ${status}`, typeof body === 'string' ? body.slice(0, 500) : body);
}

/** Strip query strings (may carry tokens) from a URL before logging. */
function redactUrl(url: string): string {
  const i = url.indexOf('?');
  return i >= 0 ? url.slice(0, i) : url;
}

/** POST application/x-www-form-urlencoded (the OAuth token-exchange shape). */
export async function postForm(
  url: string,
  form: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(form).toString(),
  });
  const text = await res.text();
  const body = text ? safeJson(text) : {};
  if (!res.ok) {
    logProviderError('POST', url, res.status, body);
    throw new ProviderHttpError(res.status, redactUrl(url));
  }
  return body;
}

/** Authenticated JSON request (Bearer token). Returns parsed JSON or {}. */
export async function apiFetch(
  url: string,
  opts: {
    method?: string;
    token: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<any> {
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${opts.token}`,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const body = text ? safeJson(text) : {};
  if (!res.ok) {
    logProviderError(opts.method ?? 'GET', url, res.status, body);
    throw new ProviderHttpError(res.status, redactUrl(url));
  }
  return body;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
