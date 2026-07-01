import { describe, it, expect, vi } from 'vitest';

// Ensure env vars are set before any module import so registry doesn't complain.
process.env.GEMINI_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://x';
// Set Slack credentials so the adapter is "configured" (key-gated check passes).
process.env.SLACK_CLIENT_ID = 'test-slack-id';
process.env.SLACK_CLIENT_SECRET = 'test-slack-secret';

// Mock tokenManager so getFreshConnection returns null → user hasn't connected Slack.
vi.mock('./tokenManager.js', () => ({
  getFreshConnection: vi.fn(async () => null),
}));

// Mock registry to ensure Slack adapter is configured (isConfigured() returns true)
// and adapterForTool / configuredToolNames report Slack tools as valid.
vi.mock('./registry.js', async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    adapterForTool: (name: string) => {
      const a = actual.adapterForTool(name);
      if (!a) return a;
      // Force isConfigured() to return true regardless of real env keys.
      return { ...a, isConfigured: () => true };
    },
    configuredToolNames: () => {
      // Include Slack tools in the configured set.
      const set = actual.configuredToolNames() as Set<string>;
      set.add('list_slack_channels');
      set.add('post_slack');
      return set;
    },
  };
});

const { dispatchIntegrationTool } = await import('./toolDispatch.js');

describe('dispatchIntegrationTool needsConnect', () => {
  it('returns needsConnect when the provider is not connected', async () => {
    // Use list_slack_channels (a read-only, non-confirmation-gated tool) so we
    // reach the connection check without hitting the confirmation gate first.
    const res = await dispatchIntegrationTool('list_slack_channels', {}, 'user-1');
    expect(res.ok).toBe(false);
    expect(res.needsConnect).toBe('slack');
    expect(res.summary).toMatch(/connect/i);
  });
});
