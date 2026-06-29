import { describe, it, expect, vi, beforeEach } from 'vitest';

// Configure Google + a fake connection BEFORE importing the modules under test,
// so the adapter is "configured" and dispatch reaches the confirmation gate.
process.env.GEMINI_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://x';
process.env.GOOGLE_CLIENT_ID = 'test-google-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';

// Mock the token manager so a connection always exists (no DB needed) and the
// adapter so we can assert whether the real API call would have fired.
const runTool = vi.fn(async () => ({ ok: true, summary: 'sent' }));
vi.mock('./tokenManager.js', () => ({
  getFreshConnection: vi.fn(async () => ({
    userId: 'u1',
    provider: 'google',
    accessToken: 'tok',
    refreshToken: null,
    expiresAt: null,
    scopes: [],
    meta: {},
    createdAt: '',
    updatedAt: '',
  })),
}));
vi.mock('./registry.js', async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    adapterForTool: (name: string) => {
      const a = actual.adapterForTool(name);
      return a ? { ...a, runTool } : a;
    },
  };
});

const { dispatchIntegrationTool } = await import('./toolDispatch.js');

beforeEach(() => runTool.mockClear());

describe('confirmation gate (Google configured)', () => {
  it('BLOCKS send_email without confirmed:true and never calls the API', async () => {
    const r = await dispatchIntegrationTool(
      'send_email',
      { to: 'a@b.com', subject: 'Hi', body: 'Body' },
      'u1',
    );
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/CONFIRMATION REQUIRED/);
    expect(runTool).not.toHaveBeenCalled();
  });

  it('ALLOWS send_email once confirmed:true', async () => {
    const r = await dispatchIntegrationTool(
      'send_email',
      { to: 'a@b.com', subject: 'Hi', body: 'Body', confirmed: true },
      'u1',
    );
    expect(r.ok).toBe(true);
    expect(runTool).toHaveBeenCalledOnce();
  });

  it('does NOT gate a read like list_emails', async () => {
    const r = await dispatchIntegrationTool('list_emails', {}, 'u1');
    expect(r.ok).toBe(true);
    expect(runTool).toHaveBeenCalledOnce();
  });

  it('gates book_meeting only when it invites attendees', async () => {
    const solo = await dispatchIntegrationTool(
      'book_meeting',
      { title: 'Focus', startTime: 't1', endTime: 't2' },
      'u1',
    );
    expect(solo.ok).toBe(true); // no attendees → no confirm
    runTool.mockClear();

    const withPeople = await dispatchIntegrationTool(
      'book_meeting',
      { title: 'Sync', startTime: 't1', endTime: 't2', attendees: ['x@y.com'] },
      'u1',
    );
    expect(withPeople.ok).toBe(false);
    expect(withPeople.summary).toMatch(/CONFIRMATION REQUIRED/);
    expect(runTool).not.toHaveBeenCalled();
  });
});
