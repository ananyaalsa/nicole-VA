// Notion adapter — search pages, create a page, append text to a page.
//
// Notion OAuth: token exchange uses HTTP Basic auth (client_id:client_secret).
// Access tokens do NOT expire, so there's no refresh(). All API calls require
// the Notion-Version header.

import { integrationsConfig } from '../../config.js';
import { apiFetch } from '../http.js';
import type { ProviderAdapter, ToolDecl, ToolAction, ToolResult, ActionContext } from '../types.js';

const AUTH_URL = 'https://api.notion.com/v1/oauth/authorize';
const TOKEN_URL = 'https://api.notion.com/v1/oauth/token';
const NOTION_VERSION = '2022-06-28';

function creds() {
  return integrationsConfig.notion;
}

function notionHeaders(): Record<string, string> {
  return { 'Notion-Version': NOTION_VERSION };
}

export const notionAdapter: ProviderAdapter = {
  id: 'notion',
  name: 'Notion',
  description: 'Search your notes & docs, capture new pages',
  scopes: [],

  isConfigured() {
    const c = creds();
    return Boolean(c.clientId && c.clientSecret);
  },

  getAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: creds().clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      owner: 'user',
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeCode(code, redirectUri) {
    const basic = Buffer.from(`${creds().clientId}:${creds().clientSecret}`).toString('base64');
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });
    const body = (await res.json()) as any;
    if (!res.ok) throw new Error(`Notion token exchange ${res.status}: ${JSON.stringify(body)}`);
    return {
      accessToken: body.access_token,
      refreshToken: null,
      expiresAt: null, // Notion tokens don't expire.
      meta: { workspaceName: body.workspace_name, botId: body.bot_id },
    };
  },

  toolDecls(): ToolDecl[] {
    return [
      {
        name: 'search_notion',
        description:
          "Search the user's Notion workspace for pages by title/keyword. Use " +
          'when they ask to find a note, doc, or page.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Search text.' } },
          required: ['query'],
        },
      },
      {
        name: 'create_notion_page',
        description:
          'Create a new top-level Notion page with a title and optional body text. ' +
          'Use to capture a note or doc.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Page title.' },
            content: { type: 'string', description: 'Optional page body text.' },
          },
          required: ['title'],
        },
      },
    ];
  },

  toolActions(): ToolAction[] {
    return [
      { name: 'search_notion', mutating: false, describe: () => 'search your Notion' },
      { name: 'create_notion_page', mutating: true, describe: (a) => `create a Notion page "${a.title}"` },
    ];
  },

  async runTool(name, args, ctx: ActionContext): Promise<ToolResult> {
    const token = ctx.connection.accessToken;
    if (name === 'search_notion') {
      const data = await apiFetch('https://api.notion.com/v1/search', {
        method: 'POST',
        token,
        headers: notionHeaders(),
        body: { query: String(args.query ?? ''), page_size: 5 },
      });
      const results: any[] = data.results ?? [];
      if (results.length === 0) return { ok: true, summary: `No Notion pages matched "${args.query}".` };
      const titles = results.map((r) => extractTitle(r)).filter(Boolean);
      return { ok: true, summary: `Found in Notion: ${titles.join('; ')}.`, data: results };
    }
    if (name === 'create_notion_page') {
      // Create under the workspace root requires a parent; we use a "page"
      // parent only if known. Notion requires a parent — fall back to search
      // for the first accessible page to nest under if no root is available.
      const parent = await firstAccessiblePageParent(token);
      if (!parent) {
        return {
          ok: false,
          summary:
            "I couldn't find a Notion page to create this under. Share a page " +
            'with the Nicole integration in Notion, then try again.',
        };
      }
      const children = args.content
        ? [
            {
              object: 'block',
              type: 'paragraph',
              paragraph: { rich_text: [{ type: 'text', text: { content: String(args.content) } }] },
            },
          ]
        : [];
      const data = await apiFetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        token,
        headers: notionHeaders(),
        body: {
          parent,
          properties: {
            title: { title: [{ type: 'text', text: { content: String(args.title) } }] },
          },
          children,
        },
      });
      return { ok: true, summary: `Created the Notion page "${args.title}".`, data: { id: data.id, url: data.url } };
    }
    return { ok: false, summary: `Notion can't do "${name}".` };
  },
};

function extractTitle(obj: any): string {
  const props = obj.properties ?? {};
  for (const key of Object.keys(props)) {
    const p = props[key];
    if (p?.type === 'title' && Array.isArray(p.title)) {
      return p.title.map((t: any) => t.plain_text).join('') || '(untitled)';
    }
  }
  // Database results carry their title differently.
  if (Array.isArray(obj.title)) return obj.title.map((t: any) => t.plain_text).join('');
  return '(untitled)';
}

/** Notion requires a parent for new pages; find the first page the bot can see. */
async function firstAccessiblePageParent(
  token: string,
): Promise<{ page_id: string } | null> {
  const data = await apiFetch('https://api.notion.com/v1/search', {
    method: 'POST',
    token,
    headers: notionHeaders(),
    body: { filter: { property: 'object', value: 'page' }, page_size: 1 },
  });
  const first = (data.results ?? [])[0];
  return first?.id ? { page_id: first.id } : null;
}
