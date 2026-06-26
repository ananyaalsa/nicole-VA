// Google adapter — Calendar, Gmail, and Meet (one OAuth app covers all three).
//
// Meet links are created as part of a Calendar event via conferenceData, so
// "book a meeting with a Meet link" is a single Calendar insert with
// conferenceDataVersion=1. Tokens expire (~1h) and refresh via the refresh_token
// obtained with access_type=offline & prompt=consent.
//
// Raw fetch (no googleapis SDK) to keep the dependency surface small and match
// the rest of the codebase.

import { integrationsConfig } from '../../config.js';
import { postForm, apiFetch } from '../http.js';
import type {
  ProviderAdapter,
  ToolDecl,
  ToolAction,
  ToolResult,
  ActionContext,
} from '../types.js';
import type { Connection } from '../db.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
];

function creds() {
  return integrationsConfig.google;
}

export const googleAdapter: ProviderAdapter = {
  id: 'google',
  name: 'Google',
  description: 'Calendar, Gmail & Meet. Book meetings, read & draft email',
  scopes: SCOPES,

  isConfigured() {
    const c = creds();
    return Boolean(c.clientId && c.clientSecret);
  },

  getAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: creds().clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeCode(code, redirectUri) {
    const body = await postForm(TOKEN_URL, {
      code,
      client_id: creds().clientId,
      client_secret: creds().clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
      scopes: (body.scope ?? '').split(' ').filter(Boolean),
    };
  },

  async refresh(connection: Connection) {
    if (!connection.refreshToken) throw new Error('No Google refresh token');
    const body = await postForm(TOKEN_URL, {
      client_id: creds().clientId,
      client_secret: creds().clientSecret,
      refresh_token: connection.refreshToken,
      grant_type: 'refresh_token',
    });
    return {
      accessToken: body.access_token,
      // Google does not return a new refresh_token on refresh — keep the old one.
      refreshToken: null,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    };
  },

  toolDecls(): ToolDecl[] {
    return [
      {
        name: 'list_calendar_events',
        description:
          "List the user's upcoming Google Calendar events. Use when they ask " +
          "what's on their schedule, their next meeting, or their day.",
        parameters: {
          type: 'object',
          properties: {
            maxResults: { type: 'number', description: 'How many events (default 5).' },
            timeMin: { type: 'string', description: 'ISO start time; defaults to now.' },
          },
          required: [],
        },
      },
      {
        name: 'book_meeting',
        description:
          'Create a Google Calendar event, optionally with a Google Meet video ' +
          'link and attendee invitations. Use to schedule or book meetings. ' +
          'ALWAYS ask the user what to title the meeting BEFORE calling this — ' +
          'never invent a generic title like "Meeting". If you do not have a ' +
          'specific title the user gave, ask "What should I call it?" first and ' +
          'wait for their answer. If it invites other people, confirm with the ' +
          'user first, then pass confirmed:true.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Event title — must be the name the USER gave, never a generic "Meeting".' },
            startTime: { type: 'string', description: 'ISO 8601 start datetime.' },
            endTime: { type: 'string', description: 'ISO 8601 end datetime.' },
            attendees: {
              type: 'array',
              description: 'Optional attendee email addresses.',
              items: { type: 'string' },
            },
            withMeet: { type: 'boolean', description: 'Add a Google Meet link (default true).' },
            description: { type: 'string', description: 'Optional event notes.' },
            confirmed: {
              type: 'boolean',
              description:
                'Set true ONLY after the user has verbally confirmed, when the meeting invites other people.',
            },
          },
          required: ['title', 'startTime', 'endTime'],
        },
      },
      {
        name: 'list_emails',
        description:
          "Summarize the user's most recent Gmail messages (subject + sender + " +
          'snippet). Use when they ask about their inbox or recent email.',
        parameters: {
          type: 'object',
          properties: {
            maxResults: { type: 'number', description: 'How many emails (default 5).' },
            query: { type: 'string', description: 'Optional Gmail search query (e.g. is:unread).' },
          },
          required: [],
        },
      },
      {
        name: 'draft_email',
        description:
          'Create a Gmail DRAFT (not sent) addressed to someone. Use when the ' +
          'user wants to write/prepare an email; they can review & send it.',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient email address.' },
            subject: { type: 'string', description: 'Email subject.' },
            body: { type: 'string', description: 'Email body text.' },
          },
          required: ['to', 'subject', 'body'],
        },
      },
      {
        name: 'send_email',
        description:
          'Send an email immediately via Gmail. This delivers the message, so first ' +
          'tell the user what you will send and to whom and get a verbal yes, ' +
          'THEN call this with confirmed:true.',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient email address.' },
            subject: { type: 'string', description: 'Email subject.' },
            body: { type: 'string', description: 'Email body text.' },
            confirmed: {
              type: 'boolean',
              description: 'Set true ONLY after the user has verbally confirmed sending.',
            },
          },
          required: ['to', 'subject', 'body'],
        },
      },
    ];
  },

  toolActions(): ToolAction[] {
    return [
      { name: 'list_calendar_events', mutating: false, describe: () => 'check your calendar' },
      {
        name: 'book_meeting',
        mutating: true,
        describe: (a) => `book "${a.title}" on your calendar`,
      },
      { name: 'list_emails', mutating: false, describe: () => 'check your recent email' },
      { name: 'draft_email', mutating: true, describe: (a) => `draft an email to ${a.to}` },
      { name: 'send_email', mutating: true, describe: (a) => `send an email to ${a.to}` },
    ];
  },

  async runTool(name, args, ctx): Promise<ToolResult> {
    const token = ctx.connection.accessToken;
    switch (name) {
      case 'list_calendar_events':
        return listCalendarEvents(token, args);
      case 'book_meeting':
        return bookMeeting(token, args);
      case 'list_emails':
        return listEmails(token, args);
      case 'draft_email':
        return draftEmail(token, args, false);
      case 'send_email':
        return draftEmail(token, args, true);
      default:
        return { ok: false, summary: `Google can't do "${name}".` };
    }
  },
};

// ── Calendar ────────────────────────────────────────────────────────────────

async function listCalendarEvents(token: string, args: Record<string, unknown>): Promise<ToolResult> {
  const max = Number(args.maxResults ?? 5);
  const timeMin = (args.timeMin as string) || new Date().toISOString();
  const params = new URLSearchParams({
    maxResults: String(max),
    timeMin,
    singleEvents: 'true',
    orderBy: 'startTime',
  });
  const data = await apiFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { token },
  );
  const events: any[] = data.items ?? [];
  if (events.length === 0) return { ok: true, summary: 'Your calendar is clear, no upcoming events.' };
  const lines = events.map((e) => {
    const start = e.start?.dateTime ?? e.start?.date ?? '';
    const when = start ? new Date(start).toLocaleString() : 'time TBD';
    return `${e.summary ?? '(no title)'} at ${when}`;
  });
  return {
    ok: true,
    summary: `You have ${events.length} upcoming: ${lines.join('; ')}.`,
    data: events,
  };
}

async function bookMeeting(token: string, args: Record<string, unknown>): Promise<ToolResult> {
  const withMeet = args.withMeet !== false;
  const attendees = (args.attendees as string[] | undefined)?.map((email) => ({ email })) ?? [];
  const event: Record<string, unknown> = {
    summary: args.title,
    description: args.description,
    start: { dateTime: args.startTime },
    end: { dateTime: args.endTime },
    attendees,
  };
  if (withMeet) {
    event.conferenceData = {
      createRequest: {
        requestId: `nicole-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }
  const data = await apiFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`,
    { method: 'POST', token, body: event },
  );
  const meetLink = data.hangoutLink ? ` Meet link: ${data.hangoutLink}` : '';
  return {
    ok: true,
    summary: `Booked "${args.title}".${meetLink}`,
    data: { id: data.id, htmlLink: data.htmlLink, hangoutLink: data.hangoutLink },
  };
}

// ── Gmail ─────────────────────────────────────────────────────────────────

/** Extract a clean display name from a "Name <addr@x>" From header (drops the address). */
function senderName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  if (m && m[1].trim()) return m[1].trim();
  // Bare address → use the part before @, title-cased-ish.
  const addr = from.match(/<?([^@<>\s]+)@/);
  if (addr) return addr[1];
  return from.trim() || 'unknown';
}

async function listEmails(token: string, args: Record<string, unknown>): Promise<ToolResult> {
  const max = Number(args.maxResults ?? 5);
  const q = (args.query as string) || '';
  const params = new URLSearchParams({ maxResults: String(max) });
  if (q) params.set('q', q);
  const list = await apiFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
    { token },
  );
  const ids: any[] = list.messages ?? [];
  if (ids.length === 0) return { ok: true, summary: 'No matching emails.' };
  const details = await Promise.all(
    ids.slice(0, max).map((m) =>
      apiFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        { token },
      ),
    ),
  );
  // Build a CLEAN structured list (sender NAME only, no email address) for the
  // UI, plus a short spoken summary for Nicole. The UI renders from `data`.
  const items = details.map((d) => {
    const headers: any[] = d.payload?.headers ?? [];
    const subject = headers.find((h) => h.name === 'Subject')?.value ?? '(no subject)';
    const fromRaw = headers.find((h) => h.name === 'From')?.value ?? 'unknown';
    return { subject, from: senderName(fromRaw) };
  });
  const spoken = items.slice(0, 3).map((i) => `${i.subject} from ${i.from}`).join('; ');
  const more = items.length > 3 ? ` and ${items.length - 3} more` : '';
  return { ok: true, summary: `Your latest: ${spoken}${more}.`, data: items };
}

/** Build a base64url RFC-2822 message and either draft or send it. */
async function draftEmail(
  token: string,
  args: Record<string, unknown>,
  send: boolean,
): Promise<ToolResult> {
  const raw = [
    `To: ${args.to}`,
    `Subject: ${args.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    String(args.body ?? ''),
  ].join('\r\n');
  const encoded = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (send) {
    await apiFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      token,
      body: { raw: encoded },
    });
    return { ok: true, summary: `Sent your email to ${args.to}.` };
  }
  await apiFetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    token,
    body: { message: { raw: encoded } },
  });
  return { ok: true, summary: `Drafted an email to ${args.to}. It's in your Gmail drafts to review and send.` };
}
