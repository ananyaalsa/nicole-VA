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
  // Refresh tokens: only a SHA-256 HASH of each token is stored (so a DB leak
  // can't be used to mint access tokens). Rotated on every refresh; expired rows
  // are swept lazily. One row per active device/session.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nicole2_refresh_tokens (
      token_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES nicole2_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_refresh_user ON nicole2_refresh_tokens(user_id)`,
  );
}
