import pg from 'pg';
import { config } from '../config.js';
import type { MemoryFact } from '../types.js';

const { Pool } = pg;

/**
 * A single shared connection pool for the whole process. Supabase (and most
 * managed Postgres) require SSL; `rejectUnauthorized: false` accepts their
 * cert chain without bundling a CA file.
 */
export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: false },
});

/** Shape of a row as it comes back from Postgres (snake_case columns). */
interface MemoryRow {
  id: number;
  user_id: string;
  key: string;
  fact: string;
  fact_type: string;
  source: string;
  created_at: string;
  updated_at: string;
}

/** Map a snake_case DB row to the camelCase MemoryFact used everywhere else. */
function mapRow(row: MemoryRow): MemoryFact {
  return {
    id: row.id,
    userId: row.user_id,
    key: row.key,
    fact: row.fact,
    factType: row.fact_type,
    source: row.source ?? 'inferred',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create the memory table (and its unique constraint) if it does not yet
 * exist. Idempotent — safe to run on every boot or via `npm run migrate`.
 */
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nicole2_memory (
      id serial PRIMARY KEY,
      user_id text NOT NULL,
      key text NOT NULL,
      fact text NOT NULL,
      fact_type text NOT NULL DEFAULT 'general',
      source text NOT NULL DEFAULT 'inferred',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE (user_id, key)
    )
  `);
  // Provenance column for existing tables: 'settings' (profile facts the user
  // set) vs 'inferred'/'explicit' (learned in conversation). Lets Nicole tell
  // "what I know" from "what we discussed" and never fabricate shared history.
  await pool.query(
    `ALTER TABLE nicole2_memory ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'inferred'`,
  );
  // Backfill: existing profile facts (set in settings) were never tagged. Mark
  // the well-known profile keys as 'settings' so Nicole stops narrating them as
  // things "we discussed". Runs once; harmless to repeat.
  await pool.query(
    `UPDATE nicole2_memory SET source = 'settings'
     WHERE source <> 'settings' AND key IN ('user_about','user_goals','user_phone','user_name')`,
  );
}

/**
 * Upsert a single fact keyed by (user_id, key). If the key already exists for
 * the user, its fact / type are overwritten and updated_at bumped. Returns the
 * stored row mapped to a MemoryFact.
 */
export async function saveFact(f: {
  userId: string;
  key: string;
  fact: string;
  factType?: string;
  /** 'settings' for profile facts; 'inferred'/'explicit' for learned-in-chat. */
  source?: string;
}): Promise<MemoryFact> {
  const factType = f.factType ?? 'general';
  const source = f.source ?? 'inferred';
  const { rows } = await pool.query<MemoryRow>(
    `INSERT INTO nicole2_memory (user_id, key, fact, fact_type, source)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, key) DO UPDATE
       SET fact = EXCLUDED.fact,
           fact_type = EXCLUDED.fact_type,
           source = EXCLUDED.source,
           updated_at = now()
     RETURNING *`,
    [f.userId, f.key, f.fact, factType, source],
  );
  return mapRow(rows[0]);
}

/** Delete a single fact for a user by key. No-op if it does not exist. */
export async function forgetFact(userId: string, key: string): Promise<void> {
  await pool.query(
    `DELETE FROM nicole2_memory WHERE user_id = $1 AND key = $2`,
    [userId, key],
  );
}

/** Load all facts for a user, most-recently-updated first. */
export async function loadFacts(userId: string): Promise<MemoryFact[]> {
  const { rows } = await pool.query<MemoryRow>(
    `SELECT id, user_id, key, fact, fact_type, source, created_at, updated_at
     FROM nicole2_memory
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId],
  );
  return rows.map(mapRow);
}

/** The user's display name (the name to call them), or null if unknown. Loaded
 *  so Nicole always knows who she's talking to from the first message — it's a
 *  column on the users table, not a memory fact. */
export async function loadDisplayName(userId: string): Promise<string | null> {
  try {
    const { rows } = await pool.query<{ display_name: string }>(
      `SELECT display_name FROM nicole2_users WHERE id = $1`,
      [userId],
    );
    const name = rows[0]?.display_name?.trim();
    return name && name !== 'Friend' ? name : null;
  } catch {
    return null;
  }
}

/** Close the shared pool for a clean shutdown (tests, migrations, SIGTERM). */
export async function closePool(): Promise<void> {
  await pool.end();
}
