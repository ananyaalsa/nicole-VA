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
