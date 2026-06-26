import { extractJson } from './specGenerator.js';

export type ResultSpeaker = 'you' | 'rep' | 'nicole';
export interface ResultLine { speaker: ResultSpeaker; text: string }

export interface Signals {
  talkRatioPct: number;          // user words / (user + rep words), 0-100
  questionCount: number;          // user turns ending in '?'
  longestMonologueWords: number;  // longest single user turn, in words
}

export interface DimensionInput {
  id: string;
  label: string;
  rubric: string;
}

export interface DimScore {
  dimensionId: string;
  label: string;
  score: 0 | 1 | 2 | 3;
  band: 'missing' | 'emerging' | 'proficient' | 'strong';
  rationale: string;
  evidenceQuote: string | null;
}

export interface Scorecard {
  overallScore: number; // 0-10, 1dp
  band: 'needs_work' | 'developing' | 'proficient' | 'strong';
  scores: DimScore[];
  signals: Signals;
  headline: string;
  worked: { note: string; quote: string | null };
  fix: { note: string; quote: string | null; why: string };
  nextTime: string;
  spoken: string;
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Deterministic conversation signals over a scored transcript. Coach ('nicole')
 *  lines are ignored — signals describe the user-vs-rep exchange only. */
export function computeSignals(lines: ResultLine[]): Signals {
  let userWords = 0;
  let repWords = 0;
  let questionCount = 0;
  let longestMonologueWords = 0;
  for (const l of lines) {
    if (l.speaker === 'you') {
      const w = wordCount(l.text);
      userWords += w;
      if (w > longestMonologueWords) longestMonologueWords = w;
      if (l.text.trim().endsWith('?')) questionCount += 1;
    } else if (l.speaker === 'rep') {
      repWords += wordCount(l.text);
    }
  }
  const total = userWords + repWords;
  const talkRatioPct = total === 0 ? 0 : Math.round((userWords / total) * 100);
  return { talkRatioPct, questionCount, longestMonologueWords };
}

export function dimBand(score: 0 | 1 | 2 | 3): DimScore['band'] {
  return score >= 3 ? 'strong' : score === 2 ? 'proficient' : score === 1 ? 'emerging' : 'missing';
}

export function overallBand(score: number): Scorecard['band'] {
  if (score >= 9) return 'strong';
  if (score >= 7) return 'proficient';
  if (score >= 4) return 'developing';
  return 'needs_work';
}

function clampScore(n: unknown): 0 | 1 | 2 | 3 {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return (v < 0 ? 0 : v > 3 ? 3 : v) as 0 | 1 | 2 | 3;
}

function str(v: unknown, d = ''): string {
  return typeof v === 'string' ? v : d;
}

function quote(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

/** Parse a judge reply into a full Scorecard, or null if it cannot be parsed.
 *  Aligns returned dimension scores to the REQUESTED dims (order + labels),
 *  defaulting any the judge omitted to score 0. */
export function parseJudge(
  reply: string,
  dims: DimensionInput[],
  signals: Signals,
): Scorecard | null {
  const json = extractJson(reply);
  if (!json) return null;
  let obj: any;
  try {
    obj = JSON.parse(json);
  } catch {
    return null;
  }
  if (!obj || !Array.isArray(obj.scores)) return null;

  const byId = new Map<string, any>();
  for (const s of obj.scores) {
    if (s && typeof s.dimensionId === 'string') byId.set(s.dimensionId, s);
  }

  const scores: DimScore[] = dims.map((d) => {
    const raw = byId.get(d.id) ?? {};
    const score = clampScore(raw.score);
    return {
      dimensionId: d.id,
      label: d.label,
      score,
      band: dimBand(score),
      rationale: str(raw.rationale, 'Not assessed.'),
      evidenceQuote: quote(raw.evidenceQuote),
    };
  });

  const sum = scores.reduce((a, s) => a + s.score, 0);
  const max = dims.length * 3;
  const overallScore = max === 0 ? 0 : Math.round((sum / max) * 100) / 10;

  return {
    overallScore,
    band: overallBand(overallScore),
    scores,
    signals,
    headline: str(obj.headline, 'Here is how that went.'),
    worked: {
      note: str(obj.worked?.note, 'You engaged with the exchange.'),
      quote: quote(obj.worked?.quote),
    },
    fix: {
      note: str(obj.fix?.note, 'Pick one move to tighten next time.'),
      quote: quote(obj.fix?.quote),
      why: str(obj.fix?.why, ''),
    },
    nextTime: str(obj.nextTime, 'Run it again and focus on one move.'),
    spoken: str(obj.spoken, str(obj.headline, 'Here is how that went.')),
  };
}

/** A safe, honest scorecard used when the judge call fails or won't parse.
 *  Deterministic signals are still real; dimension scores are left unassessed. */
export function fallbackScorecard(dims: DimensionInput[], signals: Signals): Scorecard {
  const scores: DimScore[] = dims.map((d) => ({
    dimensionId: d.id,
    label: d.label,
    score: 0,
    band: 'missing',
    rationale: 'Could not grade this run automatically.',
    evidenceQuote: null,
  }));
  return {
    overallScore: 0,
    band: 'needs_work',
    scores,
    signals,
    headline: 'I could not fully grade that run.',
    worked: { note: 'You completed the rep.', quote: null },
    fix: { note: 'Try the rep again so I can score it.', quote: null, why: '' },
    nextTime: 'Run it again with a full back-and-forth.',
    spoken: 'I could not fully grade that one. Let us run it again.',
  };
}
