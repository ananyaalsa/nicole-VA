import { describe, it, expect } from 'vitest';
import { validateTrainingSpec, type TrainingSpec } from './trainingSpec.js';

function validSpec(): TrainingSpec {
  return {
    id: 'custom-test-1',
    type: 'custom',
    skillId: 'handle-objections',
    title: 'Handle Price Objections',
    objective: 'Practice responding to price pushback with confidence.',
    hook: 'Price is rarely the real objection.',
    coreFramework: {
      name: 'ARC',
      moves: [
        { step: 'Acknowledge', intent: 'Show you heard them', keyLine: 'I hear you on price.' },
      ],
    },
    mnemonic: 'ARC',
    workedExamples: [{ label: 'good', dialogue: ['A: ...', 'B: ...'], whyNotes: ['clear'] }],
    guidedPracticePrompts: ['Try handling "it is too expensive".'],
    expectations: ['Stays calm', 'Reframes value'],
    persona: { alias: 'Pat the Prospect', voiceName: 'Charon', personaPrompt: 'A skeptical buyer.' },
    levels: [
      { id: 'l1', label: 'Warmup', difficultyPrompt: 'Be gentle.', advanceScore: 6 },
      { id: 'l2', label: 'Tough', difficultyPrompt: 'Push hard.', advanceScore: 8 },
    ],
  };
}

describe('training/trainingSpec', () => {
  it('a valid spec passes', () => {
    expect(validateTrainingSpec(validSpec())).toEqual({ ok: true });
  });

  it('missing title fails', () => {
    const s = validSpec();
    (s as any).title = '';
    const r = validateTrainingSpec(s);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/title/i);
  });

  it('empty moves fails', () => {
    const s = validSpec();
    s.coreFramework.moves = [];
    const r = validateTrainingSpec(s);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/moves/i);
  });

  it('bad advanceScore (>10) fails', () => {
    const s = validSpec();
    s.levels[0].advanceScore = 11;
    const r = validateTrainingSpec(s);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/advanceScore/i);
  });

  it('0 levels fails', () => {
    const s = validSpec();
    s.levels = [];
    const r = validateTrainingSpec(s);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/levels/i);
  });

  it('non-object fails', () => {
    expect(validateTrainingSpec(null).ok).toBe(false);
  });
});
