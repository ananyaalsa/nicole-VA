import type { TranscriptLine } from '../engine/types';

/**
 * How Nicole should pitch her teaching for THIS learner, inferred from how they've
 * been responding. The lesson CONTENT is fixed; only the delivery adapts — so the
 * same drill doesn't feel scripted/identical every time.
 *
 *  - 'socratic'        — learner is engaged + confident; push with deeper questions.
 *  - 'worked_example'  — learner is confused / terse; show the move in action first.
 *  - 'direct'          — default; state the move plainly, no elaborate framing.
 */
export type TeachingStyle = 'socratic' | 'worked_example' | 'direct';

const CONFUSION = /\b(i (don'?t|do not) (get|understand)|confused|what do you mean|huh|not sure|lost|can you (repeat|explain)|say that again)\b/i;
const QUESTION = /\?|\b(what|how|why|when|which|could you|can you|should i)\b/i;
const HEDGE = /\b(um+|uh+|i guess|maybe|i think so|sort of|kinda)\b/i;

/** Assess the learner's teaching style from their committed 'you' lines. */
export function assessTeachingStyle(coachTranscript: TranscriptLine[]): TeachingStyle {
  const youLines = coachTranscript.filter((l) => l.speaker === 'you').map((l) => l.text.trim()).filter(Boolean);
  if (youLines.length === 0) return 'direct';

  const recent = youLines.slice(-3);
  const last = recent[recent.length - 1] ?? '';
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const avgLen = recent.reduce((a, s) => a + words(s), 0) / recent.length;

  const confused = recent.some((s) => CONFUSION.test(s));
  const asking = QUESTION.test(last);
  const hedging = recent.some((s) => HEDGE.test(s));

  // Confused / very terse / hedging → show them, don't quiz them.
  if (confused || avgLen <= 2 || hedging) return 'worked_example';
  // Engaged: substantive answers and/or asking their own questions → go Socratic.
  if (asking || avgLen >= 12) return 'socratic';
  // Otherwise keep it plain and direct.
  return 'direct';
}
