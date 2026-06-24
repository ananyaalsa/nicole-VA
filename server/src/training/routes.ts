// Minimal training/roleplay HTTP API (no framework). Mirrors memory/routes.ts.
// Handles the /api/training* surface for the single local user. Returns JSON.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.js';
import { listProfilesFull } from './profiles.js';
import { generateCustomSpec, type SpecGenInput } from './specGenerator.js';
import { saveTrainingRun, listTrainingHistory, getTrainingRun } from './historyDb.js';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': config.frontendUrl,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(text);
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

  const userId = config.userId;

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
