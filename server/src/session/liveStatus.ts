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
