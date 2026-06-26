import type { Phase } from './phaseMachine';

export interface AdvanceSignals {
  turns: number;          // substantive user turns in this phase
  litDelta: number;       // scorecard dimensions newly lit this phase
  timeInPhaseMs: number;  // wall time since entering this phase
}

interface PhaseCfg { minLitDelta: number; minTurns: number; minPhaseMs: number; maxPhaseMs: number }

const CFG: Record<string, PhaseCfg> = {
  intro:           { minLitDelta: 0, minTurns: 1, minPhaseMs: 6000,  maxPhaseMs: 90000 },
  teach:           { minLitDelta: 1, minTurns: 2, minPhaseMs: 12000, maxPhaseMs: 180000 },
  model:           { minLitDelta: 1, minTurns: 2, minPhaseMs: 12000, maxPhaseMs: 180000 },
  guided_practice: { minLitDelta: 2, minTurns: 2, minPhaseMs: 12000, maxPhaseMs: 180000 },
};

/** The phases the APP advances on its own. Gates (readiness_check, roleplay_demo,
 *  debrief) are user/explicit and never auto-advance. */
export const AUTO_PHASES: Phase[] = ['intro', 'teach', 'model', 'guided_practice'];

/**
 * App-driven advance: a phase is "done" when ANY of
 *   (a) enough scorecard moves lit, (b) the engagement floor (turns past a min
 *   dwell), or (c) a hard time ceiling (so it can never stall — wins even on
 *   silence). Returns false for any non-AUTO phase.
 */
export function shouldAdvancePhase(phase: Phase, s: AdvanceSignals): boolean {
  const cfg = CFG[phase];
  if (!cfg) return false; // gate phase
  if (s.timeInPhaseMs >= cfg.maxPhaseMs) return true;            // (c) ceiling
  if (s.litDelta >= cfg.minLitDelta && cfg.minLitDelta > 0) return true; // (a) scorer
  if (s.turns >= cfg.minTurns && s.timeInPhaseMs >= cfg.minPhaseMs) return true; // (b) floor
  // intro special-case: minLitDelta is 0, so (a) above is skipped; allow the
  // floor with a single turn.
  if (phase === 'intro' && s.turns >= cfg.minTurns && s.timeInPhaseMs >= cfg.minPhaseMs) return true;
  return false;
}
