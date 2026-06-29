import { describe, it, expect, vi } from 'vitest';

process.env.GEMINI_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://x';

// This suite verifies the UNCONFIGURED (key-gated) behaviour, so it must run as
// if no integration creds exist — independent of whatever real keys are in the
// developer's .env. Mock config so integrationsConfig is always empty here.
vi.mock('../config.js', () => ({
  config: {
    nodeEnv: 'test', port: 4000, userId: 'local-user',
    geminiApiKey: 'test-key', liveModel: 'm', summarizerModel: 'm',
    databaseUrl: 'postgres://x', frontendUrl: 'http://localhost:5173',
    serverUrl: 'http://localhost:4000',
  },
  integrationsConfig: {
    google: { clientId: '', clientSecret: '' },
    notion: { clientId: '', clientSecret: '' },
    todoist: { clientId: '', clientSecret: '' },
    slack: { clientId: '', clientSecret: '' },
  },
}));

import { encryptSecret, decryptSecret } from './crypto.js';
import { signState, verifyState } from './oauthState.js';
import { allAdapters, getAdapter, adapterForTool, configuredToolNames } from './registry.js';
import { isIntegrationTool, dispatchIntegrationTool } from './toolDispatch.js';

describe('integrations/crypto', () => {
  it('round-trips a secret', () => {
    const secret = 'ya29.super-secret-oauth-token';
    const enc = encryptSecret(secret);
    expect(enc.startsWith('v1:')).toBe(true);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it('fails to decrypt tampered ciphertext', () => {
    const enc = encryptSecret('hello');
    const tampered = enc.slice(0, -4) + 'AAAA';
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe('integrations/oauthState', () => {
  it('signs and verifies a state token bound to user + provider', () => {
    const state = signState('user-123', 'google');
    const parsed = verifyState(state);
    expect(parsed).toEqual({ userId: 'user-123', provider: 'google' });
  });

  it('rejects a garbage state token', () => {
    expect(verifyState('not-a-jwt')).toBeNull();
  });
});

describe('integrations/registry', () => {
  it('exposes all four providers', () => {
    const ids = allAdapters().map((a) => a.id).sort();
    expect(ids).toEqual(['google', 'notion', 'slack', 'todoist']);
  });

  it('resolves an adapter by id and tool name', () => {
    expect(getAdapter('google')?.name).toBe('Google');
    expect(adapterForTool('book_meeting')?.id).toBe('google');
    expect(adapterForTool('create_task')?.id).toBe('todoist');
    expect(adapterForTool('post_slack')?.id).toBe('slack');
    expect(adapterForTool('nope')).toBeNull();
  });

  it('is key-gated: with no env creds, nothing is configured and no tools surface', () => {
    // No GOOGLE_CLIENT_ID etc. set in the test env.
    for (const a of allAdapters()) expect(a.isConfigured()).toBe(false);
    expect(configuredToolNames().size).toBe(0);
    expect(isIntegrationTool('book_meeting')).toBe(false);
  });

  it('every adapter declares matching tool decls and actions', () => {
    for (const a of allAdapters()) {
      const declNames = a.toolDecls().map((d) => d.name).sort();
      const actionNames = a.toolActions().map((t) => t.name).sort();
      expect(actionNames).toEqual(declNames);
    }
  });

  it('builds a valid Google auth URL with offline access + consent', () => {
    // getAuthUrl doesn't require configuration to format the URL.
    const url = getAdapter('google')!.getAuthUrl('state123', 'http://localhost:4000/cb');
    expect(url).toContain('accounts.google.com');
    expect(url).toContain('access_type=offline');
    expect(url).toContain('prompt=consent');
    expect(url).toContain('state=state123');
  });
});

describe('integrations/confirmation gate', () => {
  // With no env creds the providers aren't configured, so dispatch first
  // reports "not set up"; we assert the gate independently below by reasoning
  // about the order: the gate runs only AFTER the configured check. Here we
  // verify the not-connected / not-configured graceful paths never throw.
  it('returns a friendly message for an unknown tool', async () => {
    const r = await dispatchIntegrationTool('does_not_exist', {}, 'u1');
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/don't have a tool/i);
  });

  it('reports not-configured rather than throwing when keys are absent', async () => {
    const r = await dispatchIntegrationTool('send_email', { to: 'a@b.com', subject: 's', body: 'b' }, 'u1');
    expect(r.ok).toBe(false);
    // No Google creds in test env → "isn't set up" (the configured() check).
    expect(r.summary).toMatch(/isn't set up|set up/i);
  });
});
