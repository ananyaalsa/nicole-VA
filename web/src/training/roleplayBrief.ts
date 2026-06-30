import type { PersonaOption, ScenarioOption } from './trainingApi';
import type { Difficulty } from '../screens/RoleplayScreen';

/**
 * A case brief shown BEFORE a roleplay call, so the user is set up like a real rep
 * who's been briefed — who they're talking to, the situation, and their objective —
 * instead of being dropped cold into a call. Each brief invents a CONCRETE,
 * VARIED setup (company, the prospect's role, a situational detail) so the same
 * persona+scenario never reads identically twice.
 */
export interface RoleplayBrief {
  who: string;        // "Grant Cardone — Aggressive, 10X or nothing"
  role: string;       // the prospect's role + company, e.g. "VP of Sales at Northwind Logistics"
  situation: string;  // a sentence or two of context for THIS call
  objective: string;  // what the user is trying to achieve
  context: string[];  // 2-3 short bullets (mindset, constraints, what they care about)
  variant: number;    // which variation was used (so a re-roll differs)
}

// Invented companies + industries so each generated case feels like a real,
// specific account rather than a generic "a prospect". Paired so the detail line
// (what they do) stays coherent with the company name.
const COMPANIES: Array<{ name: string; industry: string }> = [
  { name: 'Northwind Logistics', industry: 'freight and supply chain' },
  { name: 'Brightpath Health', industry: 'clinic management software' },
  { name: 'Cedar & Co.', industry: 'commercial real estate' },
  { name: 'Vantage Robotics', industry: 'warehouse automation' },
  { name: 'Harbor Financial', industry: 'small-business lending' },
  { name: 'Lumen Retail Group', industry: 'a chain of home-goods stores' },
  { name: 'Atlas Manufacturing', industry: 'industrial parts' },
  { name: 'Syntra Media', industry: 'a digital ad agency' },
  { name: 'Greenfield Foods', industry: 'organic packaged food' },
  { name: 'Pinnacle HR', industry: 'staffing and recruiting' },
];

// Plausible decision-maker roles to put the prospect in.
const ROLES = [
  'VP of Sales',
  'Head of Operations',
  'the Founder',
  'CFO',
  'Director of Marketing',
  'COO',
  'Head of Revenue',
  'the Office Manager',
];

// A specific wrinkle that gives this exact call a reason-to-care or a hurdle.
const WRINKLES = [
  'They just wrapped a vendor review and are wary of switching anything.',
  'Their team is slammed heading into quarter-end.',
  "They've been burned by a similar tool before.",
  "Budget is tight this quarter, but they have real pain you can solve.",
  'A competitor pitched them last week, so the bar is high.',
  'They have decision power but only a few minutes to give you.',
];

/** Situation framings, woven with the concrete company/role, rotated by `variant`. */
const SITUATION_TEMPLATES: Array<(who: string, what: string, place: string) => string> = [
  (who, what, place) => `You're catching ${who} at ${place} cold — they weren't expecting your call about ${what}. The first ten seconds decide everything.`,
  (who, what, place) => `${who} at ${place} picked up between meetings. Short on time, and they've heard plenty of pitches about ${what} before.`,
  (who, what, place) => `You've got ${who} from ${place} on the line about ${what}. Give them a reason to keep listening past the opener.`,
  (who, what, place) => `${who} at ${place} answered, half-distracted. Earn their attention on ${what} before they make an excuse to hang up.`,
  (who, what, place) => `Cold call into ${place}: ${who} just got handed the phone. They're skeptical, but reachable, about ${what}.`,
];

const OBJECTIVE_TEMPLATES: Array<(what: string) => string> = [
  (what) => `Earn a small next step on ${what} — a follow-up, not the whole deal.`,
  (what) => `Get them genuinely curious about ${what} and agree to a short next conversation.`,
  (what) => `Hold their attention through the first objection and land one clear next step.`,
  (what) => `Book fifteen minutes later this week to talk ${what} properly. That's the win.`,
];

/** A simple integer hash so a string seed maps to a stable-but-varied index. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Difficulty → one "how movable are they" line (kept SEPARATE from the persona's
 *  mindset so the bullets never contradict the tagline). */
function movabilityLine(difficulty: Difficulty): string {
  if (difficulty === 'easy') return 'Movable: if you are clear and relevant, they will give you room.';
  if (difficulty === 'hard') return 'Movable: barely — expect hard pushback and stacked objections; only genuinely strong handling moves them.';
  return 'Movable: some real resistance and an objection or two, but winnable.';
}

/**
 * Synthesize a brief from the chosen persona + scenario + difficulty. `variant` (a
 * caller-supplied number, e.g. a click counter) rotates EVERY element — situation,
 * objective, company, role, and wrinkle — so re-running the same scenario gives a
 * genuinely fresh-feeling case, not the same template with the same company.
 */
export function synthesizeBrief(
  persona: PersonaOption,
  scenario: ScenarioOption,
  difficulty: Difficulty,
  variant = 0,
): RoleplayBrief {
  const who = `${persona.name} — ${persona.tagline}`;
  const what = scenario.name.toLowerCase();

  // Spread the picks across the pools using the variant plus a per-persona/scenario
  // hash, so two different scenarios at variant 0 don't share the same company, and
  // each re-roll (variant+1) lands on a different company/role/wrinkle/framing.
  const seed = variant + hashString(`${persona.id}|${scenario.id}`);
  const company = COMPANIES[seed % COMPANIES.length];
  const role = ROLES[(seed + 3) % ROLES.length];
  const wrinkle = WRINKLES[(seed + 5) % WRINKLES.length];
  const sit = SITUATION_TEMPLATES[(seed + 1) % SITUATION_TEMPLATES.length];
  const obj = OBJECTIVE_TEMPLATES[(seed + 2) % OBJECTIVE_TEMPLATES.length];

  const place = `${company.name} (${company.industry})`;
  const roleLine = `${role} at ${company.name} — ${company.industry}`;

  return {
    who,
    role: roleLine,
    situation: sit(persona.name, what, place),
    objective: obj(what),
    // Mindset comes from the persona (so it never contradicts the tagline), then
    // the situational wrinkle, then how movable they are at this difficulty.
    context: [`Their mindset: ${persona.tagline}.`, wrinkle, movabilityLine(difficulty)],
    variant,
  };
}

/** A short overlay line embedding the brief so the live prospect plays THIS case. */
export function briefOverlay(brief: RoleplayBrief): string {
  return (
    `SCENARIO BRIEF (the user has just been briefed on this exact setup, play it consistently): ` +
    `You are ${brief.role}. ${brief.situation} The user's goal is: ${brief.objective}`
  );
}
