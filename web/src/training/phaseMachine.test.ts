import { describe, it, expect } from 'vitest';
import {
  PHASE_ORDER,
  nextPhase,
  advancePhase,
  type Phase,
} from './phaseMachine';

describe('phaseMachine', () => {
  describe('PHASE_ORDER', () => {
    it('is the 7-phase default linear teaching sequence', () => {
      expect(PHASE_ORDER).toEqual([
        'intro',
        'teach',
        'model',
        'guided_practice',
        'readiness_check',
        'roleplay_demo',
        'debrief',
      ]);
    });

    it('does not include the optional gate phases in the default flow', () => {
      expect(PHASE_ORDER).not.toContain('baseline_assess');
      expect(PHASE_ORDER).not.toContain('level_gate');
    });
  });

  describe('nextPhase', () => {
    it('walks the order start to finish', () => {
      expect(nextPhase('intro')).toBe('teach');
      expect(nextPhase('teach')).toBe('model');
      expect(nextPhase('model')).toBe('guided_practice');
      expect(nextPhase('guided_practice')).toBe('readiness_check');
      expect(nextPhase('readiness_check')).toBe('roleplay_demo');
      expect(nextPhase('roleplay_demo')).toBe('debrief');
    });

    it('returns null at the end (debrief)', () => {
      expect(nextPhase('debrief')).toBeNull();
    });

    it('returns null for phases outside the default order', () => {
      expect(nextPhase('baseline_assess')).toBeNull();
      expect(nextPhase('level_gate')).toBeNull();
    });
  });

  describe('advancePhase', () => {
    it('stays put when learnerTurns is under the minimum', () => {
      expect(advancePhase('intro', { learnerTurns: 0 })).toBe('intro');
      expect(advancePhase('intro', { learnerTurns: 1 })).toBe('intro');
    });

    it('advances when learnerTurns meets the default minimum of 2', () => {
      expect(advancePhase('intro', { learnerTurns: 2 })).toBe('teach');
      expect(advancePhase('teach', { learnerTurns: 5 })).toBe('model');
    });

    it('honors a custom minTurns threshold', () => {
      expect(advancePhase('intro', { learnerTurns: 2, minTurns: 3 })).toBe(
        'intro',
      );
      expect(advancePhase('intro', { learnerTurns: 3, minTurns: 3 })).toBe(
        'teach',
      );
    });

    it('treats debrief as terminal even when engaged', () => {
      expect(advancePhase('debrief', { learnerTurns: 99 })).toBe('debrief');
    });

    it('walks the whole sequence when engagement is met each step', () => {
      let phase: Phase = 'intro';
      const visited: Phase[] = [phase];
      for (let i = 0; i < 10; i++) {
        const next = advancePhase(phase, { learnerTurns: 2 });
        if (next === phase) break;
        phase = next;
        visited.push(phase);
      }
      expect(visited).toEqual(PHASE_ORDER);
    });
  });
});
