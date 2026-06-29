import { describe, it, expect, beforeEach, vi } from 'vitest';

// Ensure config loads without a real environment.
process.env.GEMINI_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://x';

// Mock the `pg` Pool so no real DB connection is made. `vi.hoisted` exposes the
// mock query fn to the hoisted factory without a TDZ error.
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));
vi.mock('pg', () => ({
  default: { Pool: vi.fn(() => ({ query: mockQuery, end: vi.fn() })) },
  Pool: vi.fn(() => ({ query: mockQuery, end: vi.fn() })),
}));

import { ensureSchema, saveFact, forgetFact, loadFacts } from './db.js';

const SAMPLE_ROW = {
  id: 7,
  user_id: 'u1',
  key: 'name',
  fact: 'Sam',
  fact_type: 'identity',
  source: 'inferred',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
};

describe('memory/db', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('ensureSchema', () => {
    it('runs a CREATE TABLE IF NOT EXISTS statement', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await ensureSchema();
      expect(mockQuery).toHaveBeenCalled();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/create table if not exists\s+nicole2_memory/i);
      expect(sql).toMatch(/unique\s*\(\s*user_id\s*,\s*key\s*\)/i);
    });
  });

  describe('saveFact', () => {
    it('issues an INSERT ... ON CONFLICT upsert with correct params and returns a mapped fact', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ROW] });

      const result = await saveFact({
        userId: 'u1',
        key: 'name',
        fact: 'Sam',
        factType: 'identity',
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/insert\s+into\s+nicole2_memory/i);
      expect(sql).toMatch(/on\s+conflict\s*\(\s*user_id\s*,\s*key\s*\)\s+do\s+update/i);
      expect(sql).toMatch(/fact\s*=\s*excluded\.fact/i);
      expect(sql).toMatch(/fact_type\s*=\s*excluded\.fact_type/i);
      expect(sql).toMatch(/updated_at\s*=\s*now\(\)/i);
      expect(sql).toMatch(/returning\s+\*/i);
      expect(params).toEqual(['u1', 'name', 'Sam', 'identity', 'inferred']);

      // snake_case row mapped to camelCase MemoryFact
      expect(result).toEqual({
        id: 7,
        userId: 'u1',
        key: 'name',
        fact: 'Sam',
        factType: 'identity',
        source: 'inferred',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      });
    });

    it('defaults factType to "general" and source to "inferred" when omitted', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...SAMPLE_ROW, fact_type: 'general' }],
      });
      const result = await saveFact({ userId: 'u1', key: 'name', fact: 'Sam' });
      const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(params).toEqual(['u1', 'name', 'Sam', 'general', 'inferred']);
      expect(result.factType).toBe('general');
    });

    it('passes source through when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...SAMPLE_ROW, source: 'settings' }] });
      await saveFact({ userId: 'u1', key: 'user_about', fact: 'Agent', source: 'settings' });
      const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(params).toEqual(['u1', 'user_about', 'Agent', 'general', 'settings']);
    });
  });

  describe('forgetFact', () => {
    it('issues a DELETE scoped by user_id and key', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await forgetFact('u1', 'name');
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/delete\s+from\s+nicole2_memory/i);
      expect(sql).toMatch(/where\s+user_id\s*=\s*\$1\s+and\s+key\s*=\s*\$2/i);
      expect(params).toEqual(['u1', 'name']);
    });
  });

  describe('loadFacts', () => {
    it('SELECTs facts for a user ordered by updated_at DESC and maps rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ROW] });
      const result = await loadFacts('u1');

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/select\s+[\s\S]*from\s+nicole2_memory/i);
      expect(sql).toMatch(/where\s+user_id\s*=\s*\$1/i);
      expect(sql).toMatch(/order\s+by\s+updated_at\s+desc/i);
      expect(params).toEqual(['u1']);

      expect(result).toEqual([
        {
          id: 7,
          userId: 'u1',
          key: 'name',
          fact: 'Sam',
          factType: 'identity',
          source: 'inferred',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ]);
    });

    it('returns an empty array when no rows match', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await loadFacts('nobody');
      expect(result).toEqual([]);
    });
  });
});
