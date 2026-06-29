import { pool } from '../memory/db.js';

export interface LiveStatus {
  /**
   * entered  — opened the screen, no drill/rep started yet.
   * active   — currently in a drill/rep.
   * finished — COMPLETED it (has a score / saw the debrief).
   * left     — exited WITHOUT completing (bailed mid-drill or right after start).
   *            Distinct from 'finished' so Nicole never congratulates a drill the
   *            user abandoned.
   */
  mode: 'training' | 'roleplay';
  state: 'entered' | 'active' | 'finished' | 'left';
  skill?: string;
  startedAt: number;       // epoch ms
  finishedAt?: number;
  score?: number;
}

const STALE_MS = 15 * 60 * 1000;

/** Ensure the table exists (called from server bootstrap alongside other schemas). */
export async function ensureLiveStatusSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nicole2_live_status (
      user_id text PRIMARY KEY,
      status jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

/**
 * Persist the user's live session status to Postgres (one row per user, upserted),
 * so it survives restarts and is consistent across multiple server instances —
 * the in-memory Map was lost on restart and invisible to other instances behind a
 * load balancer. Best-effort: a write failure must never break the live session.
 */
export async function setLiveStatus(userId: string, s: LiveStatus): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO nicole2_live_status (user_id, status, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
      [userId, JSON.stringify(s)],
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[liveStatus] write failed (non-fatal):', (err as Error).message);
  }
}

/** Read the user's live status, or null if none / older than the stale window. */
export async function getLiveStatus(userId: string): Promise<LiveStatus | null> {
  try {
    const { rows } = await pool.query<{ status: LiveStatus; updated_at: string }>(
      `SELECT status, updated_at FROM nicole2_live_status WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0];
    if (!row) return null;
    // Drop stale rows so a week-old status never resurfaces.
    if (Date.now() - new Date(row.updated_at).getTime() > STALE_MS) return null;
    // pg returns jsonb already parsed, but tolerate a string just in case.
    return typeof row.status === 'string' ? JSON.parse(row.status) : row.status;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[liveStatus] read failed (non-fatal):', (err as Error).message);
    return null;
  }
}

function minutesAgo(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  return m <= 0 ? 'just now' : `${m} min ago`;
}

/** A factual one-liner for Talk-Nicole's memory block, or null if too old to
 *  matter. `nowMs` is injected so this stays pure/testable. */
export function formatLiveStatusLine(s: LiveStatus, nowMs: number): string | null {
  const ref = s.finishedAt ?? s.startedAt;
  if (nowMs - ref > STALE_MS) return null;
  const modeLabel = s.mode === 'training' ? 'Training' : 'Roleplay';
  const skill = s.skill ? ` (${s.skill})` : '';
  if (s.state === 'active') {
    return `User is currently in a ${modeLabel} ${s.mode === 'training' ? 'drill' : 'rep'}${skill}, started ${minutesAgo(nowMs - s.startedAt)}.`;
  }
  if (s.state === 'finished') {
    const score = typeof s.score === 'number' ? ` — scored ${s.score.toFixed(1)}/10` : '';
    return `User just COMPLETED a ${modeLabel}${skill} ${minutesAgo(nowMs - (s.finishedAt ?? s.startedAt))}${score}. You may ask how it went.`;
  }
  if (s.state === 'left') {
    return `User opened a ${modeLabel}${skill} and then LEFT WITHOUT completing it. Do NOT congratulate them or say "nice work finishing" — they did not finish. If anything, ask if they want to actually run it.`;
  }
  // entered
  return `User opened ${modeLabel} a moment ago but hasn't started ${s.mode === 'training' ? 'a drill' : 'a rep'} yet.`;
}
