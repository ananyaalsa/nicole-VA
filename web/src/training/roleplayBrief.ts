import type { PersonaOption, ScenarioOption } from './trainingApi';
import type { Difficulty } from '../screens/RoleplayScreen';

/**
 * A case brief shown BEFORE a roleplay call, so the user is set up like a real rep
 * who's been briefed — who they're talking to, the situation, and their objective —
 * instead of being dropped cold into a call.
 */
export interface RoleplayBrief {
  who: string;        // "Grant Cardone — a blunt, high-energy closer"
  situation: string;  // a sentence or two of context for THIS call
  objective: string;  // what the user is trying to achieve
  context: string[];  // 2-3 short bullets (mindset, constraints, what they care about)
  variant: number;    // which variation was used (so a re-roll differs)
}

/** A few opener/situation framings per call type, rotated by `variant` so the same
 *  persona+scenario doesn't read identically every time (the "not the same script"
 *  ask). Purely client-side — no extra model call, no latency. */
const SITUATION_TEMPLATES = [
  (who: string, what: string) => `You're catching ${who} cold — they weren't expecting your call about ${what}. The first ten seconds decide everything.`,
  (who: string, what: string) => `${who} picked up between meetings. They're short on time and skeptical about ${what}.`,
  (who: string, what: string) => `You've got ${who} on the line about ${what}. They've heard plenty of pitches this week — give them a reason to keep listening.`,
  (who: string, what: string) => `${who} answered, half-distracted. Your job: earn their attention on ${what} before they make an excuse to hang up.`,
];

const OBJECTIVE_TEMPLATES = [
  (what: string) => `Earn a small next step on ${what} — a follow-up, not the whole deal.`,
  (what: string) => `Get them genuinely curious about ${what} and agree to a short next conversation.`,
  (what: string) => `Hold their attention through the first objection and land one clear next step.`,
];

/** Pull difficulty-flavored context bullets. */
function contextFor(difficulty: Difficulty, persona: PersonaOption): string[] {
  const base = [`They are: ${persona.tagline}`];
  if (difficulty === 'easy') base.push('Fairly open — they\'ll give you room if you\'re clear.');
  else if (difficulty === 'hard') base.push('Tough crowd — expect hard pushback and stacked objections.', 'Only genuinely strong handling moves them.');
  else base.push('Realistic — some resistance and a real objection or two, but movable.');
  return base;
}

/**
 * Synthesize a brief from the chosen persona + scenario + difficulty. `variant` (a
 * caller-supplied number, e.g. a click counter) rotates the phrasing so re-running
 * the same scenario gives a fresh-feeling case.
 */
export function synthesizeBrief(
  persona: PersonaOption,
  scenario: ScenarioOption,
  difficulty: Difficulty,
  variant = 0,
): RoleplayBrief {
  const who = `${persona.name} — ${persona.tagline}`;
  const what = scenario.name.toLowerCase();
  const sit = SITUATION_TEMPLATES[Math.abs(variant) % SITUATION_TEMPLATES.length];
  const obj = OBJECTIVE_TEMPLATES[Math.abs(variant) % OBJECTIVE_TEMPLATES.length];
  return {
    who,
    situation: sit(persona.name, what),
    objective: obj(what),
    context: contextFor(difficulty, persona),
    variant,
  };
}

/** A short overlay line embedding the brief so the live prospect plays THIS case. */
export function briefOverlay(brief: RoleplayBrief): string {
  return (
    `SCENARIO BRIEF (the user has just been briefed on this exact setup, play it consistently): ` +
    `${brief.situation} The user's goal is: ${brief.objective}`
  );
}
