// The provider registry — the single place that knows every adapter.
//
// Routes and the Gemini relay look providers up here by id; they never import
// individual adapter files. Adding a provider = add its file + one line here.

import type { ProviderAdapter } from './types.js';
import type { ProviderId } from './db.js';
import { googleAdapter } from './providers/google.js';
import { notionAdapter } from './providers/notion.js';
import { todoistAdapter } from './providers/todoist.js';
import { slackAdapter } from './providers/slack.js';

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  google: googleAdapter,
  notion: notionAdapter,
  todoist: todoistAdapter,
  slack: slackAdapter,
};

export function getAdapter(provider: string): ProviderAdapter | null {
  return (ADAPTERS as Record<string, ProviderAdapter>)[provider] ?? null;
}

export function allAdapters(): ProviderAdapter[] {
  return Object.values(ADAPTERS);
}

/**
 * Find the adapter that owns a given tool name (for relay dispatch). Built once
 * at module load — tool names are globally unique across providers.
 */
const TOOL_OWNER = new Map<string, ProviderAdapter>();
for (const a of Object.values(ADAPTERS)) {
  for (const decl of a.toolDecls()) TOOL_OWNER.set(decl.name, a);
}

export function adapterForTool(toolName: string): ProviderAdapter | null {
  return TOOL_OWNER.get(toolName) ?? null;
}

/** Every integration tool declaration across all CONFIGURED providers. */
export function allConfiguredToolDecls() {
  return allAdapters()
    .filter((a) => a.isConfigured())
    .flatMap((a) => a.toolDecls());
}

/** Names of all integration tools across configured providers (for dispatch). */
export function configuredToolNames(): Set<string> {
  return new Set(allConfiguredToolDecls().map((d) => d.name));
}
