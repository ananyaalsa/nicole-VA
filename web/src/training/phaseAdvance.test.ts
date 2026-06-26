import { describe, it, expect } from 'vitest';
import { shouldAdvancePhase, AUTO_PHASES } from './phaseAdvance';

describe('shouldAdvancePhase', () => {
  it('never auto-advances gate phases', () => {
    expect(shouldAdvancePhase('readiness_check', { turns: 99, litDelta: 99, timeInPhaseMs: 9_999_999 })).toBe(false);
    expect(shouldAdvancePhase('roleplay_demo', { turns: 99, litDelta: 99, timeInPhaseMs: 9_999_999 })).toBe(false);
    expect(shouldAdvancePhase('debrief', { turns: 99, litDelta: 99, timeInPhaseMs: 9_999_999 })).toBe(false);
  });

  it('intro advances quickly on one turn past the floor', () => {
    expect(shouldAdvancePhase('intro', { turns: 1, litDelta: 0, timeInPhaseMs: 6500 })).toBe(true);
    expect(shouldAdvancePhase('intro', { turns: 0, litDelta: 0, timeInPhaseMs: 2000 })).toBe(false);
  });

  it('teach advances on enough lit moves', () => {
    expect(shouldAdvancePhase('teach', { turns: 0, litDelta: 1, timeInPhaseMs: 1000 })).toBe(true);
  });

  it('teach advances on the engagement floor', () => {
    expect(shouldAdvancePhase('teach', { turns: 2, litDelta: 0, timeInPhaseMs: 13000 })).toBe(true);
    expect(shouldAdvancePhase('teach', { turns: 2, litDelta: 0, timeInPhaseMs: 5000 })).toBe(false);
  });

  it('always force-advances past the hard ceiling even with no engagement', () => {
    expect(shouldAdvancePhase('guided_practice', { turns: 0, litDelta: 0, timeInPhaseMs: 200_000 })).toBe(true);
  });

  it('exposes the four auto phases', () => {
    expect(AUTO_PHASES).toEqual(['intro', 'teach', 'model', 'guided_practice']);
  });
});
