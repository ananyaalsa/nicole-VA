import { describe, it, expect } from 'vitest';
import { LESSONS } from './lessons';

describe('LESSONS', () => {
  it('has exactly 2 entries', () => {
    expect(LESSONS).toHaveLength(2);
  });

  it('includes the price objection and "tell me about yourself" lessons', () => {
    const titles = LESSONS.map((l) => l.title);
    expect(titles).toContain('Handling the Price Objection');
    expect(titles).toContain("Answering 'Tell Me About Yourself'");
  });

  it.each([0, 1])('lesson %i is well-formed', (i) => {
    const lesson = LESSONS[i];
    // Identity
    expect(lesson.skillId).toBeTruthy();
    expect(lesson.title).toBeTruthy();
    expect(lesson.objective).toBeTruthy();
    // Hook
    expect(lesson.hook).toBeTruthy();
    expect(lesson.hook.length).toBeGreaterThan(5);
    // Framework with >= 3 moves
    expect(lesson.coreFramework.name).toBeTruthy();
    expect(lesson.coreFramework.moves.length).toBeGreaterThanOrEqual(3);
    for (const move of lesson.coreFramework.moves) {
      expect(move.step).toBeTruthy();
      expect(move.intent).toBeTruthy();
      expect(move.keyLine).toBeTruthy();
    }
    // Mnemonic
    expect(lesson.mnemonic).toBeTruthy();
    // >= 1 worked example
    expect(lesson.workedExamples.length).toBeGreaterThanOrEqual(1);
    for (const ex of lesson.workedExamples) {
      expect(['good', 'avoid']).toContain(ex.label);
      expect(ex.dialogue.length).toBeGreaterThan(0);
      expect(ex.whyNotes.length).toBeGreaterThan(0);
    }
    // >= 2 guided practice prompts
    expect(lesson.guidedPracticePrompts.length).toBeGreaterThanOrEqual(2);
    // Expectations present
    expect(lesson.expectations.length).toBeGreaterThan(0);
  });

  it('each lesson has at least one good and the avoid examples are meaningful', () => {
    for (const lesson of LESSONS) {
      const labels = lesson.workedExamples.map((e) => e.label);
      expect(labels).toContain('good');
    }
  });
});
