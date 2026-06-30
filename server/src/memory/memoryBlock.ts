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

/** Human label for a factType/topic ("business" → "Business", "" → "Other"). */
function topicLabel(factType?: string): string {
  const t = (factType ?? '').trim();
  if (!t || t === 'general' || t === 'inferred' || t === 'explicit') return 'Other';
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ');
}

/** Preferred display order for common topics; unknown topics sort after, "Other" last. */
const TOPIC_ORDER = ['Identity', 'Business', 'Goal', 'Goals', 'Project', 'Preference', 'Preferences', 'People', 'Travel', 'Weather', 'Health', 'Finance'];

/**
 * Group learned facts by their topic (factType) into labelled sections, each
 * fact dated, newest first. Returns the rendered block body. Multiple facts under
 * the same topic accumulate as a running list (that's how "all the weather things,
 * one by one" build up).
 */
function groupLearnedByTopic(learned: MemoryFact[]): string {
  const byTopic = new Map<string, MemoryFact[]>();
  for (const f of learned) {
    const label = topicLabel(f.factType);
    const arr = byTopic.get(label) ?? [];
    arr.push(f);
    byTopic.set(label, arr);
  }
  const rank = (label: string): number => {
    const i = TOPIC_ORDER.indexOf(label);
    if (i >= 0) return i;
    if (label === 'Other') return 999;
    return 500; // unknown named topics: between known and Other
  };
  const labels = [...byTopic.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const sections = labels.map((label) => {
    const facts = byTopic
      .get(label)!
      .slice()
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? ''));
    const lines = facts.map((f) => {
      const d = dateOf(f.updatedAt ?? f.createdAt);
      return `  - ${d ? `${d}: ` : ''}${readableFact(f.key, f.fact)}`;
    });
    return `${label}:\n${lines.join('\n')}`;
  });
  return sections.join('\n\n');
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

  // ── Block 2: learned-in-conversation facts, GROUPED BY TOPIC ──
  // Group by factType so Nicole recalls "in the Business area we discussed X, Y"
  // instead of one flat list, and so repeated topics accumulate together. Topics
  // render in a stable, sensible order; anything uncategorised falls under "Other".
  const learnedBlock =
    `[LEARNED IN CONVERSATION] — the ONLY record of what you and the user actually talked about, grouped by topic and dated. Reference these as "last time"/"earlier you mentioned".\n` +
    (learned.length ? groupLearnedByTopic(learned) : '- (nothing yet — you have not learned anything from past conversations)');

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
