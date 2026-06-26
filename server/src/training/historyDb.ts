/**
 * Training-history persistence. Reuses the SHARED pg pool from memory/db so the
 * whole process keeps a single connection pool.
 */
import { pool } from '../memory/db.js';

export interface TrainingRun {
  id: number;
  userId: string;
  kind: 'roleplay' | 'training';
  profileId?: string | null;
  personaId?: string | null;
  scenarioId?: string | null;
  title: string;
  score?: number | null;
  scorecard?: unknown | null;
  transcript?: string | null;
  createdAt: string;
}

/** Shape of a row as Postgres returns it (snake_case columns). */
interface TrainingRow {
  id: number;
  user_id: string;
  kind: string;
  profile_id: string | null;
  persona_id: string | null;
  scenario_id: string | null;
  title: string;
  score: number | null;
  scorecard: unknown | null;
  transcript: string | null;
  created_at: string;
}

function mapRow(row: TrainingRow): TrainingRun {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind as TrainingRun['kind'],
    profileId: row.profile_id,
    personaId: row.persona_id,
    scenarioId: row.scenario_id,
    title: row.title,
    score: row.score,
    scorecard: row.scorecard,
    transcript: row.transcript,
    createdAt: row.created_at,
  };
}

/**
 * Create the training-history table if it does not yet exist. Idempotent — safe
 * to run on every boot.
 */
export async function ensureTrainingSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nicole2_training_history (
      id serial PRIMARY KEY,
      user_id text NOT NULL,
      kind text NOT NULL,
      profile_id text,
      persona_id text,
      scenario_id text,
      title text NOT NULL,
      score real,
      scorecard jsonb,
      transcript text,
      created_at timestamptz DEFAULT now()
    )
  `);
  // Migration: the score column was originally `int`, which rejected the decimal
  // scores the LLM judge now produces (e.g. 4.7) — every save silently failed.
  // Widen any existing integer column to `real`. Idempotent + safe.
  try {
    await pool.query(`
      ALTER TABLE nicole2_training_history
        ALTER COLUMN score TYPE real USING score::real
    `);
  } catch {
    /* already real, or table absent — ignore */
  }
}

/** Persist one completed roleplay/training run. Returns the new row's id. */
export async function saveTrainingRun(run: {
  userId: string;
  kind: 'roleplay' | 'training';
  profileId?: string;
  personaId?: string;
  scenarioId?: string;
  title: string;
  score?: number;
  scorecard?: unknown;
  transcript?: string;
}): Promise<{ id: number }> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO nicole2_training_history
       (user_id, kind, profile_id, persona_id, scenario_id, title, score, scorecard, transcript)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      run.userId,
      run.kind,
      run.profileId ?? null,
      run.personaId ?? null,
      run.scenarioId ?? null,
      run.title,
      run.score ?? null,
      run.scorecard !== undefined ? JSON.stringify(run.scorecard) : null,
      run.transcript ?? null,
    ],
  );
  return { id: rows[0].id };
}

/** All runs for a user, newest first. */
export async function listTrainingHistory(userId: string): Promise<TrainingRun[]> {
  const { rows } = await pool.query<TrainingRow>(
    `SELECT id, user_id, kind, profile_id, persona_id, scenario_id, title, score, scorecard, transcript, created_at
     FROM nicole2_training_history
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC`,
    [userId],
  );
  return rows.map(mapRow);
}

/** A single run scoped to its owner. Null if not found / not owned. */
export async function getTrainingRun(userId: string, id: number): Promise<TrainingRun | null> {
  const { rows } = await pool.query<TrainingRow>(
    `SELECT id, user_id, kind, profile_id, persona_id, scenario_id, title, score, scorecard, transcript, created_at
     FROM nicole2_training_history
     WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}
