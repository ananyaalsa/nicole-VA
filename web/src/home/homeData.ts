// Pure helpers that turn the data Nicole already has (name, goals, time,
// session history) into the personalized home-screen surfaces. No network here
// — callers pass in what they fetched. Everything is deterministic + testable.

import type { TrainingRun } from '../training/trainingApi';

/* ── Greeting ─────────────────────────────────────────────────────────────── */

/** Time-of-day greeting using the user's first name. */
export function greeting(displayName: string | undefined, now: Date = new Date()): string {
  const first = (displayName ?? '').trim().split(/\s+/)[0];
  const h = now.getHours();
  const part = h < 5 ? 'Hello' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return first ? `${part}, ${first}` : `${part}`;
}

/* ── Suggested prompts ───────────────────────────────────────────────────── */

/** A starter prompt the user can tap to begin a session with that ask. */
export interface Starter {
  /** Short chip label. */
  label: string;
  /** The full prompt seeded into the session on tap. */
  prompt: string;
}

// The prompts are bracketed directives so Nicole TALKS about the topic right
// here in Talk (a quick conversational opener) instead of switching to Training.
const topicOpener = (topic: string): string =>
  `[TOPIC] Open a quick conversation about ${topic} right here — share one useful, specific tip and ask what part they want to dig into. Do NOT switch to training or roleplay mode; just talk it through with me here.`;

/** Generic fallback starters (used when the user has no goals saved). */
const GENERIC: Starter[] = [
  { label: 'Cold open', prompt: topicOpener('opening a cold call') },
  { label: 'Price objection', prompt: topicOpener('handling a pricing objection') },
  { label: 'Discovery', prompt: topicOpener('running a great discovery call') },
  { label: 'Closing', prompt: topicOpener('closing techniques') },
  { label: 'Ask anything', prompt: '[TOPIC] Ask me what I want to get better at in sales, then talk it through here.' },
];

/** Map a saved goal string to a tappable starter. */
function goalToStarter(goal: string): Starter {
  const g = goal.trim();
  return { label: g, prompt: topicOpener(g.toLowerCase()) };
}

/**
 * Build the starter list: goals first (personalized), then generic fillers, to
 * a max of `count`. Rotated by the day so the set isn't identical every visit,
 * while keeping a stable order within a day.
 */
export function starters(
  goals: string[],
  count = 3,
  now: Date = new Date(),
): Starter[] {
  const fromGoals = goals.map(goalToStarter);
  const pool = [...fromGoals, ...GENERIC];
  // Dedupe by label.
  const seen = new Set<string>();
  const unique = pool.filter((s) => {
    const k = s.label.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (unique.length <= count) return unique;
  // Day-seeded rotation: stable within a day, shifts across days.
  const day = Math.floor(now.getTime() / 86_400_000);
  const offset = day % unique.length;
  const rotated = [...unique.slice(offset), ...unique.slice(0, offset)];
  return rotated.slice(0, count);
}

/* ── Coach nudges (from history) ─────────────────────────────────────────── */

export interface CoachStats {
  /** Consecutive local-days (ending today/yesterday) with at least one run. */
  streak: number;
  /** Most recent run's score (0–10), or null. */
  lastScore: number | null;
  /** Trend vs the previous scored run: 'up' | 'down' | 'flat' | null. */
  trend: 'up' | 'down' | 'flat' | null;
  /** The dimension the user hits least often across recent scorecards. */
  weakest: string | null;
}

interface ScRow { dimension?: string; hit?: boolean }
function readRows(card: unknown): ScRow[] {
  return Array.isArray(card) ? card.filter((r): r is ScRow => !!r && typeof r === 'object') : [];
}
/** Local YYYY-MM-DD key for a date (month is 1-indexed + zero-padded, so the key
 *  is a real date string and safe to compare/sort lexicographically). */
function dayKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Compute streak, last score + trend, and weakest dimension from runs. */
export function coachStats(runs: TrainingRun[], now: Date = new Date()): CoachStats {
  if (!runs.length) return { streak: 0, lastScore: null, trend: null, weakest: null };

  // Runs are newest-first from the API; be defensive and sort by createdAt desc.
  const sorted = [...runs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Streak: count back from today over consecutive days that have a run.
  const days = new Set(sorted.map((r) => dayKey(new Date(r.createdAt))));
  let streak = 0;
  const cur = new Date(now);
  // Allow the streak to "start" today or yesterday (so an evening gap is ok).
  if (!days.has(dayKey(cur))) cur.setDate(cur.getDate() - 1);
  while (days.has(dayKey(cur))) {
    streak += 1;
    cur.setDate(cur.getDate() - 1);
  }

  // Last score + trend (vs the previous scored run).
  const scored = sorted.filter((r) => typeof r.score === 'number') as (TrainingRun & { score: number })[];
  const lastScore = scored[0]?.score ?? null;
  let trend: CoachStats['trend'] = null;
  if (scored.length >= 2) {
    const d = scored[0].score - scored[1].score;
    trend = d > 0.2 ? 'up' : d < -0.2 ? 'down' : 'flat';
  }

  // Weakest dimension: lowest hit-rate across recent scorecards (last ~10 runs).
  const tally = new Map<string, { hit: number; total: number }>();
  for (const r of sorted.slice(0, 10)) {
    for (const row of readRows(r.scorecard)) {
      if (!row.dimension) continue;
      const t = tally.get(row.dimension) ?? { hit: 0, total: 0 };
      t.total += 1;
      if (row.hit) t.hit += 1;
      tally.set(row.dimension, t);
    }
  }
  let weakest: string | null = null;
  let worstRate = Infinity;
  for (const [dim, t] of tally) {
    const rate = t.hit / t.total;
    if (rate < worstRate) { worstRate = rate; weakest = dim; }
  }

  return { streak, lastScore, trend, weakest };
}
