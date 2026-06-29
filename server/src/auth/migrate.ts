import { pool } from '../memory/db.js';

export async function ensureAuthSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nicole2_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text UNIQUE NOT NULL,
      password_hash text NOT NULL,
      display_name text NOT NULL DEFAULT 'Friend',
      preferred_voice text NOT NULL DEFAULT 'Aoede',
      onboarding_done boolean NOT NULL DEFAULT false,
      created_at timestamptz DEFAULT now()
    )
  `);
}
