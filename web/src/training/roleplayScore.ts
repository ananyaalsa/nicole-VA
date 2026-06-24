/**
 * Honest, transparent "engagement score" for a finished roleplay.
 *
 * This is deliberately NOT a fake AI quality judgement — Nicole is not present in
 * a roleplay, so nothing scores the *content*. Instead we compute a simple 0-10
 * engagement heuristic from how much the user actually engaged: how many turns
 * they took and how much they said. More turns + more words means a fuller,
 * more committed rep, up to a sensible cap.
 *
 * Properties (covered by tests):
 *  - 0 turns / 0 words  -> 0 (you never engaged).
 *  - Monotonic non-decreasing in both turns and words.
 *  - Always clamped to [0, 10].
 */

/** Weight per user turn (a back-and-forth exchange is worth more than length). */
const PER_TURN = 1.1;
/** Weight per spoken word (rewards substance, but with diminishing scale). */
const PER_WORD = 0.045;

/**
 * Compute the engagement score (0-10) for a roleplay run.
 *
 * @param userLineCount how many lines the *user* contributed
 * @param totalWords    total words across the user's lines
 */
export function scoreRoleplay(userLineCount: number, totalWords: number): number {
  const turns = Math.max(0, userLineCount);
  const words = Math.max(0, totalWords);

  // No engagement at all -> a clean zero (don't reward merely entering the room).
  if (turns === 0 && words === 0) return 0;

  const raw = turns * PER_TURN + words * PER_WORD;
  const clamped = Math.min(10, Math.max(0, raw));
  // One decimal place keeps it honest and readable (e.g. 6.4).
  return Math.round(clamped * 10) / 10;
}

export default scoreRoleplay;
