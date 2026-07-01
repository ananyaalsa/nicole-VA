import { describe, it, expect, vi, beforeEach } from 'vitest';

// Ensure env vars are set before any module import so registry doesn't complain.
process.env.GEMINI_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://x';
// Set Slack credentials so the adapter is "configured" (key-gated check passes).
process.env.SLACK_CLIENT_ID = 'test-slack-id';
process.env.SLACK_CLIENT_SECRET = 'test-slack-secret';

// Mock tokenManager so getFreshConnection returns null → user hasn't connected Slack.
// Individual tests override this (mockResolvedValueOnce) to simulate a live
// connection when they need to reach the confirmation gate or the runTool path.
import { getFreshConnection } from './tokenManager.js';
vi.mock('./tokenManager.js', () => ({
  getFreshConnection: vi.fn(async () => null),
}));

// Controllable runTool behavior for the connected path (happy result or throw).
const runTool = vi.fn(async () => ({ ok: true, summary: 'done' }));

// Mock registry to ensure Slack adapter is configured (isConfigured() returns true)
// and adapterForTool / configuredToolNames report Slack tools as valid. runTool is
// stubbed so tests can drive the connected path (success / 401 throw) deterministically.
vi.mock('./registry.js', async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    adapterForTool: (name: string) => {
      const a = actual.adapterForTool(name);
      if (!a) return a;
      // Force isConfigured() to return true regardless of real env keys, and route
      // runTool to our controllable stub.
      return { ...a, isConfigured: () => true, runTool: (...args: unknown[]) => runTool(...(args as [])) };
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

const mockGetFreshConnection = vi.mocked(getFreshConnection);

const FAKE_CONNECTION = { accessToken: 't', refreshToken: 'r' } as any;

beforeEach(() => {
  runTool.mockReset();
  runTool.mockResolvedValue({ ok: true, summary: 'done' });
  mockGetFreshConnection.mockReset();
  mockGetFreshConnection.mockResolvedValue(null); // default: NOT connected
});

describe('dispatchIntegrationTool needsConnect', () => {
  it('returns needsConnect when the provider is not connected', async () => {
    // Use list_slack_channels (a read-only, non-confirmation-gated tool) so we
    // reach the connection check without hitting the confirmation gate first.
    const res = await dispatchIntegrationTool('list_slack_channels', {}, 'user-1');
    expect(res.ok).toBe(false);
    expect(res.needsConnect).toBe('slack');
    expect(res.summary).toMatch(/connect/i);
  });

  // FIX B: an UNCONNECTED write action (post_slack is ALWAYS_CONFIRM) with no
  // confirmed flag must pop the Connect card immediately — NOT the confirmation
  // prompt for an action that can't fire.
  it('an unconnected post_slack (no confirmed flag) returns needsConnect, NOT the confirm prompt', async () => {
    mockGetFreshConnection.mockResolvedValue(null);
    const res = await dispatchIntegrationTool('post_slack', { channel: 'general', text: 'hi' }, 'user-1');
    expect(res.ok).toBe(false);
    expect(res.needsConnect).toBe('slack');
    expect(res.summary).not.toMatch(/CONFIRMATION REQUIRED/);
    // runTool must not fire (no connection).
    expect(runTool).not.toHaveBeenCalled();
  });

  // Regression guard: a CONNECTED write action with no confirmed flag STILL gets
  // the confirmation gate (the connection check no longer short-circuits it).
  it('a connected post_slack (no confirmed flag) still hits the confirmation gate', async () => {
    mockGetFreshConnection.mockResolvedValue(FAKE_CONNECTION);
    const res = await dispatchIntegrationTool('post_slack', { channel: 'general', text: 'hi' }, 'user-1');
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/CONFIRMATION REQUIRED/);
    expect(res.needsConnect).toBeUndefined();
    expect(runTool).not.toHaveBeenCalled();
  });

  // FIX D: a revoked/expired token (connection exists, runTool throws 401) must
  // set needsConnect so the client re-opens the Connect card for inline reconnect.
  it('a 401 from runTool returns needsConnect (revoked token → reconnect card)', async () => {
    mockGetFreshConnection.mockResolvedValue(FAKE_CONNECTION);
    runTool.mockRejectedValue(new Error('401 Unauthorized invalid_token'));
    const res = await dispatchIntegrationTool('list_slack_channels', {}, 'user-1');
    expect(res.ok).toBe(false);
    expect(res.needsConnect).toBe('slack');
    // FIX E: short, friendly, no status codes / internals.
    expect(res.summary).not.toMatch(/401|invalid_token|Integrations/);
    expect(res.summary.length).toBeLessThan(60);
  });

  // FIX E: a generic runTool failure must NOT leak the raw error into the summary.
  it('a generic runTool failure returns friendly copy without leaking internals', async () => {
    mockGetFreshConnection.mockResolvedValue(FAKE_CONNECTION);
    runTool.mockRejectedValue(new Error('HTTP 500 {"error":"boom","trace":"..."}'));
    const res = await dispatchIntegrationTool('list_slack_channels', {}, 'user-1');
    expect(res.ok).toBe(false);
    expect(res.summary).not.toMatch(/500|boom|trace|\{|\}/);
    expect(res.summary).toMatch(/try again/i);
  });

  // FIX E: an unknown tool must not echo the internal tool name back to the user.
  it('an unknown tool returns a generic line, not the tool name', async () => {
    const res = await dispatchIntegrationTool('totally_made_up_tool', {}, 'user-1');
    expect(res.ok).toBe(false);
    expect(res.summary).not.toMatch(/totally_made_up_tool/);
  });
});
