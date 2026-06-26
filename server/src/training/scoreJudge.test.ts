import { describe, it, expect } from 'vitest';
import {
  computeSignals,
  dimBand,
  overallBand,
  parseJudge,
  fallbackScorecard,
  buildJudgePrompt,
  type ResultLine,
  type DimensionInput,
  type Signals,
} from './scoreJudge.js';

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

const DIMS: DimensionInput[] = [
  { id: 'ack', label: 'Acknowledge', rubric: 'Did they acknowledge the concern?' },
  { id: 'advance', label: 'Advance', rubric: 'Did they secure a next step?' },
];
const SIG: Signals = { talkRatioPct: 55, questionCount: 3, longestMonologueWords: 18 };

describe('banding', () => {
  it('maps dimension scores to bands', () => {
    expect(dimBand(0)).toBe('missing');
    expect(dimBand(1)).toBe('emerging');
    expect(dimBand(2)).toBe('proficient');
    expect(dimBand(3)).toBe('strong');
  });
  it('maps overall 0-10 to four bands', () => {
    expect(overallBand(2)).toBe('needs_work');
    expect(overallBand(5)).toBe('developing');
    expect(overallBand(7.5)).toBe('proficient');
    expect(overallBand(9)).toBe('strong');
  });
});

describe('parseJudge', () => {
  it('parses a well-formed judge reply and averages to 0-10', () => {
    const reply = JSON.stringify({
      scores: [
        { dimensionId: 'ack', score: 3, rationale: 'Restated it well', evidenceQuote: 'I hear you on cost' },
        { dimensionId: 'advance', score: 1, rationale: 'No clear next step', evidenceQuote: null },
      ],
      headline: 'Strong rapport, weak close.',
      worked: { note: 'Good acknowledgement', quote: 'I hear you on cost' },
      fix: { note: 'Ask for the next step', quote: null, why: 'Deals stall without an advance' },
      nextTime: 'End with: can we book 20 minutes Thursday?',
      spoken: 'Nice acknowledgement. Next time, lock a next step.',
    });
    const sc = parseJudge(reply, DIMS, SIG)!;
    expect(sc).not.toBeNull();
    // (3 + 1) of 6 -> 4/6*10 = 6.7
    expect(sc.overallScore).toBe(6.7);
    expect(sc.band).toBe('developing');
    expect(sc.scores[0].band).toBe('strong');
    expect(sc.scores[1].evidenceQuote).toBeNull();
    expect(sc.signals).toEqual(SIG);
  });

  it('returns null on unparseable reply', () => {
    expect(parseJudge('not json at all', DIMS, SIG)).toBeNull();
  });

  it('defaults an omitted dimension to score 0', () => {
    const reply = JSON.stringify({
      scores: [{ dimensionId: 'ack', score: 3, rationale: 'Good', evidenceQuote: null }],
      headline: 'h', worked: { note: 'w', quote: null },
      fix: { note: 'f', quote: null, why: '' }, nextTime: 'n', spoken: 's',
    });
    const sc = parseJudge(reply, DIMS, SIG)!;
    expect(sc.scores[1].score).toBe(0);        // 'advance' was omitted by the judge
    expect(sc.scores[1].band).toBe('missing');
    expect(sc.overallScore).toBe(5.0);         // (3+0)/6*10 = 5.0
  });
});

describe('fallbackScorecard', () => {
  it('is honest and never crashes', () => {
    const sc = fallbackScorecard(DIMS, SIG);
    expect(sc.scores).toHaveLength(2);
    expect(sc.signals).toEqual(SIG);
    expect(sc.spoken.length).toBeGreaterThan(0);
  });
});

describe('buildJudgePrompt', () => {
  it('embeds the rubric, bands, signals and a labeled transcript', () => {
    const p = buildJudgePrompt({
      kind: 'training',
      dims: DIMS,
      transcript: [
        { speaker: 'you', text: 'Hi there' },
        { speaker: 'rep', text: 'What do you want?' },
      ],
      signals: SIG,
    });
    expect(p).toContain('Acknowledge'); // dimension label
    expect(p).toContain('Did they acknowledge the concern?'); // rubric
    expect(p).toContain('0-3'); // band scale instruction
    expect(p).toContain('evidenceQuote'); // required field
    expect(p).toContain('TRAINEE: Hi there'); // labeled user line
    expect(p).toContain('PROSPECT: What do you want?'); // labeled rep line
    expect(p).toContain('55%'); // talk ratio signal
  });
});
