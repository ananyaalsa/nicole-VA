import { describe, it, expect } from 'vitest';
import { computeSignals, type ResultLine } from './scoreJudge.js';

describe('computeSignals', () => {
  it('computes talk ratio, question count, and longest monologue', () => {
    const lines: ResultLine[] = [
      { speaker: 'rep', text: 'So what brings you in today?' },
      { speaker: 'you', text: 'I wanted to ask about your pricing and whether it scales?' },
      { speaker: 'rep', text: 'It does.' },
      { speaker: 'you', text: 'Great. What does the onboarding look like, step by step, in detail?' },
    ];
    const s = computeSignals(lines);
    // user words: 11 + 12 = 23; rep words: 6 + 2 = 8; ratio = 23/31 = 74%
    expect(s.talkRatioPct).toBe(74);
    expect(s.questionCount).toBe(2); // two user turns end with '?'
    expect(s.longestMonologueWords).toBe(12);
  });

  it('is safe on empty input', () => {
    const s = computeSignals([]);
    expect(s).toEqual({ talkRatioPct: 0, questionCount: 0, longestMonologueWords: 0 });
  });
});
