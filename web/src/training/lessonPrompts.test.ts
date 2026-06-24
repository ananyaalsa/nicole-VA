import { describe, it, expect } from 'vitest';
import { buildPhasePrompt, type ClientLessonSpec } from './lessonPrompts';

const lesson: ClientLessonSpec = {
  skillId: 'price_objection',
  title: 'Handling the Price Objection',
  objective: 'Handle a price objection without dropping price.',
  hook: 'Worst comeback to "too expensive"?',
  coreFramework: {
    name: 'AER',
    moves: [
      { step: 'Acknowledge', intent: 'validate', keyLine: 'Fair to ask about price.' },
      { step: 'Explore', intent: 'find concern', keyLine: 'Compared to what?' },
      { step: 'Reframe', intent: 'shift to value', keyLine: 'Cost to not fix this?' },
    ],
  },
  mnemonic: 'AER',
  workedExamples: [
    { label: 'good', dialogue: ['You: Fair to ask.'], whyNotes: ['warm'] },
    { label: 'avoid', dialogue: ['You: Fine, 20% off.'], whyNotes: ['caves'] },
  ],
  guidedPracticePrompts: ['Give me your Acknowledge line.'],
  expectations: ['acknowledges first'],
};

describe('lessonPrompts.buildPhasePrompt', () => {
  describe('intro', () => {
    const intro = buildPhasePrompt(lesson, 'intro', null);

    it('contains the hook', () => {
      expect(intro).toContain(lesson.hook);
    });

    it('is short (does not list the worked example dialogue)', () => {
      expect(intro).not.toContain('Fair to ask.');
      // The model phase is much longer; intro should be comfortably shorter.
      const model = buildPhasePrompt(lesson, 'model', null);
      expect(intro.length).toBeLessThan(model.length);
    });

    it('does NOT teach the individual moves (defers to next phase)', () => {
      expect(intro).toMatch(/do not start teaching the individual moves/i);
    });
  });

  describe('teach', () => {
    const teach = buildPhasePrompt(lesson, 'teach', null);

    it('lists the framework moves', () => {
      expect(teach).toContain('AER');
      expect(teach).toContain('Acknowledge');
      expect(teach).toContain('Explore');
      expect(teach).toContain('Reframe');
    });

    it('contains the no-markdown speaking rule from BASE', () => {
      expect(teach).toMatch(/do not use any markdown/i);
      expect(teach).toMatch(/speaking out loud/i);
    });

    it('tells Nicole to deliver, not invent', () => {
      expect(teach).toMatch(/deliver/i);
      expect(teach).toMatch(/do not invent/i);
    });
  });

  describe('debrief', () => {
    const debrief = buildPhasePrompt(lesson, 'debrief', null);

    it('has NO drift guard', () => {
      expect(debrief).not.toMatch(/mid-lesson/i);
      expect(debrief).not.toMatch(/back to normal nicole/i);
    });

    it('gives feedback against each framework move', () => {
      expect(debrief).toMatch(/debrief/i);
      expect(debrief).toContain('Acknowledge, Explore, Reframe');
    });
  });

  describe('SCORE_RIDER (silent live scoring)', () => {
    it('is included in guided_practice', () => {
      const gp = buildPhasePrompt(lesson, 'guided_practice', null);
      expect(gp).toContain('training_mark_progress');
      expect(gp).toMatch(/silent/i);
    });

    it('is included in roleplay_demo', () => {
      const rp = buildPhasePrompt(lesson, 'roleplay_demo', null);
      expect(rp).toContain('training_mark_progress');
    });

    it('is NOT included in teach', () => {
      const teach = buildPhasePrompt(lesson, 'teach', null);
      expect(teach).not.toContain('training_mark_progress');
    });
  });

  describe('DRIFT_GUARD', () => {
    const nonDebrief: Array<Parameters<typeof buildPhasePrompt>[1]> = [
      'intro',
      'teach',
      'model',
      'guided_practice',
      'readiness_check',
      'roleplay_demo',
    ];

    it('is included in every non-debrief phase', () => {
      for (const phase of nonDebrief) {
        const out = buildPhasePrompt(lesson, phase, null);
        expect(out, `phase ${phase}`).toMatch(/mid-lesson/i);
      }
    });
  });

  describe('riders ported from CHAT', () => {
    it('guided_practice focuses a re-teach move when provided', () => {
      const reteach = buildPhasePrompt(lesson, 'guided_practice', 'Explore');
      expect(reteach).toContain('Explore');
      expect(reteach).toMatch(/struggled/i);
    });

    it('model includes the worked example dialogue', () => {
      const model = buildPhasePrompt(lesson, 'model', null);
      expect(model).toContain('Fair to ask.');
    });

    it('roleplay_demo tells Nicole to stay silent and carries difficulty', () => {
      const demo = buildPhasePrompt(
        lesson,
        'roleplay_demo',
        null,
        'openly dismissive, interrupts often',
      );
      expect(demo).toMatch(/silent/i);
      expect(demo).toContain('openly dismissive, interrupts often');
    });

    it('teaching phases get the ADVANCE_RIDER pacing instruction', () => {
      const teach = buildPhasePrompt(lesson, 'teach', null);
      expect(teach).toMatch(/PHASE DISCIPLINE/i);
    });

    it('gate phases get the GATE_RIDER', () => {
      const rp = buildPhasePrompt(lesson, 'roleplay_demo', null);
      expect(rp).toMatch(/do not call any advance tool/i);
    });
  });
});
