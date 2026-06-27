import type { Phase } from './phaseMachine';

export interface AdvanceSignals {
  turns: number;          // substantive user turns in this phase
  litDelta: number;       // scorecard dimensions newly lit this phase
  timeInPhaseMs: number;  // wall time since entering this phase
}

interface PhaseCfg { minLitDelta: number; minTurns: number; minPhaseMs: number; maxPhaseMs: number }

// Pacing: LINGER, don't rush. Each teaching phase needs a real exchange (more
// turns) and a longer minimum dwell before the app moves on, so the learner has
// time to absorb. The hard ceiling only force-advances if a phase truly stalls.
const CFG: Record<string, PhaseCfg> = {
  intro:           { minLitDelta: 0, minTurns: 1, minPhaseMs: 8000,  maxPhaseMs: 120000 },
  teach:           { minLitDelta: 0, minTurns: 3, minPhaseMs: 25000, maxPhaseMs: 240000 },
  model:           { minLitDelta: 0, minTurns: 3, minPhaseMs: 25000, maxPhaseMs: 240000 },
  guided_practice: { minLitDelta: 3, minTurns: 4, minPhaseMs: 30000, maxPhaseMs: 300000 },
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
  // (b) engagement floor. Note intro's minLitDelta is 0, so (a) is skipped for
  // it and it advances purely on this floor (1 turn past a 6s dwell).
  if (s.turns >= cfg.minTurns && s.timeInPhaseMs >= cfg.minPhaseMs) return true;
  return false;
}
