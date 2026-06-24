import { describe, it, expect } from 'vitest';
import { LESSONS } from './lessons';

describe('LESSONS', () => {
  it('has the four real teaching lessons', () => {
    expect(LESSONS).toHaveLength(4);
  });

  it('includes the real ported sales + interview skills', () => {
    const titles = LESSONS.map((l) => l.title);
    expect(titles).toContain('Opening a Cold Call');
    expect(titles).toContain('Discovery: Ask Before You Pitch');
    expect(titles).toContain('Handling the Price Objection');
    expect(titles).toContain('Answering Behavioral Questions with STAR');
  });

  it('uses the real CHAT frameworks (PIN / ASK / AER / STAR)', () => {
    const frameworks = LESSONS.map((l) => l.coreFramework.name);
    expect(frameworks).toEqual(expect.arrayContaining(['PIN', 'ASK', 'AER', 'STAR']));
  });

  it.each([0, 1, 2, 3])('lesson %i is well-formed', (i) => {
    const lesson = LESSONS[i];
    expect(lesson.skillId).toBeTruthy();
    expect(lesson.title).toBeTruthy();
    expect(lesson.objective).toBeTruthy();
    expect(lesson.hook).toBeTruthy();
    expect(lesson.hook.length).toBeGreaterThan(5);
    expect(lesson.coreFramework.name).toBeTruthy();
    expect(lesson.coreFramework.moves.length).toBeGreaterThanOrEqual(3);
    for (const move of lesson.coreFramework.moves) {
      expect(move.step).toBeTruthy();
      expect(move.intent).toBeTruthy();
      expect(move.keyLine).toBeTruthy();
    }
    expect(lesson.mnemonic).toBeTruthy();
    expect(lesson.workedExamples.length).toBeGreaterThanOrEqual(1);
    for (const ex of lesson.workedExamples) {
      expect(['good', 'avoid']).toContain(ex.label);
      expect(ex.dialogue.length).toBeGreaterThan(0);
      expect(ex.whyNotes.length).toBeGreaterThan(0);
    }
    expect(lesson.guidedPracticePrompts.length).toBeGreaterThanOrEqual(2);
    expect(lesson.expectations.length).toBeGreaterThan(0);
  });

  it('every lesson has a good worked example', () => {
    for (const lesson of LESSONS) {
      const labels = lesson.workedExamples.map((e) => e.label);
      expect(labels).toContain('good');
    }
  });
});
