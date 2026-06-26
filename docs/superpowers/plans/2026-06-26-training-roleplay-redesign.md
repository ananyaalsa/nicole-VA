# Training & Roleplay Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Training a coach-led, autonomously-progressing lesson with a real practice round and judge-scored feedback; give Roleplay real per-dimension scoring; render both with full-width Talk-style transcripts and dual-speaker results; and make Talk-Nicole aware of what the user just did in the other modes.

**Architecture:** Backend foundation first (LLM-judge scoring route + in-memory live-status marker + training runs saved), then the client training phase engine (app-driven auto-advance ported from the proven chat project), then a shared full-width live room and dual-speaker results screen used by both modes, then cross-mode awareness wiring. Each task is TDD, independently testable, and committed.

**Tech Stack:** Node + TypeScript (server, no framework, plain `http`), React 18 + Vite + TypeScript (web), Vitest (both), `@google/genai` for the non-live judge model, Playwright for UI verification.

## Global Constraints

- Server model for the judge: `config.summarizerModel` (default `gemini-2.5-flash`), via `new GoogleGenAI({ apiKey: config.geminiApiKey })`, `ai.models.generateContent({ model, contents })`. Mirror `server/src/training/specGenerator.ts` exactly (retry-once, `extractJson`).
- Server routes: plain `http` handlers returning JSON via the local `sendJson` helper; auth via `resolveUserId(req)` (JWT `sub` or `config.userId` fallback). CORS headers already in `sendJson`.
- Web tests: `cd web && npx vitest run <file>`; server tests: `cd server && npx vitest run <file>`. Typecheck: `npx tsc --noEmit` in each package. Build: `npm run build`.
- Transcript engine types (`web/src/engine/types.ts`): `Speaker = 'you' | 'nicole'`, `TranscriptLine = { id, speaker, text, streaming? }`. Do NOT change these.
- The scoring/results transcript uses a SEPARATE type: `ResultSpeaker = 'you' | 'rep' | 'nicole'`, `ResultLine = { speaker: ResultSpeaker; text: string }`.
- No em/en dashes in spoken text. Keep existing teal theme + CSS variables (`--accent`, `--surface`, etc.).
- Commit after every task. Never use worktree agents on screen files (per project memory).
- All new copy: sentence case, active voice, plain verbs.

---

## File Structure

**Server (new):**
- `server/src/training/scoreJudge.ts` — pure prompt/parse/signals/fallback helpers + `judgeScorecard()` model call.
- `server/src/session/liveStatus.ts` — in-memory per-user live-status store.

**Server (modified):**
- `server/src/training/routes.ts` — add `POST /api/training/score`.
- `server/src/server.ts` — mount `/api/session` route.
- `server/src/gemini/uiControlTools.ts` — add `training_mark_progress` decl + name.
- `server/src/gemini/relay.ts` — read live-status marker in `buildConfig` (talk mode).
- `server/src/memory/memoryBlock.ts` — render `[LIVE STATUS]` line.

**Web (new):**
- `web/src/training/phaseAdvance.ts` — pure app-driven advance evaluator.
- `web/src/training/scoreApi.ts` — client wrappers for `/api/training/score` + `/api/session/status`.
- `web/src/components/ChatTranscript.tsx` — shared Talk-style bubble list (extracted).
- `web/src/components/LiveRoom.tsx` (+ `.css`) — full-width live room shell.
- `web/src/components/SessionResults.tsx` (+ `.css`) — 3-altitude debrief.
- `web/src/components/DualTranscript.tsx` (+ `.css`) — rep/you/nicole lanes.

**Web (modified):**
- `web/src/engine/useNicoleSession.ts` — add `afterNextModelTurn`.
- `web/src/training/useCoachingSession.ts` — auto-advance, practice, freeze→judge, debrief.
- `web/src/screens/TrainingScreen.tsx` — use LiveRoom + SessionResults.
- `web/src/screens/RoleplayScreen.tsx` — use LiveRoom + SessionResults + judge.
- `web/src/screens/TalkScreen.tsx` — use ChatTranscript; send `[STATUS]` on return.

---

## Task 1: Deterministic scoring signals (pure)

**Files:**
- Create: `server/src/training/scoreJudge.ts`
- Test: `server/src/training/scoreJudge.test.ts`

**Interfaces:**
- Produces: `ResultLine = { speaker: 'you'|'rep'|'nicole'; text: string }`; `Signals = { talkRatioPct: number; questionCount: number; longestMonologueWords: number }`; `computeSignals(lines: ResultLine[]): Signals`.

- [ ] **Step 1: Write the failing test**

```ts
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
    // user words: 10 + 12 = 22; rep words: 6 + 2 = 8; ratio = 22/30 = 73%
    expect(s.talkRatioPct).toBe(73);
    expect(s.questionCount).toBe(2); // two user turns end with '?'
    expect(s.longestMonologueWords).toBe(12);
  });

  it('is safe on empty input', () => {
    const s = computeSignals([]);
    expect(s).toEqual({ talkRatioPct: 0, questionCount: 0, longestMonologueWords: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/training/scoreJudge.test.ts`
Expected: FAIL ("computeSignals is not a function" / module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// server/src/training/scoreJudge.ts
export type ResultSpeaker = 'you' | 'rep' | 'nicole';
export interface ResultLine { speaker: ResultSpeaker; text: string }

export interface Signals {
  talkRatioPct: number;          // user words / (user + rep words), 0-100
  questionCount: number;          // user turns ending in '?'
  longestMonologueWords: number;  // longest single user turn, in words
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/training/scoreJudge.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/training/scoreJudge.ts server/src/training/scoreJudge.test.ts
git commit -m "feat(server): deterministic conversation signals for scoring"
```

---

## Task 2: Score banding + judge JSON parse + fallback (pure)

**Files:**
- Modify: `server/src/training/scoreJudge.ts`
- Test: `server/src/training/scoreJudge.test.ts`

**Interfaces:**
- Consumes: `Signals`, `ResultLine` (Task 1).
- Produces:
  - `DimensionInput = { id: string; label: string; rubric: string }`
  - `DimScore = { dimensionId: string; label: string; score: 0|1|2|3; band: 'missing'|'emerging'|'proficient'|'strong'; rationale: string; evidenceQuote: string | null }`
  - `Scorecard = { overallScore: number; band: 'needs_work'|'developing'|'proficient'|'strong'; scores: DimScore[]; signals: Signals; headline: string; worked: { note: string; quote: string|null }; fix: { note: string; quote: string|null; why: string }; nextTime: string; spoken: string }`
  - `dimBand(score: 0|1|2|3): DimScore['band']`
  - `overallBand(score: number): Scorecard['band']`
  - `parseJudge(reply: string, dims: DimensionInput[], signals: Signals): Scorecard | null`
  - `fallbackScorecard(dims: DimensionInput[], signals: Signals): Scorecard`

- [ ] **Step 1: Write the failing test (append to existing file)**

```ts
import {
  dimBand, overallBand, parseJudge, fallbackScorecard,
  type DimensionInput, type Signals,
} from './scoreJudge.js';

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
});

describe('fallbackScorecard', () => {
  it('is honest and never crashes', () => {
    const sc = fallbackScorecard(DIMS, SIG);
    expect(sc.scores).toHaveLength(2);
    expect(sc.signals).toEqual(SIG);
    expect(sc.spoken.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/training/scoreJudge.test.ts`
Expected: FAIL (banding/parseJudge/fallback not exported).

- [ ] **Step 3: Write minimal implementation (append to `scoreJudge.ts`)**

```ts
export interface DimensionInput { id: string; label: string; rubric: string }

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
  return (v < 0 ? 0 : v > 3 ? 3 : v) as 0 | 1 | 2 | 3;
}

function str(v: unknown, d = ''): string { return typeof v === 'string' ? v : d; }
function quote(v: unknown): string | null { return typeof v === 'string' && v.trim() ? v : null; }

// Reuse the JSON extractor from the spec generator (DRY — one source of truth).
// FIRST export it there: in server/src/training/specGenerator.ts change
// `export function extractJson` is ALREADY exported, so just import it here.
import { extractJson } from './specGenerator.js';

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
  try { obj = JSON.parse(json); } catch { return null; }
  if (!obj || !Array.isArray(obj.scores)) return null;

  const byId = new Map<string, any>();
  for (const s of obj.scores) if (s && typeof s.dimensionId === 'string') byId.set(s.dimensionId, s);

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/training/scoreJudge.test.ts`
Expected: PASS (all groups).

- [ ] **Step 5: Commit**

```bash
git add server/src/training/scoreJudge.ts server/src/training/scoreJudge.test.ts
git commit -m "feat(server): scorecard banding, judge parse, and safe fallback"
```

---

## Task 3: Judge prompt builder + model call

**Files:**
- Modify: `server/src/training/scoreJudge.ts`
- Test: `server/src/training/scoreJudge.test.ts`

**Interfaces:**
- Consumes: `ResultLine`, `DimensionInput`, `Signals`, `Scorecard`, `parseJudge`, `fallbackScorecard`, `computeSignals` (Tasks 1-2).
- Produces:
  - `buildJudgePrompt(args: { kind: 'training'|'roleplay'; dims: DimensionInput[]; transcript: ResultLine[]; signals: Signals }): string`
  - `judgeScorecard(args: { kind: 'training'|'roleplay'; dims: DimensionInput[]; transcript: ResultLine[] }): Promise<Scorecard>`

- [ ] **Step 1: Write the failing test for the prompt builder (append)**

```ts
import { buildJudgePrompt } from './scoreJudge.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/training/scoreJudge.test.ts`
Expected: FAIL (`buildJudgePrompt` not exported).

- [ ] **Step 3: Implement the prompt builder + model call (append)**

```ts
import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';

const LABEL: Record<ResultSpeaker, string> = { you: 'TRAINEE', rep: 'PROSPECT', nicole: 'COACH' };

export function buildJudgePrompt(args: {
  kind: 'training' | 'roleplay';
  dims: DimensionInput[];
  transcript: ResultLine[];
  signals: Signals;
}): string {
  const { dims, transcript, signals } = args;
  const rubricLines = dims.map((d) => `- ${d.id} "${d.label}": ${d.rubric}`).join('\n');
  const convo = transcript
    .slice(-60)
    .map((l) => `${LABEL[l.speaker]}: ${l.text}`)
    .join('\n');
  return [
    'You are a strict but fair communication coach grading ONE practice conversation.',
    'Score EACH dimension 0-3 using these bands:',
    '0 = missing (move not attempted or done wrong), 1 = emerging (attempted, weak),',
    '2 = proficient (done competently), 3 = strong (done excellently).',
    '',
    'DIMENSIONS TO SCORE (use these exact dimensionId values):',
    rubricLines,
    '',
    'RULES:',
    '- Reason briefly BEFORE scoring each dimension.',
    '- For every dimension include a VERBATIM short quote from the trainee that justifies',
    '  the score in "evidenceQuote"; if there is no evidence, set evidenceQuote to null.',
    '- Do NOT reward mere length or talking a lot. Score the MOVES, not the word count.',
    '- Be honest: a thin rep gets low scores.',
    '',
    'DETERMINISTIC SIGNALS (already computed — reference them, do not recompute):',
    `talk ratio ${signals.talkRatioPct}% (ideal ~45-57%), questions asked ${signals.questionCount}, longest monologue ${signals.longestMonologueWords} words.`,
    '',
    'TRANSCRIPT (most recent 60 turns):',
    convo || '(no conversation captured)',
    '',
    'Return ONLY a JSON object (optionally fenced in ```json) with EXACTLY:',
    '{ "scores": [ { "dimensionId": string, "score": 0-3, "rationale": string, "evidenceQuote": string|null } ],',
    '  "headline": string (one honest behavior-based line),',
    '  "worked": { "note": string, "quote": string|null } (genuine process praise; if nothing worked, say so honestly),',
    '  "fix": { "note": string, "quote": string|null, "why": string } (the ONE highest-leverage fix),',
    '  "nextTime": string (one rehearsable line they can say next rep),',
    '  "spoken": string (<= 3 short sentences the coach will SAY out loud: the headline + the one fix) }',
    'No prose outside the JSON.',
  ].join('\n');
}

/** Grade a transcript with the non-live text model. Always resolves to a
 *  Scorecard (falls back safely on any error). */
export async function judgeScorecard(args: {
  kind: 'training' | 'roleplay';
  dims: DimensionInput[];
  transcript: ResultLine[];
}): Promise<Scorecard> {
  const signals = computeSignals(args.transcript);
  const dims = args.dims;
  if (dims.length === 0 || args.transcript.length === 0) {
    return fallbackScorecard(dims, signals);
  }
  const prompt = buildJudgePrompt({ ...args, signals });
  try {
    const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
    const ask = async (p: string) => {
      const r = await ai.models.generateContent({ model: config.summarizerModel, contents: p });
      return r.text ?? '';
    };
    let reply = await ask(prompt);
    let sc = parseJudge(reply, dims, signals);
    if (sc) return sc;
    // Retry once demanding valid JSON.
    reply = await ask(prompt + '\n\nYour previous reply was not valid JSON. Return ONLY the JSON object.');
    sc = parseJudge(reply, dims, signals);
    return sc ?? fallbackScorecard(dims, signals);
  } catch {
    return fallbackScorecard(dims, signals);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/training/scoreJudge.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

```bash
git add server/src/training/scoreJudge.ts server/src/training/scoreJudge.test.ts
git commit -m "feat(server): LLM-judge prompt builder and judgeScorecard call"
```

---

## Task 4: `POST /api/training/score` route

**Files:**
- Modify: `server/src/training/routes.ts`
- Test: `server/src/training/routes.score.test.ts`

**Interfaces:**
- Consumes: `judgeScorecard`, `DimensionInput`, `ResultLine`, `Scorecard` (Task 3).
- Produces: route `POST /api/training/score` accepting `{ kind, dimensions, transcript }` and returning `{ scorecard: Scorecard }`. Injectable judge via an exported `setScoreJudge(fn)` test seam.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { handleTrainingRoute, setScoreJudge } from './routes.js';

function mockReqRes(method: string, path: string, body?: unknown) {
  const req = new IncomingMessage(new Socket());
  req.method = method;
  req.url = path;
  req.headers = {};
  const res = new ServerResponse(req);
  let status = 0;
  const chunks: string[] = [];
  // @ts-expect-error capture
  res.writeHead = (s: number) => { status = s; return res; };
  // @ts-expect-error capture
  res.end = (c?: string) => { if (c) chunks.push(c); };
  // feed the body asynchronously
  if (body !== undefined) {
    process.nextTick(() => {
      req.emit('data', JSON.stringify(body));
      req.emit('end');
    });
  } else {
    process.nextTick(() => req.emit('end'));
  }
  return { req, res, get status() { return status; }, get body() { return chunks.join(''); } };
}

describe('POST /api/training/score', () => {
  beforeEach(() => {
    setScoreJudge(async ({ dimensions }) => ({
      overallScore: 6.7, band: 'developing',
      scores: dimensions.map((d) => ({ dimensionId: d.id, label: d.label, score: 2, band: 'proficient', rationale: 'ok', evidenceQuote: null })),
      signals: { talkRatioPct: 50, questionCount: 1, longestMonologueWords: 10 },
      headline: 'Good rep.', worked: { note: 'w', quote: null }, fix: { note: 'f', quote: null, why: '' },
      nextTime: 'n', spoken: 's',
    }));
  });

  it('returns a scorecard for a valid request', async () => {
    const m = mockReqRes('POST', '/api/training/score', {
      kind: 'training',
      dimensions: [{ id: 'ack', label: 'Acknowledge', rubric: 'r' }],
      transcript: [{ speaker: 'you', text: 'hi' }],
    });
    const matched = await handleTrainingRoute(m.req, m.res);
    expect(matched).toBe(true);
    const json = JSON.parse(m.body);
    expect(json.scorecard.overallScore).toBe(6.7);
    expect(json.scorecard.scores[0].dimensionId).toBe('ack');
  });

  it('400s when dimensions or transcript are missing', async () => {
    const m = mockReqRes('POST', '/api/training/score', { kind: 'training' });
    await handleTrainingRoute(m.req, m.res);
    expect(m.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/training/routes.score.test.ts`
Expected: FAIL (`setScoreJudge` not exported; route not handled).

- [ ] **Step 3: Implement the route + test seam**

In `server/src/training/routes.ts`, add near the imports:

```ts
import { judgeScorecard, type DimensionInput, type ResultLine, type Scorecard } from './scoreJudge.js';

// Test seam: allow tests to inject a fake judge so they don't hit the model.
type JudgeFn = (args: { kind: 'training' | 'roleplay'; dimensions: DimensionInput[]; transcript: ResultLine[] }) => Promise<Scorecard>;
let scoreJudge: JudgeFn = ({ kind, dimensions, transcript }) =>
  judgeScorecard({ kind, dims: dimensions, transcript });
export function setScoreJudge(fn: JudgeFn): void { scoreJudge = fn; }
```

Then add this block inside `handleTrainingRoute`, immediately AFTER the `/api/training/generate` block (before the `/api/training/history` block):

```ts
  // POST /api/training/score  — grade a finished practice/roleplay transcript.
  if (url.pathname === '/api/training/score' && req.method === 'POST') {
    const body = await readBody(req);
    const dimensions = Array.isArray(body.dimensions) ? body.dimensions : null;
    const transcript = Array.isArray(body.transcript) ? body.transcript : null;
    if (!dimensions || !transcript) {
      sendJson(res, 400, { error: 'dimensions and transcript are required' });
      return true;
    }
    const kind = body.kind === 'roleplay' ? 'roleplay' : 'training';
    const scorecard = await scoreJudge({ kind, dimensions, transcript });
    sendJson(res, 200, { scorecard });
    return true;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/training/routes.score.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + full server tests + commit**

Run: `cd server && npx tsc --noEmit && npx vitest run`
Expected: all green (existing 154 + new).

```bash
git add server/src/training/routes.ts server/src/training/routes.score.test.ts
git commit -m "feat(server): POST /api/training/score grading route"
```

---

## Task 5: In-memory live-status store

**Files:**
- Create: `server/src/session/liveStatus.ts`
- Test: `server/src/session/liveStatus.test.ts`

**Interfaces:**
- Produces:
  - `LiveStatus = { mode: 'training'|'roleplay'; state: 'entered'|'active'|'finished'; skill?: string; startedAt: number; finishedAt?: number; score?: number }`
  - `setLiveStatus(userId: string, s: LiveStatus): void`
  - `getLiveStatus(userId: string): LiveStatus | null`
  - `formatLiveStatusLine(s: LiveStatus, nowMs: number): string | null` — human line for the memory block, or null if stale (>15 min) / irrelevant.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { setLiveStatus, getLiveStatus, formatLiveStatusLine } from './liveStatus.js';

describe('liveStatus store', () => {
  it('stores and reads per-user status', () => {
    setLiveStatus('u1', { mode: 'training', state: 'active', skill: 'Cold-call open', startedAt: 1000 });
    expect(getLiveStatus('u1')?.skill).toBe('Cold-call open');
    expect(getLiveStatus('u2')).toBeNull();
  });
});

describe('formatLiveStatusLine', () => {
  const now = 600_000;
  it('describes an active drill', () => {
    const line = formatLiveStatusLine({ mode: 'training', state: 'active', skill: 'Cold-call open', startedAt: now - 180_000 }, now);
    expect(line).toContain('currently in a Training drill');
    expect(line).toContain('Cold-call open');
  });
  it('describes a just-finished roleplay with score', () => {
    const line = formatLiveStatusLine({ mode: 'roleplay', state: 'finished', skill: 'Pricing call', startedAt: now - 300_000, finishedAt: now - 60_000, score: 6.4 }, now);
    expect(line).toContain('just finished a Roleplay');
    expect(line).toContain('6.4');
  });
  it('describes entered-but-not-started', () => {
    const line = formatLiveStatusLine({ mode: 'training', state: 'entered', startedAt: now - 5000 }, now);
    expect(line).toContain("hasn't started");
  });
  it('returns null when stale (>15 min)', () => {
    expect(formatLiveStatusLine({ mode: 'training', state: 'active', startedAt: now - 16 * 60_000 }, now)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/session/liveStatus.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// server/src/session/liveStatus.ts
export interface LiveStatus {
  mode: 'training' | 'roleplay';
  state: 'entered' | 'active' | 'finished';
  skill?: string;
  startedAt: number;       // epoch ms
  finishedAt?: number;
  score?: number;
}

const STORE = new Map<string, LiveStatus>();
const STALE_MS = 15 * 60 * 1000;

export function setLiveStatus(userId: string, s: LiveStatus): void {
  STORE.set(userId, s);
}
export function getLiveStatus(userId: string): LiveStatus | null {
  return STORE.get(userId) ?? null;
}

function minutesAgo(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  return m <= 0 ? 'just now' : `${m} min ago`;
}

/** A factual one-liner for Talk-Nicole's memory block, or null if too old to
 *  matter. `nowMs` is injected so this stays pure/testable. */
export function formatLiveStatusLine(s: LiveStatus, nowMs: number): string | null {
  const ref = s.finishedAt ?? s.startedAt;
  if (nowMs - ref > STALE_MS) return null;
  const modeLabel = s.mode === 'training' ? 'Training' : 'Roleplay';
  const skill = s.skill ? ` (${s.skill})` : '';
  if (s.state === 'active') {
    return `User is currently in a ${modeLabel} ${s.mode === 'training' ? 'drill' : 'rep'}${skill}, started ${minutesAgo(nowMs - s.startedAt)}.`;
  }
  if (s.state === 'finished') {
    const score = typeof s.score === 'number' ? ` — scored ${s.score.toFixed(1)}/10` : '';
    return `User just finished a ${modeLabel}${skill} ${minutesAgo(nowMs - (s.finishedAt ?? s.startedAt))}${score}.`;
  }
  // entered
  return `User opened ${modeLabel} a moment ago but hasn't started ${s.mode === 'training' ? 'a drill' : 'a rep'} yet.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/session/liveStatus.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/session/liveStatus.ts server/src/session/liveStatus.test.ts
git commit -m "feat(server): in-memory live-status store + status line formatter"
```

---

## Task 6: `POST /api/session/status` route + mount

**Files:**
- Create: `server/src/session/routes.ts`
- Modify: `server/src/server.ts`
- Test: `server/src/session/routes.test.ts`

**Interfaces:**
- Consumes: `setLiveStatus`, `getLiveStatus`, `LiveStatus` (Task 5).
- Produces: `handleSessionRoute(req, res): Promise<boolean>` handling `POST /api/session/status` (upsert current user's status) and `GET /api/session/status` (read it).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { handleSessionRoute } from './routes.js';

function mockReqRes(method: string, path: string, body?: unknown) {
  const req = new IncomingMessage(new Socket());
  req.method = method; req.url = path; req.headers = {};
  const res = new ServerResponse(req);
  let status = 0; const chunks: string[] = [];
  // @ts-expect-error
  res.writeHead = (s: number) => { status = s; return res; };
  // @ts-expect-error
  res.end = (c?: string) => { if (c) chunks.push(c); };
  process.nextTick(() => {
    if (body !== undefined) req.emit('data', JSON.stringify(body));
    req.emit('end');
  });
  return { req, res, get status() { return status; }, get body() { return chunks.join(''); } };
}

describe('/api/session/status', () => {
  it('upserts then reads the status for the default user', async () => {
    const post = mockReqRes('POST', '/api/session/status', { mode: 'training', state: 'active', skill: 'Cold-call open', startedAt: 1234 });
    expect(await handleSessionRoute(post.req, post.res)).toBe(true);
    expect(JSON.parse(post.body).ok).toBe(true);

    const get = mockReqRes('GET', '/api/session/status');
    await handleSessionRoute(get.req, get.res);
    expect(JSON.parse(get.body).status.skill).toBe('Cold-call open');
  });

  it('ignores non-session paths', async () => {
    const m = mockReqRes('GET', '/api/other');
    expect(await handleSessionRoute(m.req, m.res)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/session/routes.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the route**

```ts
// server/src/session/routes.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { JWT_SECRET } from '../auth/middleware.js';
import { setLiveStatus, getLiveStatus, type LiveStatus } from './liveStatus.js';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': config.frontendUrl,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(JSON.stringify(body));
}

function resolveUserId(req: IncomingMessage): string {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return config.userId;
  try { return (jwt.verify(token, JWT_SECRET) as { sub: string }).sub; } catch { return config.userId; }
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

export async function handleSessionRoute(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/session')) return false;
  const userId = resolveUserId(req);

  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return true; }

  if (url.pathname === '/api/session/status') {
    if (req.method === 'POST') {
      const b = await readBody(req);
      const mode = b.mode === 'roleplay' ? 'roleplay' : 'training';
      const state = ['entered', 'active', 'finished'].includes(b.state) ? b.state : 'entered';
      const status: LiveStatus = {
        mode,
        state,
        skill: typeof b.skill === 'string' ? b.skill : undefined,
        startedAt: typeof b.startedAt === 'number' ? b.startedAt : Date.now(),
        finishedAt: typeof b.finishedAt === 'number' ? b.finishedAt : undefined,
        score: typeof b.score === 'number' ? b.score : undefined,
      };
      setLiveStatus(userId, status);
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (req.method === 'GET') {
      sendJson(res, 200, { status: getLiveStatus(userId) });
      return true;
    }
  }
  sendJson(res, 405, { error: 'method not allowed' });
  return true;
}
```

In `server/src/server.ts`, add the import next to the other route imports:

```ts
import { handleSessionRoute } from './session/routes.js';
```

And add this block immediately AFTER the `/api/training` block (before `/api/integrations`):

```ts
  if (url.pathname.startsWith('/api/session')) {
    void handleSessionRoute(req, res).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    });
    return;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/session/routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `cd server && npx tsc --noEmit`

```bash
git add server/src/session/routes.ts server/src/server.ts server/src/session/routes.test.ts
git commit -m "feat(server): POST/GET /api/session/status route"
```

---

## Task 7: Inject `[LIVE STATUS]` into Talk-Nicole's memory block

**Files:**
- Modify: `server/src/memory/memoryBlock.ts`
- Modify: `server/src/gemini/relay.ts`
- Test: `server/src/memory/memoryBlock.test.ts` (extend)

**Interfaces:**
- Consumes: `formatLiveStatusLine`, `getLiveStatus` (Task 5).
- Produces: `formatMemoryBlock` accepts a new optional `extras.liveStatusLine?: string` rendered under a `[LIVE STATUS]` header.

- [ ] **Step 1: Write the failing test (extend existing memoryBlock.test.ts)**

```ts
it('renders a [LIVE STATUS] line when provided', () => {
  const block = formatMemoryBlock([], { liveStatusLine: 'User just finished a Roleplay (Pricing call) 1 min ago — scored 6.4/10.' });
  expect(block).toContain('[LIVE STATUS]');
  expect(block).toContain('just finished a Roleplay');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/memory/memoryBlock.test.ts`
Expected: FAIL (no `[LIVE STATUS]` rendered).

- [ ] **Step 3: Implement in `memoryBlock.ts`**

Find the `extras` parameter type of `formatMemoryBlock` and add `liveStatusLine?: string`. Then, where the blocks are assembled (after `[RECENT ACTIVITY]`), add:

```ts
  if (extras?.liveStatusLine) {
    parts.push(`[LIVE STATUS]\n${extras.liveStatusLine}`);
  }
```

(Use the existing `parts`/join pattern in that function; match its exact local variable name.)

- [ ] **Step 4: Wire it in `relay.ts` `buildConfig` (talk mode only)**

Add imports at the top of `relay.ts`:

```ts
import { getLiveStatus, formatLiveStatusLine } from '../session/liveStatus.js';
```

In `buildConfig`, inside the `if (cfg.mode === 'talk') { ... }` block (right after the activity digest is loaded), add:

```ts
        const ls = getLiveStatus(this.deps.userId);
        if (ls) liveStatusLine = formatLiveStatusLine(ls, this.now()) ?? undefined;
```

Declare `let liveStatusLine: string | undefined;` just above the `if (cfg.mode === 'talk')` block, and pass it into `formatMemoryBlock(facts as any, { activityLines, liveStatusLine })`.

- [ ] **Step 5: Run tests + typecheck**

Run: `cd server && npx vitest run src/memory/memoryBlock.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Add the prompt note**

In `server/src/prompt/nicolePrompt.ts`, in the `## MEMORY — TWO KINDS OF KNOWLEDGE` section where `[RECENT ACTIVITY]` is described, add one line:

```
- [LIVE STATUS] is what the user is doing RIGHT NOW or just did. If it says they just finished a drill or roleplay, ask how it went — do NOT offer to start training/roleplay they already did. If they are mid-drill, do not pull them out of it.
```

- [ ] **Step 7: Commit**

```bash
git add server/src/memory/memoryBlock.ts server/src/gemini/relay.ts server/src/memory/memoryBlock.test.ts server/src/prompt/nicolePrompt.ts
git commit -m "feat(server): inject [LIVE STATUS] into Talk-Nicole context"
```

---

## Task 8: Declare `training_mark_progress` to Gemini

**Files:**
- Modify: `server/src/gemini/uiControlTools.ts`
- Modify: `server/src/gemini/relay.ts`
- Test: `server/src/gemini/relay.test.ts` (extend)

**Interfaces:**
- Produces: a `TRAINING_TOOL_DECLS: ToolDecl[]` export with `training_mark_progress({ dimension: string, hit: boolean, tip: string })`, added to the relay's `functionDeclarations`. The relay already acks it (line ~343).

- [ ] **Step 1: Write the failing test (extend relay.test.ts)**

```ts
it('declares training_mark_progress to Gemini', async () => {
  // buildConfig is private; assert via the declarations export instead.
  const { TRAINING_TOOL_DECLS } = await import('./uiControlTools.js');
  expect(TRAINING_TOOL_DECLS.some((d) => d.name === 'training_mark_progress')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/gemini/relay.test.ts`
Expected: FAIL (`TRAINING_TOOL_DECLS` undefined).

- [ ] **Step 3: Implement in `uiControlTools.ts`** (append after `UI_CONTROL_TOOL_DECLS`)

```ts
/** Training-only: Nicole silently marks a framework move hit/missed during
 *  guided practice. Acked server-side; the BROWSER lights the live scorecard. */
export const TRAINING_TOOL_DECLS: ToolDecl[] = [
  {
    name: 'training_mark_progress',
    description:
      'SILENTLY record how the learner did on a framework move during guided ' +
      'practice. Call it once per attempt. Never say out loud that you are scoring.',
    parameters: {
      type: 'object',
      properties: {
        dimension: { type: 'string', description: 'The framework move being attempted, e.g. "Acknowledge".' },
        hit: { type: 'boolean', description: 'true if they performed the move well.' },
        tip: { type: 'string', description: 'A short, specific tip for this attempt.' },
      },
      required: ['dimension', 'hit', 'tip'],
    },
  },
];
```

- [ ] **Step 4: Add to relay declarations**

In `relay.ts`, import `TRAINING_TOOL_DECLS` alongside `UI_CONTROL_TOOL_DECLS`, and add `...TRAINING_TOOL_DECLS,` to the `functionDeclarations` array in `buildConfig`.

- [ ] **Step 5: Run tests + typecheck + commit**

Run: `cd server && npx vitest run src/gemini/relay.test.ts && npx tsc --noEmit`

```bash
git add server/src/gemini/uiControlTools.ts server/src/gemini/relay.ts server/src/gemini/relay.test.ts
git commit -m "feat(server): declare training_mark_progress tool to Gemini"
```

---

## Task 9: Pure app-driven phase-advance evaluator

**Files:**
- Create: `web/src/training/phaseAdvance.ts`
- Test: `web/src/training/phaseAdvance.test.ts`

**Interfaces:**
- Consumes: `Phase` from `./phaseMachine`.
- Produces:
  - `AdvanceSignals = { turns: number; litDelta: number; timeInPhaseMs: number }`
  - `shouldAdvancePhase(phase: Phase, signals: AdvanceSignals): boolean`
  - `AUTO_PHASES: Phase[]` = `['intro','teach','model','guided_practice']`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/training/phaseAdvance.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement (numbers mirror the chat project)**

```ts
// web/src/training/phaseAdvance.ts
import type { Phase } from './phaseMachine';

export interface AdvanceSignals {
  turns: number;          // substantive user turns in this phase
  litDelta: number;       // scorecard dimensions newly lit this phase
  timeInPhaseMs: number;  // wall time since entering this phase
}

interface PhaseCfg { minLitDelta: number; minTurns: number; minPhaseMs: number; maxPhaseMs: number }

const CFG: Record<string, PhaseCfg> = {
  intro:           { minLitDelta: 0, minTurns: 1, minPhaseMs: 6000,  maxPhaseMs: 90000 },
  teach:           { minLitDelta: 1, minTurns: 2, minPhaseMs: 12000, maxPhaseMs: 180000 },
  model:           { minLitDelta: 1, minTurns: 2, minPhaseMs: 12000, maxPhaseMs: 180000 },
  guided_practice: { minLitDelta: 2, minTurns: 2, minPhaseMs: 12000, maxPhaseMs: 180000 },
};

/** The phases the APP advances on its own. Gates (readiness_check, roleplay_demo,
 *  debrief) are user/explicit and never auto-advance. */
export const AUTO_PHASES: Phase[] = ['intro', 'teach', 'model', 'guided_practice'];

/**
 * App-driven advance: a phase is "done" when ANY of
 *   (a) enough scorecard moves lit, (b) the engagement floor (turns past a min
 *   dwell), or (c) a hard time ceiling (so it can never stall — wins even on
 *   silence). Returns false for any non-AUTO phase.
 */
export function shouldAdvancePhase(phase: Phase, s: AdvanceSignals): boolean {
  const cfg = CFG[phase];
  if (!cfg) return false; // gate phase
  if (s.timeInPhaseMs >= cfg.maxPhaseMs) return true;            // (c) ceiling
  if (s.litDelta >= cfg.minLitDelta && cfg.minLitDelta > 0) return true; // (a) scorer
  if (s.turns >= cfg.minTurns && s.timeInPhaseMs >= cfg.minPhaseMs) return true; // (b) floor
  // intro special-case: minLitDelta is 0, so (a) above is skipped; allow the
  // floor with a single turn.
  if (phase === 'intro' && s.turns >= cfg.minTurns && s.timeInPhaseMs >= cfg.minPhaseMs) return true;
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/training/phaseAdvance.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/training/phaseAdvance.ts web/src/training/phaseAdvance.test.ts
git commit -m "feat(web): app-driven phase-advance evaluator"
```

---

## Task 10: `afterNextModelTurn` on the session hook

**Files:**
- Modify: `web/src/engine/useNicoleSession.ts`
- Test: `web/src/engine/useNicoleSession.test.ts` (extend)

**Interfaces:**
- Produces: `UseNicoleSessionResult.afterNextModelTurn(cb: () => void): void` — invokes `cb` once on the next `turnComplete`/`generationComplete`, or immediately if not currently mid-utterance, with an internal 6s safety cap.

- [ ] **Step 1: Write the failing test (extend; uses the existing `emit` helper)**

```ts
it('afterNextModelTurn fires on the next turnComplete', async () => {
  const view = await startSession({ voiceName: 'Aoede', serverWs: 'ws://test/ai-live' });
  let fired = false;
  act(() => {
    // mid-utterance: nicole has streamed text but no turnComplete yet
    emit({ outputTranscription: { text: 'thinking...' } });
    view.result.current.afterNextModelTurn(() => { fired = true; });
  });
  expect(fired).toBe(false);
  act(() => { emit({ turnComplete: true }); });
  expect(fired).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/engine/useNicoleSession.test.ts -t afterNextModelTurn`
Expected: FAIL (`afterNextModelTurn` is not a function).

- [ ] **Step 3: Implement**

In `useNicoleSession.ts`, near the other refs add:

```ts
  // Callbacks waiting for the next completed model turn (used by coaching to
  // avoid cutting Nicole off when pushing the next phase overlay).
  const afterTurnCbsRef = useRef<Array<() => void>>([]);
  const nicoleSpeakingRef = useRef(false);
```

In the message handler, where `sc.outputTranscription?.text` is appended, set `nicoleSpeakingRef.current = true;`. In the `turnComplete` branch (where `finalizeTurnRef.current()` is called) add, after finalizing:

```ts
        nicoleSpeakingRef.current = false;
        const cbs = afterTurnCbsRef.current;
        afterTurnCbsRef.current = [];
        for (const cb of cbs) { try { cb(); } catch { /* ignore */ } }
```

Add the public method:

```ts
  const afterNextModelTurn = useCallback((cb: () => void) => {
    if (!nicoleSpeakingRef.current) { cb(); return; }
    afterTurnCbsRef.current.push(cb);
    // Safety cap: never wait more than 6s.
    setTimeout(() => {
      const i = afterTurnCbsRef.current.indexOf(cb);
      if (i >= 0) { afterTurnCbsRef.current.splice(i, 1); try { cb(); } catch { /* ignore */ } }
    }, 6000);
  }, []);
```

Add `afterNextModelTurn` to the `UseNicoleSessionResult` interface and the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/engine/useNicoleSession.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add web/src/engine/useNicoleSession.ts web/src/engine/useNicoleSession.test.ts
git commit -m "feat(web): afterNextModelTurn to defer overlay sends until Nicole finishes"
```

---

## Task 11: Client score + status API wrappers

**Files:**
- Create: `web/src/training/scoreApi.ts`
- Test: `web/src/training/scoreApi.test.ts`

**Interfaces:**
- Produces:
  - `ResultLine = { speaker: 'you'|'rep'|'nicole'; text: string }`, `DimensionInput = { id; label; rubric }`, `Scorecard` (mirror server shape from Task 2).
  - `requestScore(args: { kind, dimensions, transcript }, token?: string): Promise<Scorecard>`
  - `postLiveStatus(s: { mode; state; skill?; startedAt; finishedAt?; score? }, token?: string): Promise<void>` (best-effort, never throws).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestScore, postLiveStatus } from './scoreApi';

beforeEach(() => { vi.restoreAllMocks(); });

describe('requestScore', () => {
  it('POSTs and returns the scorecard', async () => {
    const sc = { overallScore: 7, band: 'proficient', scores: [], signals: {}, headline: 'h', worked: {}, fix: {}, nextTime: '', spoken: '' };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ scorecard: sc }) })) as any);
    const out = await requestScore({ kind: 'training', dimensions: [], transcript: [] });
    expect(out.overallScore).toBe(7);
  });
});

describe('postLiveStatus', () => {
  it('never throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }) as any);
    await expect(postLiveStatus({ mode: 'training', state: 'entered', startedAt: 1 })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/training/scoreApi.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3a: Export the base URL from `trainingApi.ts`**

`trainingApi.ts` declares its base URL as a module-local `const HTTP_BASE = (import.meta...).env?.VITE_SERVER_HTTP ?? 'http://localhost:4000'`. Make it shared by exporting it — change `const HTTP_BASE =` to `export const HTTP_BASE =` (line ~4). No other change.

- [ ] **Step 3b: Implement `scoreApi.ts`**

```ts
// web/src/training/scoreApi.ts
import { HTTP_BASE } from './trainingApi'; // the shared server base URL (now exported)

export type ResultSpeaker = 'you' | 'rep' | 'nicole';
export interface ResultLine { speaker: ResultSpeaker; text: string }
export interface DimensionInput { id: string; label: string; rubric: string }

export interface DimScore {
  dimensionId: string; label: string; score: 0 | 1 | 2 | 3;
  band: 'missing' | 'emerging' | 'proficient' | 'strong';
  rationale: string; evidenceQuote: string | null;
}
export interface Signals { talkRatioPct: number; questionCount: number; longestMonologueWords: number }
export interface Scorecard {
  overallScore: number; band: 'needs_work' | 'developing' | 'proficient' | 'strong';
  scores: DimScore[]; signals: Signals; headline: string;
  worked: { note: string; quote: string | null };
  fix: { note: string; quote: string | null; why: string };
  nextTime: string; spoken: string;
}

function authHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function requestScore(
  args: { kind: 'training' | 'roleplay'; dimensions: DimensionInput[]; transcript: ResultLine[] },
  token?: string,
): Promise<Scorecard> {
  const res = await fetch(`${API_BASE}/api/training/score`, {
    method: 'POST', headers: authHeaders(token), body: JSON.stringify(args),
  });
  const data = await res.json();
  return data.scorecard as Scorecard;
}

export interface LiveStatusInput {
  mode: 'training' | 'roleplay'; state: 'entered' | 'active' | 'finished';
  skill?: string; startedAt: number; finishedAt?: number; score?: number;
}

/** Best-effort live-status ping. Swallows all errors (it must never block UX). */
export async function postLiveStatus(s: LiveStatusInput, token?: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/session/status`, {
      method: 'POST', headers: authHeaders(token), body: JSON.stringify(s),
    });
  } catch { /* best-effort */ }
}
```

NOTE: If `trainingApi.ts` does not export `API_BASE`, replace the import with the exact same base expression `trainingApi.ts` uses (e.g. `import.meta.env.VITE_API_URL ?? ''`). Verify by reading `trainingApi.ts` first.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/training/scoreApi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/training/scoreApi.ts web/src/training/scoreApi.test.ts
git commit -m "feat(web): score + live-status API client wrappers"
```

---

## Task 12: Shared `ChatTranscript` (Talk-style bubbles)

**Files:**
- Create: `web/src/components/ChatTranscript.tsx`
- Modify: `web/src/screens/TalkScreen.tsx` (use it; no behavior change)
- Test: `web/src/components/ChatTranscript.test.tsx`

**Interfaces:**
- Produces: `ChatTranscript({ lines, realtime, labels })` where `lines: TranscriptLine[]`, `realtime: { you: string; nicole: string }`, `labels?: { you?: string; nicole?: string }` (defaults `You`/`Nicole`). Renders the exact Talk markup: `.chat-bubble.chat-bubble--{user|nicole}` committed bubbles + `.is-streaming` realtime bubbles.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatTranscript } from './ChatTranscript';

describe('ChatTranscript', () => {
  it('renders committed and realtime bubbles with custom labels', () => {
    render(
      <ChatTranscript
        lines={[{ id: '1', speaker: 'you', text: 'hello' }, { id: '2', speaker: 'nicole', text: 'hi' }]}
        realtime={{ you: 'typing', nicole: '' }}
        labels={{ nicole: 'Rep' }}
      />,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
    expect(screen.getByText('typing')).toBeInTheDocument(); // realtime user bubble
    expect(screen.getAllByText('Rep').length).toBeGreaterThan(0); // custom nicole label
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/ChatTranscript.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement (lift the JSX currently in TalkScreen's `.chat-messages`)**

```tsx
// web/src/components/ChatTranscript.tsx
import type { JSX } from 'react';
import type { TranscriptLine } from '../engine/types';

export interface ChatTranscriptProps {
  lines: TranscriptLine[];
  realtime: { you: string; nicole: string };
  labels?: { you?: string; nicole?: string };
}

/** The Talk chat feed, extracted so Talk, Training, and Roleplay render
 *  transcripts identically. Committed bubbles + one live in-progress bubble per
 *  speaker. `labels` overrides the displayed name (e.g. the rep's alias). */
export function ChatTranscript({ lines, realtime, labels }: ChatTranscriptProps): JSX.Element {
  const youLabel = labels?.you ?? 'You';
  const nicoleLabel = labels?.nicole ?? 'Nicole';
  return (
    <div className="chat-messages">
      {lines.map((line) => (
        <div key={line.id} className={`chat-bubble chat-bubble--${line.speaker === 'you' ? 'user' : 'nicole'}`}>
          <span className="chat-who">{line.speaker === 'you' ? youLabel : nicoleLabel}</span>
          <p className="chat-text">{line.text}</p>
        </div>
      ))}
      {realtime.you && (
        <div className="chat-bubble chat-bubble--user is-streaming">
          <span className="chat-who">{youLabel}</span>
          <p className="chat-text">{realtime.you}</p>
        </div>
      )}
      {realtime.nicole && (
        <div className="chat-bubble chat-bubble--nicole is-streaming">
          <span className="chat-who">{nicoleLabel}</span>
          <p className="chat-text">{realtime.nicole}</p>
        </div>
      )}
    </div>
  );
}

export default ChatTranscript;
```

- [ ] **Step 4: Use it in TalkScreen**

In `TalkScreen.tsx`, replace the existing `<div className="chat-messages">…</div>` block (committed map + the two realtime bubbles) with:

```tsx
                <ChatTranscript lines={transcript} realtime={realtime} />
```

Add the import: `import { ChatTranscript } from '../components/ChatTranscript';`

- [ ] **Step 5: Run tests to verify nothing broke**

Run: `cd web && npx vitest run src/components/ChatTranscript.test.tsx src/screens/TalkScreen.test.tsx`
Expected: PASS (Talk still renders its transcript).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/ChatTranscript.tsx web/src/components/ChatTranscript.test.tsx web/src/screens/TalkScreen.tsx
git commit -m "refactor(web): extract shared ChatTranscript from TalkScreen"
```

---

## Task 13: `DualTranscript` (rep / you / nicole lanes)

**Files:**
- Create: `web/src/components/DualTranscript.tsx`, `web/src/components/DualTranscript.css`
- Test: `web/src/components/DualTranscript.test.tsx`

**Interfaces:**
- Consumes: `ResultLine` (Task 11).
- Produces: `DualTranscript({ lines, repLabel })` rendering each line in a speaker-specific lane: `.dual-line--you`, `.dual-line--rep`, `.dual-line--nicole`, each with `data-speaker`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DualTranscript } from './DualTranscript';

describe('DualTranscript', () => {
  it('renders each speaker in its own lane with a data-speaker marker', () => {
    render(
      <DualTranscript
        repLabel="Marcus"
        lines={[
          { speaker: 'rep', text: 'Why should I care?' },
          { speaker: 'you', text: 'Because it saves you time.' },
          { speaker: 'nicole', text: 'Good pivot.' },
        ]}
      />,
    );
    expect(screen.getByText('Why should I care?').closest('[data-speaker="rep"]')).not.toBeNull();
    expect(screen.getByText('Because it saves you time.').closest('[data-speaker="you"]')).not.toBeNull();
    expect(screen.getByText('Good pivot.').closest('[data-speaker="nicole"]')).not.toBeNull();
    expect(screen.getAllByText('Marcus').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/DualTranscript.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// web/src/components/DualTranscript.tsx
import type { JSX } from 'react';
import type { ResultLine } from '../training/scoreApi';
import './DualTranscript.css';

export interface DualTranscriptProps {
  lines: ResultLine[];
  /** Display name for the rep/character lane (defaults to "Rep"). */
  repLabel?: string;
}

const LABEL = { you: 'You', rep: 'Rep', nicole: 'Nicole' } as const;

/** The annotated post-rep transcript: the rep, you, and (in training) Nicole each
 *  in a visually distinct lane — alignment + color + label, never color alone. */
export function DualTranscript({ lines, repLabel }: DualTranscriptProps): JSX.Element {
  return (
    <div className="dual-transcript" data-testid="dual-transcript">
      {lines.map((l, i) => {
        const name = l.speaker === 'rep' ? (repLabel ?? LABEL.rep) : LABEL[l.speaker];
        return (
          <div key={i} className={`dual-line dual-line--${l.speaker}`} data-speaker={l.speaker}>
            <span className="dual-line__who">{name}</span>
            <p className="dual-line__text">{l.text}</p>
          </div>
        );
      })}
    </div>
  );
}

export default DualTranscript;
```

```css
/* web/src/components/DualTranscript.css */
.dual-transcript { display: flex; flex-direction: column; gap: 8px; }
.dual-line { max-width: 78%; padding: 8px 12px; border-radius: var(--radius-md); }
.dual-line__who { display: block; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; opacity: 0.7; margin-bottom: 2px; }
.dual-line__text { margin: 0; line-height: 1.45; }
/* You — right lane, teal */
.dual-line--you { align-self: flex-end; background: var(--accent-light); color: var(--text); }
/* Rep — left lane, amber */
.dual-line--rep { align-self: flex-start; background: #FBEFD8; color: #4A3206; }
/* Nicole (training coaching) — left lane, purple/neutral */
.dual-line--nicole { align-self: flex-start; background: #ECE7F6; color: #2E2350; }
@media (max-width: 640px) { .dual-line { max-width: 92%; } }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/DualTranscript.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/DualTranscript.tsx web/src/components/DualTranscript.css web/src/components/DualTranscript.test.tsx
git commit -m "feat(web): DualTranscript with separate rep/you/nicole lanes"
```

---

## Task 14: `SessionResults` (3-altitude debrief)

**Files:**
- Create: `web/src/components/SessionResults.tsx`, `web/src/components/SessionResults.css`
- Test: `web/src/components/SessionResults.test.tsx`

**Interfaces:**
- Consumes: `Scorecard`, `ResultLine` (Task 11), `DualTranscript` (Task 13).
- Produces: `SessionResults({ scorecard, transcript, repLabel, onAgain, onDone, saving })` rendering verdict → scorecard → dual transcript and two actions.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionResults } from './SessionResults';
import type { Scorecard } from '../training/scoreApi';

const SC: Scorecard = {
  overallScore: 6.7, band: 'developing',
  scores: [{ dimensionId: 'ack', label: 'Acknowledge', score: 3, band: 'strong', rationale: 'restated well', evidenceQuote: 'I hear you' }],
  signals: { talkRatioPct: 55, questionCount: 3, longestMonologueWords: 18 },
  headline: 'Strong rapport, weak close.',
  worked: { note: 'Good acknowledgement', quote: 'I hear you' },
  fix: { note: 'Ask for the next step', quote: null, why: 'Deals stall' },
  nextTime: 'Book 20 minutes Thursday.', spoken: '...',
};

describe('SessionResults', () => {
  it('shows the verdict, a dimension row, and the dual transcript; fires actions', () => {
    const onAgain = vi.fn(); const onDone = vi.fn();
    render(
      <SessionResults scorecard={SC} transcript={[{ speaker: 'you', text: 'hi' }]} repLabel="Marcus" onAgain={onAgain} onDone={onDone} saving={false} />,
    );
    expect(screen.getByText('6.7')).toBeInTheDocument();
    expect(screen.getByText('Acknowledge')).toBeInTheDocument();
    expect(screen.getByText('Strong rapport, weak close.')).toBeInTheDocument();
    expect(screen.getByTestId('dual-transcript')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('results-again'));
    fireEvent.click(screen.getByTestId('results-done'));
    expect(onAgain).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/SessionResults.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// web/src/components/SessionResults.tsx
import type { JSX } from 'react';
import type { Scorecard, ResultLine } from '../training/scoreApi';
import { DualTranscript } from './DualTranscript';
import './SessionResults.css';

const BAND_WORD: Record<Scorecard['band'], string> = {
  needs_work: 'Needs work', developing: 'Developing', proficient: 'Proficient', strong: 'Strong',
};
const DIM_ICON: Record<string, string> = { missing: '✕', emerging: '↑', proficient: '✓', strong: '★' };

export interface SessionResultsProps {
  scorecard: Scorecard;
  transcript: ResultLine[];
  repLabel?: string;
  saving?: boolean;
  onAgain: () => void;
  onDone: () => void;
}

export function SessionResults({ scorecard, transcript, repLabel, saving, onAgain, onDone }: SessionResultsProps): JSX.Element {
  const sc = scorecard;
  return (
    <div className="session-results" data-testid="session-results">
      {/* Altitude 1 — verdict */}
      <section className={`results-verdict results-verdict--${sc.band}`}>
        <div className="results-score">
          <span className="results-score__value">{sc.overallScore.toFixed(1)}</span>
          <span className="results-score__max">/ 10</span>
          <span className="results-score__band">{BAND_WORD[sc.band]}</span>
        </div>
        <p className="results-headline">{sc.headline}</p>
        <div className="results-fix">
          <span className="results-fix__label">Your one fix</span>
          <p className="results-fix__note">{sc.fix.note}</p>
          <p className="results-fix__next">Try next time: {sc.nextTime}</p>
        </div>
      </section>

      {/* Altitude 2 — scorecard */}
      <section className="results-scorecard">
        <h3 className="results-h">How each move went</h3>
        <ul className="results-dims">
          {sc.scores.map((d) => (
            <li key={d.dimensionId} className={`results-dim results-dim--${d.band}`}>
              <span className="results-dim__icon" aria-hidden="true">{DIM_ICON[d.band]}</span>
              <span className="results-dim__body">
                <span className="results-dim__label">{d.label} <em>{d.score}/3</em></span>
                <span className="results-dim__rationale">{d.rationale}</span>
                {d.evidenceQuote && <span className="results-dim__quote">"{d.evidenceQuote}"</span>}
              </span>
            </li>
          ))}
        </ul>
        <div className="results-signals">
          <span>Talk ratio {sc.signals.talkRatioPct}% <em>(ideal ~45-57%)</em></span>
          <span>Questions {sc.signals.questionCount}</span>
          <span>Longest streak {sc.signals.longestMonologueWords}w</span>
        </div>
      </section>

      {/* Altitude 3 — annotated dual transcript */}
      <section className="results-transcript">
        <h3 className="results-h">The conversation</h3>
        <DualTranscript lines={transcript} repLabel={repLabel} />
      </section>

      <div className="results-actions">
        <button type="button" className="results-secondary" data-testid="results-done" onClick={onDone}>
          {saving ? 'Saving…' : 'Done'}
        </button>
        <button type="button" className="picker-cta-bar__btn" data-testid="results-again" onClick={onAgain}>
          Run it again <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}

export default SessionResults;
```

```css
/* web/src/components/SessionResults.css */
.session-results { display: flex; flex-direction: column; gap: 18px; max-width: 920px; margin: 0 auto; padding: 16px; }
.results-verdict { border-radius: var(--radius-lg); padding: 18px 20px; border: 1px solid var(--border); }
.results-verdict--strong { background: var(--accent-light); }
.results-verdict--proficient { background: #EAF6F3; }
.results-verdict--developing { background: #FBF4E6; }
.results-verdict--needs_work { background: #FBEDE9; }
.results-score { display: flex; align-items: baseline; gap: 6px; }
.results-score__value { font-size: 2.6rem; font-weight: 800; line-height: 1; }
.results-score__max { color: var(--text-3); }
.results-score__band { margin-left: auto; font-weight: 700; }
.results-headline { margin: 8px 0 12px; font-size: 1.05rem; }
.results-fix { background: var(--surface); border-radius: var(--radius-md); padding: 10px 12px; }
.results-fix__label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-3); font-weight: 700; }
.results-fix__note { margin: 4px 0; font-weight: 600; }
.results-fix__next { margin: 0; color: var(--text-2); }
.results-h { font-size: 0.95rem; margin: 0 0 8px; }
.results-dims { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.results-dim { display: flex; gap: 10px; padding: 10px 12px; border-radius: var(--radius-md); background: var(--surface); border: 1px solid var(--border); }
.results-dim__icon { font-weight: 800; }
.results-dim--strong .results-dim__icon, .results-dim--proficient .results-dim__icon { color: var(--accent); }
.results-dim--emerging .results-dim__icon { color: #B45309; }
.results-dim--missing .results-dim__icon { color: #B91C1C; }
.results-dim__body { display: flex; flex-direction: column; gap: 2px; }
.results-dim__label em { color: var(--text-3); font-style: normal; }
.results-dim__rationale { color: var(--text-2); font-size: 0.9rem; }
.results-dim__quote { color: var(--text-3); font-style: italic; font-size: 0.85rem; }
.results-signals { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 10px; font-size: 0.82rem; color: var(--text-2); }
.results-signals em { color: var(--text-3); font-style: normal; }
.results-actions { display: flex; justify-content: flex-end; gap: 12px; }
.results-secondary { padding: 9px 18px; border-radius: var(--radius-pill); border: 1px solid var(--border); background: var(--surface); color: var(--text-2); cursor: pointer; }
@media (max-width: 640px) { .session-results { padding: 12px; } }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/SessionResults.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/SessionResults.tsx web/src/components/SessionResults.css web/src/components/SessionResults.test.tsx
git commit -m "feat(web): SessionResults 3-altitude debrief"
```

---

## Task 15: `LiveRoom` (full-width shell)

**Files:**
- Create: `web/src/components/LiveRoom.tsx`, `web/src/components/LiveRoom.css`
- Test: `web/src/components/LiveRoom.test.tsx`

**Interfaces:**
- Consumes: `ChatTranscript` (Task 12).
- Produces: `LiveRoom({ lines, realtime, labels, rail })` — full-width two-zone layout: a scrolling transcript feed (left/main) + a `rail` node (right). Single-column on mobile.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveRoom } from './LiveRoom';

describe('LiveRoom', () => {
  it('renders the transcript feed and the rail', () => {
    render(
      <LiveRoom
        lines={[{ id: '1', speaker: 'you', text: 'hello' }]}
        realtime={{ you: '', nicole: '' }}
        rail={<div data-testid="rail">RAIL</div>}
      />,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByTestId('rail')).toBeInTheDocument();
    expect(screen.getByTestId('live-room')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/LiveRoom.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// web/src/components/LiveRoom.tsx
import type { JSX, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import type { TranscriptLine } from '../engine/types';
import { ChatTranscript } from './ChatTranscript';
import './LiveRoom.css';

export interface LiveRoomProps {
  lines: TranscriptLine[];
  realtime: { you: string; nicole: string };
  labels?: { you?: string; nicole?: string };
  rail: ReactNode;
}

/** Full-width live room: a Talk-style transcript feed that uses the whole left
 *  area + a right anchor rail. Replaces the narrow centered stage so the sides
 *  are no longer blank. Collapses to one column on mobile (rail on top). */
export function LiveRoom({ lines, realtime, labels, rail }: LiveRoomProps): JSX.Element {
  const feedRef = useRef<HTMLDivElement | null>(null);
  // Stick to the newest line as the conversation grows.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length, realtime.you, realtime.nicole]);

  return (
    <div className="live-room" data-testid="live-room">
      <aside className="live-room__rail">{rail}</aside>
      <div className="live-room__feed" ref={feedRef}>
        <ChatTranscript lines={lines} realtime={realtime} labels={labels} />
      </div>
    </div>
  );
}

export default LiveRoom;
```

```css
/* web/src/components/LiveRoom.css */
.live-room { display: grid; grid-template-columns: 1fr 300px; gap: 16px; flex: 1; min-height: 0; padding: 16px; }
.live-room__feed { overflow-y: auto; min-height: 0; padding-right: 6px; }
.live-room__rail { order: 2; display: flex; flex-direction: column; gap: 14px; }
/* feed before rail on desktop */
.live-room { grid-template-areas: 'feed rail'; }
.live-room__feed { grid-area: feed; }
.live-room__rail { grid-area: rail; }
@media (max-width: 860px) {
  .live-room { grid-template-columns: 1fr; grid-template-areas: 'rail' 'feed'; }
  .live-room__rail { order: 0; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/LiveRoom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/LiveRoom.tsx web/src/components/LiveRoom.css web/src/components/LiveRoom.test.tsx
git commit -m "feat(web): full-width LiveRoom shell"
```

---

## Task 16: `useCoachingSession` — auto-advance + transitions

**Files:**
- Modify: `web/src/training/useCoachingSession.ts`
- Test: `web/src/training/useCoachingSession.test.ts` (extend)

**Interfaces:**
- Consumes: `shouldAdvancePhase`, `AUTO_PHASES`, `AdvanceSignals` (Task 9); `afterNextModelTurn` (Task 10).
- Produces: `useCoachingSession` now auto-advances AUTO phases via an internal evaluator (transcript change + 2s interval), defers the overlay send via `afterNextModelTurn`, and still exposes `phase, advance, stop, start, coachTranscript, coachRealtime, coachAmplitude, scorecard, markProgress`. Adds `coachRealtime: { you: string; nicole: string }` passthrough.

- [ ] **Step 1: Write the failing test (extend)**

```ts
// Uses the existing test harness for useCoachingSession; assert auto-advance.
it('auto-advances intro after a turn + min dwell using fake timers', async () => {
  vi.useFakeTimers();
  const view = renderCoaching(); // existing helper in this test file
  await act(async () => { await view.result.current.start(); });
  // simulate one user turn in intro
  act(() => { view.simulateUserTurn?.('hello'); });
  // advance fake time past intro minPhaseMs (6s) + the 2s evaluator tick
  await act(async () => { vi.advanceTimersByTime(9000); });
  expect(view.result.current.phase).toBe('teach');
  vi.useRealTimers();
});
```

NOTE: this test depends on the existing harness in `useCoachingSession.test.ts`. If that harness has no `simulateUserTurn`, add a minimal mock that pushes a `{speaker:'you'}` line into the mocked coach transcript (mirror how the existing tests feed transcript data). Keep the assertion: intro → teach after a turn + dwell + tick.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/training/useCoachingSession.test.ts -t auto-advances`
Expected: FAIL (phase stays `intro`).

- [ ] **Step 3: Implement the evaluator**

In `useCoachingSession.ts`:

1. Import: `import { shouldAdvancePhase, AUTO_PHASES, type AdvanceSignals } from './phaseAdvance';`
2. Add refs:

```ts
  const phaseEnteredAtRef = useRef<number>(Date.now());
  const userTurnsThisPhaseRef = useRef(0);
  const litAtPhaseStartRef = useRef(0);
  const lastUserLineCountRef = useRef(0);
```

3. Reset them whenever `phase` changes (effect on `[phase]`): set `phaseEnteredAtRef.current = Date.now(); userTurnsThisPhaseRef.current = 0; litAtPhaseStartRef.current = scorecard.length;`.
4. Count user turns: in an effect on `coach.transcript`, compute the number of `you` lines; the delta over `lastUserLineCountRef` increments `userTurnsThisPhaseRef`. Update `lastUserLineCountRef`.
5. The evaluator (runs on transcript change AND a 2s interval):

```ts
  const evaluate = useCallback(() => {
    if (!startedRef.current) return;
    const ph = phaseRef.current; // keep a ref mirroring `phase`
    if (!AUTO_PHASES.includes(ph)) return;
    const signals: AdvanceSignals = {
      turns: userTurnsThisPhaseRef.current,
      litDelta: scorecardRef.current.length - litAtPhaseStartRef.current,
      timeInPhaseMs: Date.now() - phaseEnteredAtRef.current,
    };
    if (shouldAdvancePhase(ph, signals)) {
      setPhase((cur) => advancePhase(cur, { learnerTurns: 99 })); // force next in order
    }
  }, []);

  useEffect(() => {
    const id = setInterval(evaluate, 2000);
    return () => clearInterval(id);
  }, [evaluate]);
  useEffect(() => { evaluate(); }, [coach.transcript, scorecard, evaluate]);
```

(Add `phaseRef`/`scorecardRef` that mirror `phase`/`scorecard` each render so the stable `evaluate` reads fresh values.)

6. Defer the overlay send so Nicole isn't cut off. Where the phase-change effect currently calls `coachStartRef.current()` to push the new overlay, wrap it:

```ts
  useEffect(() => {
    if (!startedRef.current) return;
    coachAfterTurnRef.current(() => { void coachStartRef.current(); });
  }, [coachOverlay]);
```

with `const coachAfterTurnRef = useRef(coach.afterNextModelTurn); coachAfterTurnRef.current = coach.afterNextModelTurn;`.

7. Expose realtime passthrough: add `coachRealtime: coach.realtime` to the returned object and the result interface.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/training/useCoachingSession.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 5: Typecheck + commit**

Run: `cd web && npx tsc --noEmit`

```bash
git add web/src/training/useCoachingSession.ts web/src/training/useCoachingSession.test.ts
git commit -m "feat(web): app-driven auto-advance + don't-cut-off transitions in coaching"
```

---

## Task 17: `useCoachingSession` — practice freeze, judge, debrief

**Files:**
- Modify: `web/src/training/useCoachingSession.ts`
- Test: `web/src/training/useCoachingSession.test.ts` (extend)

**Interfaces:**
- Consumes: `requestScore`, `postLiveStatus`, `Scorecard`, `ResultLine` (Task 11); the lesson's `coreFramework.moves`.
- Produces: new returned fields `scorecardResult: Scorecard | null`, `practiceTranscript: ResultLine[]`, and methods `finishPractice(): Promise<void>` (freeze rep transcript → judge → set `scorecardResult` → set phase `debrief`), `replayPractice(): void` (→ `roleplay_demo`), `reteach(): void` (→ `model`). Derives dimensions from `lesson.coreFramework.moves` (`{ id: slug(step), label: step, rubric: intent }`).

- [ ] **Step 1: Write the failing test (extend)**

```ts
it('finishPractice freezes the rep transcript, scores it, and moves to debrief', async () => {
  const fakeSc = { overallScore: 7, band: 'proficient', scores: [], signals: { talkRatioPct: 50, questionCount: 1, longestMonologueWords: 9 }, headline: 'h', worked: { note: 'w', quote: null }, fix: { note: 'f', quote: null, why: '' }, nextTime: 'n', spoken: 's' };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ scorecard: fakeSc }) })) as any);
  const view = renderCoaching();
  await act(async () => { await view.result.current.start(); });
  // pretend we're in roleplay_demo with some rep+user lines captured
  act(() => { view.setPhase?.('roleplay_demo'); view.pushRepLine?.('Why now?'); view.simulateUserTurn?.('Because budgets reset.'); });
  await act(async () => { await view.result.current.finishPractice(); });
  expect(view.result.current.phase).toBe('debrief');
  expect(view.result.current.scorecardResult?.overallScore).toBe(7);
});
```

NOTE: extend the test harness with `setPhase`/`pushRepLine` mocks consistent with how the file already mocks the prospect session transcript. The captured practice transcript should merge user lines (from the coach session, `speaker:'you'`) and rep lines (from the prospect session, mapped to `speaker:'rep'`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/training/useCoachingSession.test.ts -t finishPractice`
Expected: FAIL (`finishPractice` not a function).

- [ ] **Step 3: Implement**

In `useCoachingSession.ts`:

1. Imports: `import { requestScore, postLiveStatus, type Scorecard, type ResultLine, type DimensionInput } from './scoreApi';`
2. A `slug` helper and dimension derivation:

```ts
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'move';
const lessonDimensions = (lesson: ClientLessonSpec): DimensionInput[] =>
  lesson.coreFramework.moves.map((m) => ({ id: slugify(m.step), label: m.step, rubric: m.intent || m.step }));
```

3. State: `const [scorecardResult, setScorecardResult] = useState<Scorecard | null>(null);`
4. Build the practice transcript by merging the coach session's `you` lines with the prospect session's lines mapped to `rep`:

```ts
  const buildPracticeTranscript = useCallback((): ResultLine[] => {
    const youLines: ResultLine[] = coach.transcript.filter((l) => l.speaker === 'you').map((l) => ({ speaker: 'you', text: l.text }));
    const repLines: ResultLine[] = prospect.transcript.filter((l) => l.speaker === 'nicole').map((l) => ({ speaker: 'rep', text: l.text }));
    // Interleave by original order is not available across sessions; concatenate
    // rep+you grouped is acceptable for scoring. Prefer the prospect session's
    // ordering of rep lines and the coach session's ordering of user lines.
    // For display we keep them in capture order via timestamps if present; else
    // simple concat (rep first per exchange is not guaranteed but scoring is
    // order-tolerant).
    return [...repLines, ...youLines];
  }, [coach.transcript, prospect.transcript]);
```

(If the engine lines carry no timestamps, this concat is acceptable — the judge is order-tolerant and the DualTranscript shows speakers distinctly. A future task can add per-line timestamps for true interleave.)

5. `finishPractice`:

```ts
  const finishPractice = useCallback(async () => {
    const transcript = buildPracticeTranscript();
    const dims = lessonDimensions(lesson);
    let sc: Scorecard;
    try {
      sc = await requestScore({ kind: 'training', dimensions: dims, transcript }, token ?? undefined);
    } catch {
      sc = { overallScore: 0, band: 'needs_work', scores: dims.map((d) => ({ dimensionId: d.id, label: d.label, score: 0, band: 'missing', rationale: 'Could not grade.', evidenceQuote: null })), signals: { talkRatioPct: 0, questionCount: 0, longestMonologueWords: 0 }, headline: 'Could not grade that run.', worked: { note: '', quote: null }, fix: { note: 'Try again.', quote: null, why: '' }, nextTime: 'Run it again.', spoken: 'Let us run that again.' };
    }
    setScorecardResult(sc);
    // Stop the rep, return to debrief; speak the key points via overlay addendum.
    if (prospectActiveRef.current) { prospectStopRef.current(); prospectActiveRef.current = false; }
    setPhase('debrief');
  }, [buildPracticeTranscript, lesson, token]);
```

6. `replayPractice` (`setPhase('roleplay_demo')`) and `reteach` (`setPhase('model')`).
7. Add `scorecardResult`, `practiceTranscript: buildPracticeTranscript()` is recomputed; expose a memoized snapshot instead — store the frozen transcript in a ref/state when `finishPractice` runs: add `const [practiceTranscript, setPracticeTranscript] = useState<ResultLine[]>([])` and `setPracticeTranscript(transcript)` inside `finishPractice`.
8. Return all new fields + methods.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/training/useCoachingSession.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `cd web && npx tsc --noEmit`

```bash
git add web/src/training/useCoachingSession.ts web/src/training/useCoachingSession.test.ts
git commit -m "feat(web): practice freeze, judge scoring, and debrief in coaching"
```

---

## Task 18: Wire `training_mark_progress` into the coach session

**Files:**
- Modify: `web/src/training/useCoachingSession.ts`
- Test: `web/src/training/useCoachingSession.test.ts` (extend)

**Interfaces:**
- Consumes: `useNicoleSession`'s `onToolCall` option; `markProgress` (already present).
- Produces: the coach `useNicoleSession` is created with `onToolCall` that routes `training_mark_progress({dimension,hit,tip})` calls to `markProgress`, so the live scorecard lights during guided practice.

- [ ] **Step 1: Write the failing test (extend)**

```ts
it('routes training_mark_progress tool calls into the scorecard', async () => {
  const view = renderCoaching();
  await act(async () => { await view.result.current.start(); });
  act(() => { view.emitCoachToolCall?.([{ name: 'training_mark_progress', args: { dimension: 'Acknowledge', hit: true, tip: 'Nice restate' } }]); });
  expect(view.result.current.scorecard).toEqual([{ dimension: 'Acknowledge', hit: true, tip: 'Nice restate' }]);
});
```

NOTE: extend the harness with `emitCoachToolCall` that invokes the `onToolCall` passed to the mocked coach `useNicoleSession`. Mirror the existing mock structure.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/training/useCoachingSession.test.ts -t training_mark_progress`
Expected: FAIL (scorecard empty).

- [ ] **Step 3: Implement**

In the coach `useNicoleSession({...})` options, add:

```ts
    onToolCall: (calls) => {
      for (const c of calls) {
        if (c.name === 'training_mark_progress' && c.args) {
          const a = c.args as { dimension?: string; hit?: boolean; tip?: string };
          markProgressRef.current({ dimension: String(a.dimension ?? ''), hit: !!a.hit, tip: String(a.tip ?? '') });
        }
      }
    },
```

Add `const markProgressRef = useRef(markProgress); markProgressRef.current = markProgress;` (declare after `markProgress` is defined; if ordering is an issue, define `markProgress` above the hook call or use a forward ref initialized to a no-op and assigned after).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/training/useCoachingSession.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/training/useCoachingSession.ts web/src/training/useCoachingSession.test.ts
git commit -m "feat(web): light the live scorecard from training_mark_progress calls"
```

---

## Task 19: TrainingSession screen — LiveRoom + readiness gate + practice end + SessionResults

**Files:**
- Modify: `web/src/screens/TrainingScreen.tsx`
- Test: `web/src/screens/TrainingScreen.test.tsx` (extend)

**Interfaces:**
- Consumes: `LiveRoom` (15), `SessionResults` (14), and the new `useCoachingSession` fields (16-18): `coachRealtime`, `scorecardResult`, `practiceTranscript`, `finishPractice`, `replayPractice`, `reteach`.
- Produces: the live training room renders full-width via `LiveRoom`; `readiness_check` shows a single "I'm ready" confirm that advances to `roleplay_demo`; `roleplay_demo` shows an "I'm done" button calling `finishPractice`; `debrief` renders `SessionResults`.

- [ ] **Step 1: Write the failing test (extend)**

```tsx
it('shows the readiness confirm at readiness_check and a full-width live room', async () => {
  // render TrainingSession with a mocked useCoachingSession at phase readiness_check
  // (extend the existing TrainingScreen mock of useCoachingSession)
  renderTrainingAtPhase('readiness_check');
  expect(screen.getByTestId('live-room')).toBeInTheDocument();
  expect(screen.getByTestId('readiness-confirm')).toBeInTheDocument();
});

it('renders SessionResults at debrief', async () => {
  renderTrainingAtPhase('debrief', { scorecardResult: SAMPLE_SCORECARD, practiceTranscript: [{ speaker: 'you', text: 'hi' }] });
  expect(screen.getByTestId('session-results')).toBeInTheDocument();
});
```

NOTE: extend the existing `useCoachingSession` mock in `TrainingScreen.test.tsx` to return the new fields; add a `renderTrainingAtPhase` helper that sets `phase` + optional overrides.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/screens/TrainingScreen.test.tsx`
Expected: FAIL (no live-room/readiness-confirm/session-results testids).

- [ ] **Step 3: Implement in `TrainingScreen.tsx`**

Replace the `session-body--live` stage block with a `LiveRoom`, building the rail from the existing phase stepper + status + the phase-specific action. Key changes inside `TrainingSession`:

- Import `LiveRoom`, `SessionResults`.
- Replace the `atEnd ? <debrief> : <live>` body. At `debrief`, if `session.scorecardResult` exists, render:

```tsx
        <SessionResults
          scorecard={session.scorecardResult}
          transcript={session.practiceTranscript}
          repLabel={lesson.coreFramework.name}
          saving={false}
          onAgain={() => session.replayPractice()}
          onDone={handleExit}
        />
```

- For the live body, render:

```tsx
      <LiveRoom
        lines={session.coachTranscript}
        realtime={session.coachRealtime}
        labels={{ nicole: 'Nicole' }}
        rail={
          <div className="live-rail">
            <nav className="phase-stepper" aria-label="Lesson progress" data-testid="phase-indicator">
              {PHASE_ORDER.map((p, i) => {
                const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming';
                return (
                  <div key={p} className={`phase-stepper__step is-${state}`}>
                    <span className="phase-stepper__dot" aria-hidden="true" />
                    <span className="phase-stepper__label">{PHASE_LABELS[p]}</span>
                  </div>
                );
              })}
            </nav>
            <p className="session-goal" aria-live="polite">{PHASE_GOAL[phase]}</p>
            {phase === 'readiness_check' && (
              <button type="button" className="picker-cta-bar__btn" data-testid="readiness-confirm"
                onClick={() => session.advance()}>
                I'm ready — go live <span aria-hidden="true">→</span>
              </button>
            )}
            {phase === 'roleplay_demo' && (
              <button type="button" className="picker-cta-bar__btn" data-testid="practice-done"
                onClick={() => void session.finishPractice()}>
                I'm done
              </button>
            )}
            {!started && (
              <button type="button" className="picker-cta-bar__btn" data-testid="start-button" onClick={handleStart}>
                Begin lesson <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        }
      />
```

(Remove the now-duplicated standalone stepper above the body; the rail owns it. Keep `TopBar` as is — its `center` already shows the lesson title.)

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/screens/TrainingScreen.test.tsx`
Expected: PASS (update any now-stale existing assertions that referenced the old centered stage / "Continue" button to the new testids).

- [ ] **Step 5: Typecheck + commit**

Run: `cd web && npx tsc --noEmit`

```bash
git add web/src/screens/TrainingScreen.tsx web/src/screens/TrainingScreen.test.tsx
git commit -m "feat(web): training live room, readiness gate, practice end, results"
```

---

## Task 20: Save training runs + finalize live status on debrief

**Files:**
- Modify: `web/src/screens/TrainingScreen.tsx`
- Test: `web/src/screens/TrainingScreen.test.tsx` (extend)

**Interfaces:**
- Consumes: `saveRun` (from `trainingApi`), `postLiveStatus` (Task 11), `session.scorecardResult`, `session.practiceTranscript`.
- Produces: on entering `debrief`, the screen saves a `kind:'training'` run and posts `finished` live-status; on entering the room it posts `entered`; on `start()`/practice it posts `active`.

- [ ] **Step 1: Write the failing test (extend)**

```tsx
it('saves a training run and posts finished status when results appear', async () => {
  const saveRun = vi.fn(async () => ({ id: 1 }));
  const postLiveStatus = vi.fn(async () => {});
  renderTrainingAtPhase('debrief', { scorecardResult: SAMPLE_SCORECARD, practiceTranscript: [{ speaker: 'you', text: 'hi' }] }, { saveRun, postLiveStatus });
  await waitFor(() => expect(saveRun).toHaveBeenCalled());
  expect(postLiveStatus).toHaveBeenCalledWith(expect.objectContaining({ mode: 'training', state: 'finished' }), expect.anything());
});
```

NOTE: mock `../training/trainingApi` (`saveRun`) and `../training/scoreApi` (`postLiveStatus`) in the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/screens/TrainingScreen.test.tsx -t "saves a training run"`
Expected: FAIL (no save).

- [ ] **Step 3: Implement**

In `TrainingSession`, add an effect that fires once when `session.scorecardResult` first becomes non-null:

```tsx
  const savedRef = useRef(false);
  useEffect(() => {
    if (!session.scorecardResult || savedRef.current) return;
    savedRef.current = true;
    const sc = session.scorecardResult;
    const transcriptText = session.practiceTranscript
      .map((l) => `${l.speaker === 'you' ? 'You' : l.speaker === 'rep' ? 'Rep' : 'Nicole'}: ${l.text}`)
      .join('\n');
    void saveRun({
      kind: 'training',
      profileId: lesson.skillId,
      title: lesson.title,
      score: sc.overallScore,
      scorecard: sc.scores,
      transcript: transcriptText,
    }, token);
    void postLiveStatus({ mode: 'training', state: 'finished', skill: lesson.title, startedAt: startedAtRef.current, finishedAt: Date.now(), score: sc.overallScore }, token ?? undefined);
  }, [session.scorecardResult, session.practiceTranscript, lesson, token]);
```

Add `const startedAtRef = useRef(Date.now());`, and in `handleStart` set `startedAtRef.current = Date.now();` and `void postLiveStatus({ mode:'training', state:'active', skill: lesson.title, startedAt: startedAtRef.current }, token ?? undefined);`. Add `entered` posting in a mount effect of `TrainingSession`. Import `useAuth` token (already used in the hook; pass it down or read via `useAuth()` in the screen).

- [ ] **Step 4: Run tests + commit**

Run: `cd web && npx vitest run src/screens/TrainingScreen.test.tsx && cd ../web && npx tsc --noEmit`

```bash
git add web/src/screens/TrainingScreen.tsx web/src/screens/TrainingScreen.test.tsx
git commit -m "feat(web): persist training runs + live-status on debrief"
```

---

## Task 21: Roleplay — real judge scoring + LiveRoom + SessionResults + status

**Files:**
- Modify: `web/src/screens/RoleplayScreen.tsx`
- Test: `web/src/screens/RoleplayScreen.test.tsx` (extend)

**Interfaces:**
- Consumes: `requestScore`, `postLiveStatus` (11), `LiveRoom` (15), `SessionResults` (14), `useRoleplaySession` (`transcript`, `realtime` — add a `realtime` passthrough mirroring Task 16 if absent).
- Produces: the roleplay room renders full-width via `LiveRoom`; "End & score" maps the transcript to `ResultLine[]` (user→`you`, character→`rep`), calls `requestScore` with the profile's `dimensions`, renders `SessionResults`, saves the run, and posts live status.

- [ ] **Step 1: Write the failing test (extend)**

```tsx
it('scores via the judge and renders SessionResults on end', async () => {
  const fakeSc = { overallScore: 7.2, band: 'proficient', scores: [], signals: { talkRatioPct: 52, questionCount: 2, longestMonologueWords: 11 }, headline: 'h', worked: { note: 'w', quote: null }, fix: { note: 'f', quote: null, why: '' }, nextTime: 'n', spoken: 's' };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ scorecard: fakeSc }) })) as any);
  renderRoleplayRoomWithTranscript([{ id: '1', speaker: 'you', text: 'hi' }, { id: '2', speaker: 'nicole', text: 'who is this?' }]);
  fireEvent.click(screen.getByTestId('end-score-button'));
  await screen.findByTestId('session-results');
  expect(screen.getByText('7.2')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/screens/RoleplayScreen.test.tsx`
Expected: FAIL (old roleplay result shown, no session-results / wrong score path).

- [ ] **Step 3: Implement**

In `RoleplayRoom`:

1. Replace the live `session-body--live` stage with `LiveRoom`:

```tsx
      <LiveRoom
        lines={transcript}
        realtime={session.realtime}
        labels={{ nicole: alias }}
        rail={
          <div className="live-rail">
            <div className={`turn-indicator turn-indicator--${turnState}`} aria-live="polite" data-testid="turn-indicator">
              <span className="turn-indicator__pulse" aria-hidden="true" />
              <span className="turn-indicator__label">{turnLabel}</span>
            </div>
            <button type="button" className="session-replay" data-testid="restart-scene-button" onClick={() => void start()}>Restart scene</button>
          </div>
        }
      />
```

(Keep the TopBar mute / End controls.)

2. Replace `endAndScore` body: build `ResultLine[]`, call the judge, save, post status, set a `Scorecard` result:

```ts
  const [scResult, setScResult] = useState<Scorecard | null>(null);
  const endAndScore = useCallback(async () => {
    const lines: ResultLine[] = transcript.map((l) => ({ speaker: l.speaker === 'you' ? 'you' : 'rep', text: l.text }));
    stop();
    let sc: Scorecard;
    try { sc = await requestScore({ kind: 'roleplay', dimensions: dimensions.length ? dimensions : [{ id: 'engagement', label: 'Engagement', rubric: 'Did they drive the exchange with real moves?' }], transcript: lines }, token ?? undefined); }
    catch { sc = /* same safe fallback object shape as Task 17 */; }
    setScResult(sc);
    setSaving(true);
    try {
      await saveRun({ kind: 'roleplay', profileId, personaId: persona.id, scenarioId: scenario.id, title: `${persona.name} · ${scenario.name}`, score: sc.overallScore, scorecard: sc.scores, transcript: lines.map((l) => `${l.speaker === 'you' ? 'You' : alias}: ${l.text}`).join('\n') }, token);
    } catch { /* best effort */ }
    finally { setSaving(false); }
    void postLiveStatus({ mode: 'roleplay', state: 'finished', skill: `${persona.name} · ${scenario.name}`, startedAt: startedAtRef.current, finishedAt: Date.now(), score: sc.overallScore }, token ?? undefined);
  }, [transcript, dimensions, stop, profileId, persona, scenario, alias, token]);
```

3. Replace the old `result` render branch with:

```tsx
  if (scResult) {
    const repLines: ResultLine[] = transcript.map((l) => ({ speaker: l.speaker === 'you' ? 'you' : 'rep', text: l.text }));
    return (
      <div className="roleplay roleplay--result" data-testid="roleplay-result">
        <SessionResults scorecard={scResult} transcript={repLines} repLabel={alias} saving={saving} onAgain={onAgain} onDone={onDone} />
      </div>
    );
  }
```

4. Post `entered` on room mount and `active` on auto-start (mirror Task 20), `startedAtRef = useRef(Date.now())`.
5. Add `realtime` to `useRoleplaySession`'s return (passthrough `session.realtime` from the underlying `useNicoleSession`) if not present.

Remove `scoreRoleplay`/`roleplayScore` usage from this screen (the heuristic is replaced). Leave the `roleplayScore.ts` file + its tests in place (still unit-tested; no longer imported here) OR delete it and its test — pick deletion to avoid dead code:

- Delete `web/src/training/roleplayScore.ts` and `web/src/training/roleplayScore.test.ts`; remove the import in `RoleplayScreen.tsx`.

- [ ] **Step 4: Run tests + typecheck**

Run: `cd web && npx vitest run src/screens/RoleplayScreen.test.tsx && npx tsc --noEmit`
Expected: PASS (update stale assertions referencing the old engagement score UI).

- [ ] **Step 5: Commit**

```bash
git add web/src/screens/RoleplayScreen.tsx web/src/screens/RoleplayScreen.test.tsx
git rm web/src/training/roleplayScore.ts web/src/training/roleplayScore.test.ts
git commit -m "feat(web): roleplay judge scoring, full-width room, dual-speaker results"
```

---

## Task 22: Cross-mode `[STATUS]` directive on return to Talk

**Files:**
- Modify: `web/src/screens/TalkScreen.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/src/screens/TalkScreen.test.tsx` (extend)

**Interfaces:**
- Consumes: `getLiveStatus` via a new client read `fetchLiveStatus()` in `scoreApi.ts`, `useNicoleSession.sendText`.
- Produces: when Talk becomes foreground after a mode switch, the screen fetches the live status and, if the Talk session is connected, sends a single silent `[STATUS] <line>` directive so Nicole's next turn reflects it.

- [ ] **Step 1: Add `fetchLiveStatus` to `scoreApi.ts` + test**

```ts
// in scoreApi.ts
export async function fetchLiveStatus(token?: string): Promise<{ mode: string; state: string; skill?: string; score?: number } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/session/status`, { headers: authHeaders(token) });
    const data = await res.json();
    return data.status ?? null;
  } catch { return null; }
}
```

Test (append to `scoreApi.test.ts`):

```ts
it('fetchLiveStatus returns null on error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('x'); }) as any);
  const { fetchLiveStatus } = await import('./scoreApi');
  expect(await fetchLiveStatus()).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `cd web && npx vitest run src/training/scoreApi.test.ts`
Expected: FAIL then (after step 1 impl) PASS.

- [ ] **Step 3: Send `[STATUS]` on return to Talk**

In `TalkScreen.tsx`, add an effect keyed on `backgrounded` transitioning `true → false` while `connected`:

```tsx
  const wasBg = useRef(backgrounded);
  useEffect(() => {
    const cameBack = wasBg.current && !backgrounded;
    wasBg.current = backgrounded;
    if (!cameBack || !connected) return;
    void (async () => {
      const st = await fetchLiveStatus(token ?? undefined);
      if (!st) return;
      const line = st.state === 'finished'
        ? `[STATUS] The user just finished a ${st.mode} ${st.skill ? `(${st.skill})` : ''}${typeof st.score === 'number' ? `, scored ${st.score}/10` : ''}. If relevant, ask how it went; do not offer to start it again.`
        : st.state === 'active'
          ? `[STATUS] The user is mid-${st.mode}${st.skill ? ` (${st.skill})` : ''}.`
          : `[STATUS] The user opened ${st.mode} but did not start.`;
      sendTextRef.current(line);
    })();
  }, [backgrounded, connected, token]);
```

Add `const sendTextRef = useRef(session.sendText); sendTextRef.current = session.sendText;` and import `fetchLiveStatus`, `useAuth` token. Ensure `TalkScreen` receives `backgrounded` (it already does).

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/screens/TalkScreen.test.tsx`
Expected: PASS (add a test asserting `sendText` is called with a `[STATUS]` string when `backgrounded` flips false with a mocked `fetchLiveStatus`).

- [ ] **Step 5: Typecheck + commit**

Run: `cd web && npx tsc --noEmit`

```bash
git add web/src/screens/TalkScreen.tsx web/src/training/scoreApi.ts web/src/training/scoreApi.test.ts web/src/screens/TalkScreen.test.tsx
git commit -m "feat(web): send [STATUS] to Talk-Nicole on return so she knows what you did"
```

---

## Task 23: Full verification + live spot-check

**Files:** none (verification only).

- [ ] **Step 1: Typecheck both packages**

Run: `cd web && npx tsc --noEmit && cd ../server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suites**

Run: `cd web && npm run test && cd ../server && npm run test`
Expected: all green (web prior 191 + new; server prior 154 + new).

- [ ] **Step 3: Production build**

Run: `cd web && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Playwright on the real logged-in app**

Write a throwaway `web/diag.mjs` (cleaned up after) that logs in with `ananya@alsatronix.com` / `Nicole2024!`, opens Training, picks a lesson, starts the drill, and screenshots: (a) the full-width LiveRoom (assert no blank side gutters — the `.live-room__feed` spans most of the width), (b) the readiness confirm, (c) a `debrief` with mocked `scorecardResult` shows `SessionResults` + `dual-transcript`. Repeat for Roleplay. Read each screenshot to confirm layout.

- [ ] **Step 5: Live voice spot-check (Gemini key has credits)**

Manually (or via a short Playwright drive): start a training drill, confirm Nicole opens autonomously, the phase stepper advances on its own through intro→teach→model, the readiness gate appears, the rep takes over for practice, "I'm done" produces a scored debrief, and she speaks the key points. Confirm returning to Talk, Nicole references the just-finished drill (no "ready to start training?").

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "test: full verification of training/roleplay redesign"
```

---

## Self-Review (completed)

**Spec coverage:** WS1 → Tasks 1-8 (judge 1-4, status 5-6, live-status injection 7, tool decl 8). WS2 → Tasks 9-10, 16-18. WS3 → Tasks 12, 15, 19/21 (rooms). WS4 → Tasks 13-14, 19/21 (results). WS5 → Tasks 5-7, 20-22. Every spec section maps to tasks.

**Placeholder scan:** All code steps contain real code. The two `/* same safe fallback object shape as Task 17 */` notes in Task 21 reference an explicit shape defined verbatim in Task 17 step 3 (copy it); acceptable as it's fully specified earlier. No TBDs.

**Type consistency:** `Scorecard`, `DimScore`, `ResultLine`, `Signals`, `DimensionInput` are defined once (server Task 2, mirrored client Task 11) and used consistently. `shouldAdvancePhase`/`AUTO_PHASES`/`AdvanceSignals` consistent across Tasks 9 and 16. `afterNextModelTurn` consistent across Tasks 10 and 16.
