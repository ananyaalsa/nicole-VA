import { describe, it, expect } from 'vitest';
import { buildPhasePrompt, buildProspectOverlay, prospectName, type ClientLessonSpec } from './lessonPrompts';

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

    it('bans the "anything else I can help with" general-assistant closing', () => {
      for (const phase of ['teach', 'guided_practice', 'readiness_check'] as const) {
        const out = buildPhasePrompt(lesson, phase, null);
        expect(out, `phase ${phase}`).toMatch(/anything else i can help with/i);
      }
    });
  });

  describe('coaching behavior riders', () => {
    it('readiness_check points the learner at the on-screen go-live button, not "anything else?"', () => {
      const rc = buildPhasePrompt(lesson, 'readiness_check', null);
      expect(rc).toMatch(/you'?re ready/i);
      expect(rc).toMatch(/live rep/i);
    });

    it('teaching phases invite curiosity about other frameworks instead of refusing', () => {
      const teach = buildPhasePrompt(lesson, 'teach', null);
      expect(teach).toMatch(/other approaches|another framework|other framework/i);
      expect(teach).toMatch(/do not brush them off|do not shut it down/i);
    });

    it('teaching phases enforce one-beat-then-stop turn discipline', () => {
      const teach = buildPhasePrompt(lesson, 'teach', null);
      expect(teach).toMatch(/one beat/i);
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

    it('every coach phase forbids simulating the learner (turn discipline)', () => {
      for (const ph of ['intro', 'teach', 'model', 'guided_practice'] as const) {
        const p = buildPhasePrompt(lesson, ph, null);
        expect(p).toMatch(/TURN-TAKING/i);
        expect(p.toLowerCase()).toContain('wait for');
      }
    });

    it('teaching phases steer delivery by the adaptive teaching style', () => {
      const socratic = buildPhasePrompt(lesson, 'teach', null, undefined, 'socratic');
      expect(socratic).toMatch(/lean SOCRATIC/i);
      const worked = buildPhasePrompt(lesson, 'teach', null, undefined, 'worked_example');
      expect(worked).toMatch(/WORKED EXAMPLE/i);
      const direct = buildPhasePrompt(lesson, 'teach', null, undefined, 'direct');
      expect(direct).toMatch(/keep it DIRECT/i);
    });
  });

  describe('buildProspectOverlay (live-rep persona)', () => {
    it('pins a fixed MALE persona and forbids Nicole / female / name-asking', () => {
      const ov = buildProspectOverlay(lesson);
      const name = prospectName(lesson);
      // It IS the persona, by name.
      expect(ov).toContain(name);
      expect(ov).toMatch(/male/i);
      // Hard identity rules present.
      expect(ov).toMatch(/never say your name is "Nicole"/i);
      expect(ov).toMatch(/never offer or suggest other names/i);
      expect(ov).toMatch(/never ask the user what/i);
      // Not a coach / assistant.
      expect(ov).toMatch(/do NOT teach/i);
      expect(ov).toMatch(/NOT an AI/i);
    });

    it('is deterministic per lesson (same lesson → same persona name)', () => {
      expect(prospectName(lesson)).toBe(prospectName(lesson));
    });

    it('carries the difficulty prompt when given', () => {
      expect(buildProspectOverlay(lesson, 'busy and skeptical')).toContain('busy and skeptical');
    });
  });
});
