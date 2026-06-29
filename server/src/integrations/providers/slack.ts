// Slack adapter — post a message, list channels, read recent messages.
//
// Slack OAuth v2: authorize at slack.com/oauth/v2/authorize, exchange at
// slack.com/api/oauth.v2.access (form-encoded). The returned bot token
// (access_token, xoxb-...) does not expire. Web API methods are POST form or
// GET with a Bearer token; every response has an `ok` boolean we must check.

import { integrationsConfig } from '../../config.js';
import { postForm } from '../http.js';
import type { ProviderAdapter, ToolDecl, ToolAction, ToolResult, ActionContext } from '../types.js';

const AUTH_URL = 'https://slack.com/oauth/v2/authorize';
const TOKEN_URL = 'https://slack.com/api/oauth.v2.access';

// Bot scopes: post messages, list public channels, read names, read DMs/history.
const SCOPES = ['chat:write', 'channels:read', 'groups:read', 'users:read', 'channels:history'];

function creds() {
  return integrationsConfig.slack;
}

/** Slack Web API call (handles its ok:false error convention). */
async function slackApi(
  method: string,
  token: string,
  params: Record<string, string> = {},
  http: 'GET' | 'POST' = 'POST',
): Promise<any> {
  const url = `https://slack.com/api/${method}`;
  let res: Response;
  if (http === 'GET') {
    const qs = new URLSearchParams(params).toString();
    res = await fetch(`${url}?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  } else {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });
  }
  const body = (await res.json()) as any;
  if (!body.ok) throw new Error(`Slack ${method}: ${body.error ?? 'unknown_error'}`);
  return body;
}

export const slackAdapter: ProviderAdapter = {
  id: 'slack',
  name: 'Slack',
  description: 'Post notes & check messages in your workspace',
  scopes: SCOPES,

  isConfigured() {
    const c = creds();
    return Boolean(c.clientId && c.clientSecret);
  },

  getAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: creds().clientId,
      scope: SCOPES.join(','),
      redirect_uri: redirectUri,
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeCode(code, redirectUri) {
    const body = await postForm(TOKEN_URL, {
      client_id: creds().clientId,
      client_secret: creds().clientSecret,
      code,
      redirect_uri: redirectUri,
    });
    if (!body.ok) throw new Error(`Slack token exchange: ${body.error}`);
    return {
      accessToken: body.access_token, // bot token (xoxb-…)
      refreshToken: null,
      expiresAt: null,
      scopes: SCOPES,
      meta: { teamName: body.team?.name, teamId: body.team?.id, botUserId: body.bot_user_id },
    };
  },

  toolDecls(): ToolDecl[] {
    return [
      {
        name: 'post_slack',
        description:
          'Post a message to a Slack channel (by #name or id). The team will see ' +
          'it, so preview the channel and message to the user and get a verbal yes, ' +
          'THEN call this with confirmed:true.',
        parameters: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel name (with or without #) or id.' },
            message: { type: 'string', description: 'The message text to post.' },
            confirmed: {
              type: 'boolean',
              description: 'Set true ONLY after the user has verbally confirmed posting.',
            },
          },
          required: ['channel', 'message'],
        },
      },
      {
        name: 'list_slack_channels',
        description: 'List the Slack channels available, so the user can pick one.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'read_slack_channel',
        description: "Read the most recent messages in a Slack channel.",
        parameters: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel name or id.' },
            limit: { type: 'number', description: 'How many recent messages (default 5).' },
          },
          required: ['channel'],
        },
      },
    ];
  },

  toolActions(): ToolAction[] {
    return [
      { name: 'post_slack', mutating: true, describe: (a) => `post to ${a.channel} on Slack` },
      { name: 'list_slack_channels', mutating: false, describe: () => 'list your Slack channels' },
      { name: 'read_slack_channel', mutating: false, describe: (a) => `read ${a.channel} on Slack` },
    ];
  },

  async runTool(name, args, ctx: ActionContext): Promise<ToolResult> {
    const token = ctx.connection.accessToken;
    if (name === 'list_slack_channels') {
      const data = await slackApi(
        'conversations.list',
        token,
        { types: 'public_channel', limit: '50' },
        'GET',
      );
      const names = (data.channels ?? []).map((c: any) => `#${c.name}`);
      return { ok: true, summary: `Channels: ${names.slice(0, 15).join(', ')}.`, data: data.channels };
    }
    const channelId = await resolveChannel(token, String(args.channel ?? ''));
    if (!channelId) return { ok: false, summary: `I couldn't find the Slack channel "${args.channel}".` };

    if (name === 'post_slack') {
      await slackApi('chat.postMessage', token, { channel: channelId, text: String(args.message) });
      return { ok: true, summary: `Posted to ${args.channel} on Slack.` };
    }
    if (name === 'read_slack_channel') {
      const limit = String(Number(args.limit ?? 5));
      const data = await slackApi('conversations.history', token, { channel: channelId, limit }, 'GET');
      const msgs: any[] = data.messages ?? [];
      if (msgs.length === 0) return { ok: true, summary: `No recent messages in ${args.channel}.` };
      const lines = msgs.map((m) => m.text).filter(Boolean).slice(0, limitInt(args.limit));
      return { ok: true, summary: `Recent in ${args.channel}: ${lines.join(' | ')}`, data: msgs };
    }
    return { ok: false, summary: `Slack can't do "${name}".` };
  },
};

function limitInt(v: unknown): number {
  return Math.min(8, Math.max(1, Number(v ?? 5)));
}

/** Accept a channel id, "#name", or "name" → resolve to an id. */
async function resolveChannel(token: string, channel: string): Promise<string | null> {
  const c = channel.trim();
  if (!c) return null;
  // Looks like an id already (C…/G…).
  if (/^[CG][A-Z0-9]{6,}$/.test(c)) return c;
  const wanted = c.replace(/^#/, '').toLowerCase();
  try {
    const data = await slackApi(
      'conversations.list',
      token,
      { types: 'public_channel,private_channel', limit: '200' },
      'GET',
    );
    const match = (data.channels ?? []).find((ch: any) => ch.name?.toLowerCase() === wanted);
    return match?.id ?? null;
  } catch {
    return null;
  }
}
