import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the shared pool from memory/db so no real DB connection is made.
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../memory/db.js', () => ({
  pool: { query: mockQuery },
}));

import {
  ensureTrainingSchema,
  saveTrainingRun,
  listTrainingHistory,
  getTrainingRun,
} from './historyDb.js';

const SAMPLE_ROW = {
  id: 42,
  user_id: 'u1',
  kind: 'roleplay',
  profile_id: 'sales',
  persona_id: 'cardone',
  scenario_id: 'cold_call',
  title: 'Cold Call with Grant',
  score: 7,
  scorecard: { discovery: 6 },
  transcript: 'hello...',
  created_at: '2026-01-02T00:00:00.000Z',
};

describe('training/historyDb', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('ensureTrainingSchema', () => {
    it('runs a CREATE TABLE IF NOT EXISTS statement', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await ensureTrainingSchema();
      expect(mockQuery).toHaveBeenCalled();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/create table if not exists\s+nicole2_training_history/i);
      expect(sql).toMatch(/scorecard\s+jsonb/i);
    });
  });

  describe('saveTrainingRun', () => {
    it('INSERTs with the right columns and returns the new id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 42 }] });

      const result = await saveTrainingRun({
        userId: 'u1',
        kind: 'roleplay',
        profileId: 'sales',
        personaId: 'cardone',
        scenarioId: 'cold_call',
        title: 'Cold Call with Grant',
        score: 7,
        scorecard: { discovery: 6 },
        transcript: 'hello...',
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/insert\s+into\s+nicole2_training_history/i);
      expect(sql).toMatch(/returning\s+id/i);
      expect(sql).toMatch(/user_id,\s*kind,\s*profile_id,\s*persona_id,\s*scenario_id,\s*title,\s*score,\s*scorecard,\s*transcript/i);
      expect(params[0]).toBe('u1');
      expect(params[1]).toBe('roleplay');
      expect(params[2]).toBe('sales');
      expect(params[5]).toBe('Cold Call with Grant');
      expect(params[6]).toBe(7);
      expect(params[7]).toBe(JSON.stringify({ discovery: 6 }));
      expect(result).toEqual({ id: 42 });
    });

    it('defaults optional columns to null', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      await saveTrainingRun({ userId: 'u1', kind: 'training', title: 'Solo' });
      const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(params[2]).toBeNull(); // profile_id
      expect(params[3]).toBeNull(); // persona_id
      expect(params[4]).toBeNull(); // scenario_id
      expect(params[6]).toBeNull(); // score
      expect(params[7]).toBeNull(); // scorecard
      expect(params[8]).toBeNull(); // transcript
    });
  });

  describe('listTrainingHistory', () => {
    it('SELECTs by user ordered newest first and maps rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ROW] });
      const result = await listTrainingHistory('u1');

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/select\s+[\s\S]*from\s+nicole2_training_history/i);
      expect(sql).toMatch(/where\s+user_id\s*=\s*\$1/i);
      expect(sql).toMatch(/order\s+by\s+created_at\s+desc/i);
      expect(params).toEqual(['u1']);

      expect(result[0]).toEqual({
        id: 42,
        userId: 'u1',
        kind: 'roleplay',
        profileId: 'sales',
        personaId: 'cardone',
        scenarioId: 'cold_call',
        title: 'Cold Call with Grant',
        score: 7,
        scorecard: { discovery: 6 },
        transcript: 'hello...',
        createdAt: '2026-01-02T00:00:00.000Z',
      });
    });
  });

  describe('getTrainingRun', () => {
    it('returns a mapped run scoped to user + id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ROW] });
      const run = await getTrainingRun('u1', 42);
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/where\s+user_id\s*=\s*\$1\s+and\s+id\s*=\s*\$2/i);
      expect(params).toEqual(['u1', 42]);
      expect(run?.id).toBe(42);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const run = await getTrainingRun('u1', 999);
      expect(run).toBeNull();
    });
  });
});
