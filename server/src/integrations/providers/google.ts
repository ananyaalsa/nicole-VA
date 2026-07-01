// Google adapter — Calendar, Gmail, and Meet (one OAuth app covers all three).
//
// Meet links are created as part of a Calendar event via conferenceData, so
// "book a meeting with a Meet link" is a single Calendar insert with
// conferenceDataVersion=1. Tokens expire (~1h) and refresh via the refresh_token
// obtained with access_type=offline & prompt=consent.
//
// Raw fetch (no googleapis SDK) to keep the dependency surface small and match
// the rest of the codebase.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { integrationsConfig, config } from '../../config.js';
import { loadDisplayName } from '../../memory/db.js';
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
          'user wants to write/prepare an email; they can review & send it. ' +
          'Include real URLs/links in the body when relevant (product/flight/hotel ' +
          'links, etc.) — they become clickable. For a nicely STRUCTURED email ' +
          '(tables, headings, lists), pass bodyHtml with HTML markup.',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient email address.' },
            subject: { type: 'string', description: 'Email subject.' },
            body: { type: 'string', description: 'Plain-text email body (also the fallback for HTML). Put full URLs on their own so they are clickable.' },
            bodyHtml: { type: 'string', description: 'OPTIONAL rich HTML body for a beautifully structured email — use <h2>/<h3> headings, <table>/<tr>/<td> for tabular data, <ul>/<li> lists, and <a href="…"> links. Use ONLY when the user wants it formatted/structured.' },
          },
          required: ['to', 'subject', 'body'],
        },
      },
      {
        name: 'send_email',
        description:
          'Send an email immediately via Gmail. This delivers the message, so first ' +
          'tell the user what you will send and to whom and get a verbal yes, ' +
          'THEN call this with confirmed:true. Include real links in the body when ' +
          'relevant; for a structured/beautiful email pass bodyHtml with HTML.',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient email address.' },
            subject: { type: 'string', description: 'Email subject.' },
            body: { type: 'string', description: 'Plain-text email body (also the fallback for HTML). Put full URLs on their own so they are clickable.' },
            bodyHtml: { type: 'string', description: 'OPTIONAL rich HTML body for a beautifully structured email — <h2>/<h3> headings, <table> for tabular data, <ul>/<li> lists, <a href="…"> links. Use ONLY when the user wants it formatted/structured.' },
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
        return draftEmail(token, args, false, ctx.userId);
      case 'send_email':
        return draftEmail(token, args, true, ctx.userId);
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

/** Escape text for safe inclusion in an HTML email body. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** RFC-2047 encode a header value (display name) so non-ASCII is safe. */
function encodeHeaderWord(s: string): string {
  // ASCII with no special chars → leave as-is; otherwise base64-encode UTF-8.
  if (/^[\x20-\x7E]*$/.test(s) && !/[",:;<>@]/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}

/** The Gmail account's own email address (Gmail always sends FROM this; we can
 *  only set the display NAME). Best-effort — falls back to no From header. */
async function senderEmail(token: string): Promise<string | null> {
  try {
    const p = (await apiFetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      { token },
    )) as { emailAddress?: string };
    return p?.emailAddress ?? null;
  } catch {
    return null;
  }
}

/** Load Nicole's avatar PNG ONCE as base64 for inline (CID) embedding, so it
 *  renders in every inbox — Gmail won't fetch a localhost URL and strips data:
 *  image URIs, so a CID attachment is the only thing that reliably shows. Tries
 *  a few candidate paths (dev `src`, built `dist`, and the repo web/public copy)
 *  and returns null if none are found (the template then degrades to a monogram). */
let avatarB64Cache: string | null | undefined;
function loadAvatarB64(): string | null {
  if (avatarB64Cache !== undefined) return avatarB64Cache;
  const here = dirname(fileURLToPath(import.meta.url)); // .../providers
  const candidates = [
    join(here, '../../../assets/nicole-avatar.png'),   // dist/integrations/providers → server/assets
    join(here, '../../../../assets/nicole-avatar.png'),
    join(here, '../../../web/public/nicole-avatar.png'),
    join(process.cwd(), 'assets/nicole-avatar.png'),
    join(process.cwd(), '../web/public/nicole-avatar.png'),
  ];
  for (const p of candidates) {
    try {
      const buf = readFileSync(p);
      avatarB64Cache = buf.toString('base64');
      return avatarB64Cache;
    } catch { /* try next */ }
  }
  avatarB64Cache = null;
  return null;
}

const AVATAR_CID = 'nicole-avatar@alsatalk';

/** Turn bare URLs in escaped plain text into clickable <a> links. Runs AFTER
 *  escapeHtml, so the text is safe; we only wrap http(s) runs. */
function autoLink(escaped: string): string {
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, (u) => {
    // Strip a trailing sentence punctuation so the link is clean.
    const trail = /[.,)]$/.test(u) ? u.slice(-1) : '';
    const href = trail ? u.slice(0, -1) : u;
    return `<a href="${href}" style="color:#0f766e;">${href}</a>${trail}`;
  });
}

/** Very small allow-list sanitizer for a model-provided HTML body: strip
 *  <script>/<style>/<iframe> and on* event attributes and javascript: URLs, so
 *  the rich-HTML path can't inject anything active. Keeps normal formatting tags. */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
}

/** Wrap the user's body in a polished, email-client-safe branded template.
 *  Table-based layout + inline styles (the only thing email clients render
 *  consistently). The avatar uses cid: so it shows even offline; when it can't
 *  be loaded, a teal "N" monogram stands in. `richHtml`, when provided, is used
 *  as the body verbatim (sanitized) for structured emails; otherwise the plain
 *  text is escaped, auto-linked, and newline-wrapped. */
function brandedHtml(bodyText: string, ownerName: string, hasAvatar: boolean, richHtml?: string): string {
  const bodyHtml = richHtml
    ? sanitizeHtml(richHtml)
    : autoLink(escapeHtml(bodyText)).replace(/\r?\n/g, '<br>');
  const avatarCell = hasAvatar
    ? `<img src="cid:${AVATAR_CID}" alt="Nicole" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:50%;border:2px solid rgba(255,255,255,0.6);" />`
    : `<div style="width:48px;height:48px;border-radius:50%;background:#0b3d38;color:#fff;font:700 20px/48px -apple-system,Segoe UI,Arial,sans-serif;text-align:center;">N</div>`;
  const onBehalf = ownerName ? `on behalf of ${escapeHtml(ownerName)}` : '';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1ed;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1ed;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(11,61,56,0.10);font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <!-- Header: teal gradient bar with avatar + name -->
    <tr><td style="background:linear-gradient(120deg,#0f766e,#0b3d38);padding:18px 22px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:12px;vertical-align:middle;">${avatarCell}</td>
        <td style="vertical-align:middle;">
          <div style="color:#ffffff;font-size:17px;font-weight:700;line-height:1.2;">Nicole</div>
          <div style="color:#bfe3dd;font-size:12px;line-height:1.3;">AI assistant ${onBehalf}</div>
        </td>
      </tr></table>
    </td></tr>
    <!-- Body -->
    <tr><td style="padding:24px 24px 8px;color:#1a2b29;font-size:15px;line-height:1.65;">${bodyHtml}</td></tr>
    <!-- Footer -->
    <tr><td style="padding:16px 24px 22px;">
      <div style="border-top:1px solid #eceae3;padding-top:14px;color:#9aa39e;font-size:11px;line-height:1.5;">
        Sent by Nicole, ${escapeHtml(ownerName || 'your')}’s AI assistant. Reply directly to continue the conversation.
      </div>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

/** Build a base64url RFC-2822 message and either draft or send it. The message
 *  is multipart/alternative (plain text + a branded HTML part) and carries a
 *  "Nicole" display name on the From header, so it reads as coming from the
 *  assistant rather than just "me". (Gmail forces the From ADDRESS to the
 *  authenticated account; only the display name is ours to set.) */
async function draftEmail(
  token: string,
  args: Record<string, unknown>,
  send: boolean,
  userId: string,
): Promise<ToolResult> {
  const to = String(args.to ?? '');
  const subject = String(args.subject ?? '');
  const body = String(args.body ?? '');
  const bodyHtml = typeof args.bodyHtml === 'string' && args.bodyHtml.trim() ? args.bodyHtml : undefined;

  // Who the assistant is acting for, e.g. "Ananya".
  let ownerName: string | null = null;
  try { ownerName = await loadDisplayName(userId); } catch { /* best-effort */ }
  const fromAddr = await senderEmail(token);
  const fromHeader = fromAddr
    ? `From: ${encodeHeaderWord('Nicole')} <${fromAddr}>`
    : null;

  const avatarB64 = loadAvatarB64();
  const html = brandedHtml(body, ownerName ?? '', avatarB64 !== null, bodyHtml);

  // MIME structure:
  //   multipart/alternative
  //     ├─ text/plain                (fallback)
  //     └─ multipart/related         (rich)
  //         ├─ text/html
  //         └─ image/png  (the inline avatar, referenced by cid:)
  // Using two distinct boundaries (alt + related) so the nesting is valid.
  const seed = Buffer.from(userId).toString('hex').slice(0, 12);
  const altB = `alt_${seed}`;
  const relB = `rel_${seed}`;

  const relatedPart = [
    `Content-Type: multipart/related; boundary="${relB}"`,
    '',
    `--${relB}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
    '',
    // Inline avatar attachment (only when we could load it).
    ...(avatarB64
      ? [
          `--${relB}`,
          'Content-Type: image/png',
          'Content-Transfer-Encoding: base64',
          `Content-ID: <${AVATAR_CID}>`,
          'Content-Disposition: inline; filename="nicole.png"',
          '',
          avatarB64,
          '',
        ]
      : []),
    `--${relB}--`,
  ].join('\r\n');

  const lines = [
    `To: ${to}`,
    `Subject: ${encodeHeaderWord(subject)}`,
    ...(fromHeader ? [fromHeader] : []),
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${altB}"`,
    '',
    `--${altB}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
    '',
    `--${altB}`,
    relatedPart,
    '',
    `--${altB}--`,
  ];
  const raw = lines.join('\r\n');
  const encoded = Buffer.from(raw, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (send) {
    await apiFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      token,
      body: { raw: encoded },
    });
    return { ok: true, summary: `Sent your email to ${to}.` };
  }
  await apiFetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    token,
    body: { message: { raw: encoded } },
  });
  return { ok: true, summary: `Drafted an email to ${to}. It's in your Gmail drafts to review and send.` };
}
