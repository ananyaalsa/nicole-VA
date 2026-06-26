import type { MemoryFact } from '../types.js';

/** Extra context the relay can supply alongside stored facts. */
export interface MemoryBlockExtras {
  /** The user's display name (from nicole2_users), if known. */
  displayName?: string;
  /** The user's email (from nicole2_users), if known. */
  email?: string;
  /** A pre-built one-line-per-item RECENT ACTIVITY digest (training/roleplay). */
  activityLines?: string[];
  /** A single formatted line describing what the user is doing right now or just did (from liveStatus). */
  liveStatusLine?: string;
}

/** Local YYYY-MM-DD for an ISO timestamp (best-effort). */
function dateOf(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** Pretty label for a profile key (user_about → About). */
function profileLabel(key: string): string {
  switch (key) {
    case 'user_about': return 'About';
    case 'user_goals': return 'Goals';
    case 'user_phone': return 'Phone';
    case 'user_name': return 'Name';
    default: return key.replace(/^user_/, '').replace(/_/g, ' ');
  }
}

/** Render a goals JSON array or raw string as a readable value. */
function readableFact(key: string, fact: string): string {
  if (key === 'user_goals') {
    try {
      const arr = JSON.parse(fact);
      if (Array.isArray(arr)) return arr.join(', ');
    } catch { /* fall through */ }
  }
  return fact;
}

/**
 * Render durable memory as PROVENANCE-SEPARATED blocks so Nicole never confuses
 * "facts I know about you" (profile/settings) with "things we actually
 * discussed" (conversation). This is the core anti-confabulation fix: profile
 * facts go under [WHAT YOU KNOW ABOUT THEM]; conversationally-learned facts go
 * under [LEARNED IN CONVERSATION] with their date; recent training/roleplay
 * goes under [RECENT ACTIVITY]. Empty conversation/activity blocks render an
 * explicit "(nothing yet…)" so a missing section can't invite fabrication.
 */
export function formatMemoryBlock(facts: MemoryFact[], extras: MemoryBlockExtras = {}): string {
  const profile = facts.filter((f) => f.source === 'settings');
  const learned = facts.filter((f) => f.source !== 'settings');

  // ── Block 1: profile / known facts ──
  const knowLines: string[] = [];
  if (extras.displayName) knowLines.push(`- Name: ${extras.displayName}`);
  if (extras.email) knowLines.push(`- Email: ${extras.email}`);
  for (const f of profile) {
    knowLines.push(`- ${profileLabel(f.key)}: ${readableFact(f.key, f.fact)}`);
  }
  const knowBlock =
    `[WHAT YOU KNOW ABOUT THEM] — profile facts the user set in settings or that you durably saved. You KNOW these; you did NOT necessarily discuss them.\n` +
    (knowLines.length ? knowLines.join('\n') : '- (nothing on file yet)');

  // ── Block 2: learned-in-conversation facts ──
  const learnedLines = learned.map((f) => {
    const d = dateOf(f.updatedAt ?? f.createdAt);
    return `- ${d ? `${d}: ` : ''}${readableFact(f.key, f.fact)}`;
  });
  const learnedBlock =
    `[LEARNED IN CONVERSATION] — the ONLY record of what you and the user actually talked about, each dated. Reference these as "last time"/"earlier you mentioned".\n` +
    (learnedLines.length ? learnedLines.join('\n') : '- (nothing yet — you have not learned anything from past conversations)');

  // ── Block 3: recent activity (training / roleplay) ──
  const activityBlock =
    `[RECENT ACTIVITY] — real Training/Roleplay sessions the user completed. State only what is listed; never invent a score, count, or topic.\n` +
    (extras.activityLines && extras.activityLines.length
      ? extras.activityLines.map((l) => `- ${l}`).join('\n')
      : '- (none yet — they have not done any training or roleplay)');

  const parts: string[] = [knowBlock, learnedBlock, activityBlock];

  if (extras?.liveStatusLine) {
    parts.push(`[LIVE STATUS]\n${extras.liveStatusLine}`);
  }

  return parts.join('\n\n');
}
