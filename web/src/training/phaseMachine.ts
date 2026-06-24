/**
 * Training phase state machine (pure, no React).
 *
 * Ported from the CHAT project's training/phaseMachine.ts. The CHAT version used
 * a full reducer with streak tracking, remediation caps and a skip override; for
 * Nicole 2.0 we expose the simpler advance-on-engagement API the coaching hook
 * needs, while keeping the optional gate phases in the `Phase` type so authored
 * lessons / overlays can still reference them.
 */

/**
 * Every phase a training session can be in. The default linear flow uses seven
 * of these (see {@link PHASE_ORDER}); `baseline_assess` and `level_gate` are
 * optional scored gates kept in the type for prompts/overlays that opt into them.
 */
export type Phase =
  | 'intro'
  | 'teach'
  | 'model'
  | 'guided_practice'
  | 'baseline_assess'
  | 'readiness_check'
  | 'level_gate'
  | 'roleplay_demo'
  | 'debrief';

/**
 * The default linear teaching sequence. `baseline_assess` and `level_gate` are
 * deliberately excluded — they are optional gates, not part of the standard run.
 */
export const PHASE_ORDER: Phase[] = [
  'intro',
  'teach',
  'model',
  'guided_practice',
  'readiness_check',
  'roleplay_demo',
  'debrief',
];

/**
 * The next phase after `current` in {@link PHASE_ORDER}, or `null` when there is
 * no next phase — i.e. at the terminal `debrief`, or for a phase that is not part
 * of the default linear flow.
 */
export function nextPhase(current: Phase): Phase | null {
  const i = PHASE_ORDER.indexOf(current);
  if (i < 0 || i >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[i + 1];
}

/** Signals the app uses to decide whether the learner has engaged enough. */
export interface EngagementSignals {
  /** How many substantive turns the learner has taken in the current phase. */
  learnerTurns: number;
  /** Minimum turns required before advancing. Defaults to 2. */
  minTurns?: number;
}

/**
 * Advance to {@link nextPhase} only once the learner has engaged enough
 * (`learnerTurns >= minTurns`, default 2); otherwise stay in `current`. `debrief`
 * is terminal and always stays put.
 */
export function advancePhase(
  current: Phase,
  engagementSignals: EngagementSignals,
): Phase {
  const minTurns = engagementSignals.minTurns ?? 2;
  if (engagementSignals.learnerTurns < minTurns) return current;
  const next = nextPhase(current);
  return next ?? current;
}
