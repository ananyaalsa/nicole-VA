import { describe, it, expect, beforeEach, vi } from 'vitest';

process.env.GEMINI_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://x';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('pg', () => ({
  default: { Pool: vi.fn(() => ({ query: mockQuery, end: vi.fn() })) },
  Pool: vi.fn(() => ({ query: mockQuery, end: vi.fn() })),
}));

import {
  issueRefreshToken,
  userIdForRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
} from './refreshTokens.js';

describe('auth/refreshTokens', () => {
  beforeEach(() => mockQuery.mockReset());

  it('issues a random token and stores only its hash (not the raw token)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const raw = await issueRefreshToken('u1');
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, opaque
    expect(raw.length).toBeGreaterThan(20);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO nicole2_refresh_tokens/);
    // The stored value is a 64-char hex SHA-256 hash, NOT the raw token.
    expect(params[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(params[0]).not.toBe(raw);
    expect(params[1]).toBe('u1');
  });

  it('resolves a stored token to its userId, hashing the lookup', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'u9' }] });
    const uid = await userIdForRefreshToken('some-raw-token');
    expect(uid).toBe('u9');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/expires_at > now\(\)/); // expired tokens excluded
    expect(params[0]).toMatch(/^[0-9a-f]{64}$/); // looked up by hash
  });

  it('returns null for an unknown/expired token', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await userIdForRefreshToken('nope')).toBeNull();
  });

  it('rotate revokes the old token and issues a new one for the same user', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] }) // lookup
      .mockResolvedValueOnce({ rows: [] })                  // delete (revoke)
      .mockResolvedValueOnce({ rows: [] });                 // insert (issue)
    const result = await rotateRefreshToken('old-raw');
    expect(result?.userId).toBe('u1');
    expect(result?.token).toBeTruthy();
    expect(result?.token).not.toBe('old-raw');
    const deleteCall = mockQuery.mock.calls.find((c) => /DELETE FROM nicole2_refresh_tokens/.test(c[0]));
    expect(deleteCall).toBeTruthy();
  });

  it('rotate returns null when the presented token is invalid', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // lookup miss
    expect(await rotateRefreshToken('bad')).toBeNull();
  });

  it('revoke deletes by hash', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await revokeRefreshToken('raw');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM nicole2_refresh_tokens/);
    expect(params[0]).toMatch(/^[0-9a-f]{64}$/);
  });
});
