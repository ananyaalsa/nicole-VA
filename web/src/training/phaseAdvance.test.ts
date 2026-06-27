import { describe, it, expect } from 'vitest';
import { shouldAdvancePhase, AUTO_PHASES } from './phaseAdvance';

describe('shouldAdvancePhase', () => {
  it('never auto-advances gate phases', () => {
    expect(shouldAdvancePhase('readiness_check', { turns: 99, litDelta: 99, timeInPhaseMs: 9_999_999 })).toBe(false);
    expect(shouldAdvancePhase('roleplay_demo', { turns: 99, litDelta: 99, timeInPhaseMs: 9_999_999 })).toBe(false);
    expect(shouldAdvancePhase('debrief', { turns: 99, litDelta: 99, timeInPhaseMs: 9_999_999 })).toBe(false);
  });

  it('intro advances on one turn past the floor (8s dwell)', () => {
    expect(shouldAdvancePhase('intro', { turns: 1, litDelta: 0, timeInPhaseMs: 8500 })).toBe(true);
    expect(shouldAdvancePhase('intro', { turns: 0, litDelta: 0, timeInPhaseMs: 2000 })).toBe(false);
  });

  it('teach lingers — needs a real exchange (3 turns past a 25s dwell), not a single lit move', () => {
    // A single lit move no longer rushes it onward (minLitDelta is 0 → scorer
    // trigger off); the learner gets time to absorb.
    expect(shouldAdvancePhase('teach', { turns: 1, litDelta: 1, timeInPhaseMs: 5000 })).toBe(false);
    expect(shouldAdvancePhase('teach', { turns: 3, litDelta: 0, timeInPhaseMs: 26000 })).toBe(true);
    expect(shouldAdvancePhase('teach', { turns: 3, litDelta: 0, timeInPhaseMs: 10000 })).toBe(false);
  });

  it('always force-advances past the hard ceiling even with no engagement', () => {
    expect(shouldAdvancePhase('guided_practice', { turns: 0, litDelta: 0, timeInPhaseMs: 320_000 })).toBe(true);
  });

  it('exposes the four auto phases', () => {
    expect(AUTO_PHASES).toEqual(['intro', 'teach', 'model', 'guided_practice']);
  });
});
