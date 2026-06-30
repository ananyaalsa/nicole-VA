// Per-user daily-activity tracking for the practice STREAK. A "streak" should
// advance from simply opening Nicole each day (Talk, Training, or Roleplay),
// not only from completing a scored rep. We record one row per user per local
// day they were active, then count consecutive days back from today.
//
// This is deliberately separate from the memory table so daily activity never
// shows up in the "what Nicole remembers" panel.

import { pool } from '../memory/db.js';

/** Create the activity-days table if it does not yet exist. Idempotent. */
export async function ensureActivitySchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nicole2_activity_days (
      user_id text NOT NULL,
      day date NOT NULL,
      created_at timestamptz DEFAULT now(),
      UNIQUE (user_id, day)
    )
  `);
}

/**
 * Mark a day (default: the day implied by `dayKey`) as active for a user. The
 * caller passes the LOCAL day key (YYYY-MM-DD) computed from the client's clock,
 * so the streak respects the user's timezone rather than the server's UTC date.
 * Idempotent per (user, day).
 */
export async function markActive(userId: string, dayKey: string): Promise<void> {
  await pool.query(
    `INSERT INTO nicole2_activity_days (user_id, day)
     VALUES ($1, $2)
     ON CONFLICT (user_id, day) DO NOTHING`,
    [userId, dayKey],
  );
}

/**
 * Recent active-day keys (YYYY-MM-DD) for a user, newest first, capped so the
 * query stays cheap. 400 days is far beyond any real streak but bounds the scan.
 */
export async function recentActiveDays(userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ day: string }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day
     FROM nicole2_activity_days
     WHERE user_id = $1
     ORDER BY day DESC
     LIMIT 400`,
    [userId],
  );
  return rows.map((r) => r.day);
}

/**
 * Count the consecutive-day streak ending today or yesterday, given the set of
 * active-day keys and the user's local today key. Allowing the streak to start
 * "yesterday" means an evening with no open yet doesn't reset it. Pure, so the
 * route and tests share one definition.
 */
export function streakFromDays(activeDayKeys: Iterable<string>, todayKey: string): number {
  const days = new Set(activeDayKeys);
  // Walk back day-by-day from today using a Date built from the key (UTC-noon to
  // dodge DST edges), counting while each day is present.
  const toDate = (key: string): Date => new Date(`${key}T12:00:00Z`);
  const keyOf = (d: Date): string => d.toISOString().slice(0, 10);

  let cur = toDate(todayKey);
  if (!days.has(keyOf(cur))) cur = new Date(cur.getTime() - 86_400_000); // allow yesterday
  let streak = 0;
  while (days.has(keyOf(cur))) {
    streak += 1;
    cur = new Date(cur.getTime() - 86_400_000);
  }
  return streak;
}
