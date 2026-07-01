// The provider-agnostic adapter contract.
//
// Every integration (Google, Notion, Todoist, Slack, Spotify) implements this
// one interface and lives in its own file under providers/. A registry maps a
// ProviderId to its adapter so routes and the relay never hard-code providers.
//
// Design goals:
//   - One file per provider (no giant switch).
//   - Key-gated: isConfigured() is false when the env client id/secret are
//     absent, so the whole stack degrades to "not configured" gracefully.
//   - Tokens live server-side; capability methods receive a ready access token.

import type { Connection, ProviderId } from './db.js';

/** A capability action Nicole can invoke (one Gemini tool maps to one of these). */
export interface ToolAction {
  /** The Gemini function name, e.g. 'book_meeting'. Globally unique. */
  name: string;
  /** Whether this action changes external state (needs confirm-before-acting). */
  mutating: boolean;
  /** Human-readable summary for the confirmation line, given the args. */
  describe: (args: Record<string, unknown>) => string;
}

/** A Gemini function declaration (same shape as memory/UI tools). */
export interface ToolDecl {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; items?: unknown }>;
    required: string[];
  };
}

/** Result returned to the model after a tool runs. Kept small + speakable. */
export interface ToolResult {
  ok: boolean;
  /** A short natural-language summary Nicole can read back. */
  summary: string;
  /** Optional structured data (not spoken; for the UI if needed). */
  data?: unknown;
  /**
   * Present when the provider isn't connected for this user. The client can
   * use this to pop an inline Connect card for the named provider id.
   */
  needsConnect?: string;
}

/** Context handed to a capability call. */
export interface ActionContext {
  userId: string;
  /** A valid (refreshed if needed) connection for this provider. */
  connection: Connection;
}

export interface ProviderAdapter {
  id: ProviderId;
  /** Display name for the UI + spoken confirmations. */
  name: string;
  /** One-line description for the Integrations card. */
  description: string;
  /** OAuth scopes this adapter requests. */
  scopes: string[];

  /** True only when the env client id/secret are present (key-gated). */
  isConfigured(): boolean;

  /** Build the provider's authorize URL for the OAuth consent redirect. */
  getAuthUrl(state: string, redirectUri: string): string;

  /**
   * Exchange the OAuth `code` for tokens. Returns the values to persist.
   * `meta` is optional provider-specific data (team id, product tier, etc.).
   */
  exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<{
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: number | null;
    scopes?: string[];
    meta?: Record<string, unknown>;
  }>;

  /**
   * Refresh an expired access token. Optional — providers with non-expiring
   * tokens (Notion, Todoist, Slack bot tokens) can omit it.
   */
  refresh?(
    connection: Connection,
  ): Promise<{ accessToken: string; refreshToken?: string | null; expiresAt?: number | null }>;

  /** The Gemini tool declarations this provider exposes. */
  toolDecls(): ToolDecl[];

  /** Metadata about each tool (mutating? how to describe it for confirmation). */
  toolActions(): ToolAction[];

  /** Run a tool call. Throws on hard failure; returns a speakable result. */
  runTool(name: string, args: Record<string, unknown>, ctx: ActionContext): Promise<ToolResult>;
}
