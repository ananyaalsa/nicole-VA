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
  const res = await fetch(`${HTTP_BASE}/api/training/score`, {
    method: 'POST', headers: authHeaders(token), body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`score request failed: ${res.status}`);
  const data = await res.json();
  return data.scorecard as Scorecard;
}

export interface LiveStatusInput {
  mode: 'training' | 'roleplay'; state: 'entered' | 'active' | 'finished' | 'left';
  skill?: string; startedAt: number; finishedAt?: number; score?: number;
}

/** Read the current cross-mode live status. Returns null on any error. */
export async function fetchLiveStatus(token?: string): Promise<{ mode: string; state: string; skill?: string; score?: number } | null> {
  try {
    const res = await fetch(`${HTTP_BASE}/api/session/status`, { headers: authHeaders(token) });
    const data = await res.json();
    return data.status ?? null;
  } catch { return null; }
}

/** Best-effort live-status ping. Swallows all errors (it must never block UX). */
export async function postLiveStatus(s: LiveStatusInput, token?: string): Promise<void> {
  try {
    await fetch(`${HTTP_BASE}/api/session/status`, {
      method: 'POST', headers: authHeaders(token), body: JSON.stringify(s),
    });
  } catch { /* best-effort */ }
}
