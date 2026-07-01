// Server-side dispatch of integration tool calls from the Gemini relay.
//
// The relay hands us a tool name + args + the userId. We find the owning adapter,
// load a fresh connection (refreshing tokens if needed), run the capability, and
// return a speakable ToolResult. If the user hasn't connected that provider, we
// return a friendly "connect it first" message instead of throwing — Nicole reads
// it back and the conversation continues.

import { adapterForTool, configuredToolNames } from './registry.js';
import { getFreshConnection } from './tokenManager.js';
import type { ToolResult } from './types.js';

/** Is this tool name one of our integration tools (on a configured provider)? */
export function isIntegrationTool(name: string): boolean {
  return configuredToolNames().has(name);
}

/**
 * Tools that cause an IRREVERSIBLE, externally-visible side effect and therefore
 * require an explicit confirmation. The prompt makes Nicole preview + ask first;
 * this is the CODE backstop — even if the model skips the spoken confirm, we
 * refuse to fire until the call carries `confirmed: true` (which the prompt only
 * adds after the user says yes). book_meeting is gated only when it invites
 * other people (an attendee gets a real invite).
 */
const ALWAYS_CONFIRM = new Set(['send_email', 'post_slack']);

function requiresConfirmation(name: string, args: Record<string, unknown>): boolean {
  if (ALWAYS_CONFIRM.has(name)) return true;
  if (name === 'book_meeting') {
    const attendees = args.attendees;
    return Array.isArray(attendees) && attendees.length > 0;
  }
  return false;
}

/** Run an integration tool for a user. Always resolves (never throws to relay). */
export async function dispatchIntegrationTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const adapter = adapterForTool(name);
  // Don't leak the internal tool name into user-facing copy — keep it generic.
  if (!adapter) return { ok: false, summary: `I can't do that yet.` };
  if (!adapter.isConfigured()) {
    return { ok: false, summary: `${adapter.name} isn't set up yet.` };
  }

  // CONNECTION CHECK FIRST. If the user hasn't connected this provider, pop the
  // Connect card immediately — do NOT run the confirmation gate for an action that
  // physically can't fire. (Previously the confirm gate ran first, forcing an
  // unconnected user through a full "are you sure?" for send_email / post_slack
  // before we ever told them to connect.)
  const connection = await getFreshConnection(userId, adapter.id);
  if (!connection) {
    return {
      ok: false,
      summary: `Connect ${adapter.name} first and I'll do it.`,
      needsConnect: adapter.id,
    };
  }

  // CODE-LEVEL CONFIRMATION GATE for irreversible, externally-visible actions.
  // A mis-transcription must never auto-send an email or post to Slack. The
  // prompt has Nicole preview the action and add confirmed:true only after the
  // user clearly says yes; if it's missing, we refuse and ask her to confirm.
  if (requiresConfirmation(name, args) && args.confirmed !== true) {
    return {
      ok: false,
      summary:
        'CONFIRMATION REQUIRED before this action. Do not retry yet. Tell the user exactly what you are about to do (the action, the key detail, and the recipient) and ask them to confirm out loud. Only call this tool again, with confirmed set to true, after they clearly say yes.',
    };
  }

  try {
    return await adapter.runTool(name, args, { userId, connection });
  } catch (err) {
    const msg = (err as Error).message ?? 'something went wrong';
    // 401 means the token is dead/revoked — the connection exists but needs
    // reconnecting. Set needsConnect so the client re-opens the Connect card
    // (inline reconnect), not just a dead-end toast. Keep the copy short & clean.
    if (/401|invalid_grant|unauthorized|invalid_token/i.test(msg)) {
      return {
        ok: false,
        summary: `Reconnect ${adapter.name} to continue.`,
        needsConnect: adapter.id,
      };
    }
    // Never interpolate the raw adapter/HTTP error (status codes, JSON, internals)
    // into user copy — use a short friendly literal instead.
    return { ok: false, summary: `Something went wrong with ${adapter.name}. Try again?` };
  }
}
