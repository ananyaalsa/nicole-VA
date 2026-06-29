import { listTrainingHistory } from '../training/historyDb.js';

/** A scorecard row as stored on a run (loose shape). */
interface ScRow { dimension?: string; hit?: boolean }

/**
 * Build a compact, FACTUAL "recent activity" digest from the user's stored
 * training/roleplay runs — counts + the last few sessions + the weakest skill.
 * Used to make Talk-Nicole aware of what the user actually did in the other
 * modes, so she can reference real sessions and never invent them. Returns one
 * line per item (the caller wraps them in the [RECENT ACTIVITY] block); empty
 * array when there's no history.
 */
export async function buildActivityDigest(userId: string): Promise<string[]> {
  let runs: Awaited<ReturnType<typeof listTrainingHistory>>;
  try {
    runs = await listTrainingHistory(userId);
  } catch {
    return [];
  }
  if (!runs.length) return [];

  const roleplays = runs.filter((r) => r.kind === 'roleplay').length;
  const trainings = runs.filter((r) => r.kind === 'training').length;

  const lines: string[] = [];
  // Summary counts.
  const counts: string[] = [];
  if (roleplays) counts.push(`${roleplays} roleplay session${roleplays === 1 ? '' : 's'}`);
  if (trainings) counts.push(`${trainings} training session${trainings === 1 ? '' : 's'}`);
  if (counts.length) lines.push(`Total: ${counts.join(' and ')} completed.`);

  // The 3 most recent sessions (runs come back newest-first).
  for (const r of runs.slice(0, 3)) {
    const d = new Date(r.createdAt);
    const date = Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    const scoreTxt = typeof r.score === 'number' ? ` — scored ${r.score.toFixed(1)}/10` : '';
    lines.push(`${date ? `${date}: ` : ''}${r.kind === 'training' ? 'Training' : 'Roleplay'} "${r.title}"${scoreTxt}`);
  }

  // Weakest dimension across recent scorecards (lowest hit-rate).
  const tally = new Map<string, { hit: number; total: number }>();
  for (const r of runs.slice(0, 10)) {
    const card = Array.isArray(r.scorecard) ? (r.scorecard as ScRow[]) : [];
    for (const row of card) {
      if (!row || typeof row !== 'object' || !row.dimension) continue;
      const t = tally.get(row.dimension) ?? { hit: 0, total: 0 };
      t.total += 1;
      if (row.hit) t.hit += 1;
      tally.set(row.dimension, t);
    }
  }
  let weakest: string | null = null;
  let worst = Infinity;
  for (const [dim, t] of tally) {
    const rate = t.hit / t.total;
    if (rate < worst) { worst = rate; weakest = dim; }
  }
  if (weakest) lines.push(`Weakest skill so far: ${weakest}.`);

  return lines;
}
