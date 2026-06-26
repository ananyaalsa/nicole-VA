// Minimal training/roleplay HTTP API (no framework). Mirrors memory/routes.ts.
// Handles the /api/training* surface for the single local user. Returns JSON.

import type { IncomingMessage, ServerResponse } from 'node:http';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { JWT_SECRET } from '../auth/middleware.js';
import { listProfilesFull } from './profiles.js';
import { generateCustomSpec, type SpecGenInput } from './specGenerator.js';
import { saveTrainingRun, listTrainingHistory, getTrainingRun } from './historyDb.js';
import { judgeScorecard, type DimensionInput, type ResultLine, type Scorecard } from './scoreJudge.js';

// Test seam: allow tests to inject a fake judge so they don't hit the model.
type JudgeFn = (args: { kind: 'training' | 'roleplay'; dimensions: DimensionInput[]; transcript: ResultLine[] }) => Promise<Scorecard>;
let scoreJudge: JudgeFn = ({ kind, dimensions, transcript }) =>
  judgeScorecard({ kind, dims: dimensions, transcript });
export function setScoreJudge(fn: JudgeFn): void { scoreJudge = fn; }

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': config.frontendUrl,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(text);
}

/** Resolve the user from the JWT so history is per-user; fall back to the
 *  server default user when no/invalid token (local dev). */
function resolveUserId(req: IncomingMessage): string {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return config.userId;
  try {
    return (jwt.verify(token, JWT_SECRET) as { sub: string }).sub;
  } catch {
    return config.userId;
  }
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

/** Short slug for deriving a stable custom-spec id from a title/skill. */
function slug(s: string): string {
  return (
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'training'
  );
}

/** Tiny deterministic suffix so two specs with the same title don't collide. */
function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36).slice(0, 6);
}

/**
 * Try to handle a training route. Returns true if it matched (and responded),
 * false if the path is not a training route (so the caller can 404).
 */
export async function handleTrainingRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/training')) return false;

  const userId = resolveUserId(req);

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }

  // GET /api/training/profiles  — full profile defs for the picker UI.
  if (url.pathname === '/api/training/profiles' && req.method === 'GET') {
    sendJson(res, 200, { profiles: listProfilesFull() });
    return true;
  }

  // POST /api/training/generate  — AI custom-spec generation.
  if (url.pathname === '/api/training/generate' && req.method === 'POST') {
    const body = await readBody(req);
    const input: SpecGenInput = {
      dictation: typeof body.dictation === 'string' ? body.dictation : '',
      skill: typeof body.skill === 'string' ? body.skill : '',
      difficulty: typeof body.difficulty === 'string' ? body.difficulty : 'standard',
      title: typeof body.title === 'string' ? body.title : '',
      personaHint: typeof body.personaHint === 'string' ? body.personaHint : undefined,
    };
    const base = input.title || input.skill || input.dictation || 'training';
    const id = `custom-${slug(base)}-${shortHash(base)}`;
    const result = await generateCustomSpec(input, id);
    if (result.ok) {
      sendJson(res, 200, { ok: true, spec: result.spec });
    } else {
      sendJson(res, 200, { ok: false, error: result.error });
    }
    return true;
  }

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

  // /api/training/history  (collection)
  if (url.pathname === '/api/training/history') {
    if (req.method === 'GET') {
      const runs = await listTrainingHistory(userId);
      sendJson(res, 200, { runs });
      return true;
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (typeof body.kind !== 'string' || typeof body.title !== 'string' || !body.title.trim()) {
        sendJson(res, 400, { error: 'kind and title are required' });
        return true;
      }
      const { id } = await saveTrainingRun({
        userId,
        kind: body.kind === 'training' ? 'training' : 'roleplay',
        profileId: typeof body.profileId === 'string' ? body.profileId : undefined,
        personaId: typeof body.personaId === 'string' ? body.personaId : undefined,
        scenarioId: typeof body.scenarioId === 'string' ? body.scenarioId : undefined,
        title: body.title,
        score: typeof body.score === 'number' ? body.score : undefined,
        scorecard: body.scorecard,
        transcript: typeof body.transcript === 'string' ? body.transcript : undefined,
      });
      sendJson(res, 200, { id });
      return true;
    }
  }

  // GET /api/training/history/:id  (item)
  const match = url.pathname.match(/^\/api\/training\/history\/(\d+)$/);
  if (match && req.method === 'GET') {
    const run = await getTrainingRun(userId, Number(match[1]));
    if (!run) {
      sendJson(res, 404, { error: 'run not found' });
      return true;
    }
    sendJson(res, 200, { run });
    return true;
  }

  sendJson(res, 405, { error: 'method not allowed' });
  return true;
}
