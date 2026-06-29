// Tiny HTTP helpers shared by the provider adapters. Node 18+ has global fetch.

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
    throw new Error(`POST ${url} → ${res.status}: ${typeof body === 'object' ? JSON.stringify(body) : text}`);
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
    throw new Error(`${opts.method ?? 'GET'} ${url} → ${res.status}: ${typeof body === 'object' ? JSON.stringify(body) : text}`);
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
