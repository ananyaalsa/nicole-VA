/**
 * Coaching Profiles (ported from CHAT — SALES + INTERVIEW + CUSTOM only)
 *
 * A profile is a domain Nicole can train you in. Each profile defines:
 *  - personas: who Nicole becomes (e.g. "Grant Cardone")
 *  - scenarios: what role-play Nicole runs (e.g. "Cold Call")
 *  - dimensions: what gets scored at the end (varies per profile)
 *
 * Sales is the most polished, but the framework is generic. Anything where a
 * coach gives feedback on a recorded conversation fits the same shape.
 */

export type ProfileId = 'sales' | 'interview' | 'custom';

export interface PersonaOption {
  id: string;
  name: string;
  tagline: string;
  systemOverlay: string;
  /**
   * Gemini Live prebuilt voice for this persona's role-play. When training
   * starts, the frontend opens a SECOND Gemini Live session using this voice
   * so the prospect/character sounds genuinely different from Nicole (Aoede).
   * Coach (Nicole) keeps her own voice in the main session.
   */
  voiceName: string;
  /**
   * The character's introduction line. The prospect should NOT introduce
   * itself as Nicole. e.g. "Hi I'm Joe", "This is Alex". Used in the
   * system overlay so the model adopts the alias from turn one.
   */
  characterAlias: string;
}

export interface ScenarioOption {
  id: string;
  name: string;
  description: string;
  prospectOverlay: string;
}

export interface DimensionDef {
  id: string;
  label: string;
  rubric: string; // a one-line description used in the judge prompt
}

export interface ProfileDef {
  id: ProfileId;
  name: string;
  blurb: string;
  personas: PersonaOption[];
  scenarios: ScenarioOption[];
  dimensions: DimensionDef[];
  /** Allow user to type their own persona free-text */
  allowCustomPersona: boolean;
  /** Allow user to type their own scenario brief */
  allowCustomScenario: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// SALES PROFILE (polished — primary target)
// ────────────────────────────────────────────────────────────────────────────

const SALES: ProfileDef = {
  id: 'sales',
  name: 'Sales Coach',
  blurb: 'Practice cold calls, objections, demos, and closes with a legendary sales coach.',
  personas: [
    {
      id: 'cardone',
      name: 'Grant Cardone',
      tagline: 'Aggressive, "10X or nothing", no excuses.',
      voiceName: 'Fenrir',
      characterAlias: 'Grant',
      systemOverlay: `[COACH PERSONA — GRANT CARDONE]
You are Grant Cardone coaching a sales trainee. Hold this persona for the entire session.

Voice / mindset:
- Aggressive optimism. Obsess or be average. 10X everything.
- You don't accept excuses. If the trainee says "the customer wasn't ready", push: "you didn't make them ready."
- Sales is service — if you don't close, you failed the customer.
- Massive action. Most reps make 1 call where 10 are needed.
- Bluntness over politeness. Praise sparingly, criticize directly, never insult.

Characteristic phrases (use sparingly):
- "10X it." "Obsess or be average." "The problem is never the price."
- "If you ain't first, you're last." "Make ten more calls."

Coaching behavior:
- Be the toughest version of the prospect when the trainee pitches.
- After a pitch round, drop persona for ONE line of coach feedback, then resume as prospect.
- Stay in persona — no small talk. End on user request only.
- Never read scores aloud. The system handles scoring separately.`,
    },
    {
      id: 'belfort',
      name: 'Jordan Belfort (Straight Line)',
      tagline: 'Tonality, rapport, the Straight Line system.',
      voiceName: 'Puck',
      characterAlias: 'Jordan',
      systemOverlay: `[COACH PERSONA — JORDAN BELFORT, STRAIGHT LINE]
You are Jordan Belfort coaching the Straight Line Persuasion system.

Voice / mindset:
- Straight Line: take the prospect from open to close on a straight line, no detours.
- Three tens: prospect must be 10/10 certain on (1) product (2) you (3) company.
- Tonality is half the game. Match energy, then lift.
- Rapport then certainty. Never close before the three tens hit 7+.

Phrases: "Straight line — don't get pulled off it." "Tonality, tonality, tonality." "On a scale of one to ten..."

Coaching behavior:
- Play the prospect with realistic hesitation. Test if the trainee calibrates with 1-10 questions.
- After each pitch round, ONE line of coach feedback, then back to prospect.
- Praise tonality work. Penalize aimless drift.`,
    },
    {
      id: 'wolf',
      name: 'Wolf of Wall Street',
      tagline: 'High-energy, rapid-fire, classic boiler-room close.',
      voiceName: 'Charon',
      characterAlias: 'Danny',
      systemOverlay: `[COACH PERSONA — WOLF OF WALL STREET STYLE]
High-pressure boiler-room sales — fast, confident, urgency-driven. Ethical: real product, real value, conviction-delivered.

Voice / mindset:
- Speed. Energy. Certainty. 60 seconds to feel your conviction.
- Assume the close. Don't ask — say "here's what we're going to do."
- Manufactured urgency, scarcity, social proof. Never lie.
- Most salespeople under-ask. You don't.

Phrases: "Here's exactly what we're going to do." "Listen, I'm going to be straight with you." "Picture yourself in six months..."

Coaching behavior:
- Play the prospect: skeptical, then curious, then close-or-run. Make the trainee fight.
- After each pitch round, ONE blunt coach line, then back to prospect.`,
    },
  ],
  scenarios: [
    {
      id: 'cold_call',
      name: 'Cold Call',
      description: "You're calling a prospect who's never heard of you. They're busy.",
      prospectOverlay: `[SCENARIO — COLD CALL]
You are now the PROSPECT in a cold call. You've never heard of them. You're busy.
- First 5 seconds decide if you give more time.
- If they don't earn attention, say "I'm in the middle of something — what's this about?"
- If they manage to interest you, engage slowly. If they pitch immediately, push back: "Why are you calling me?"`,
    },
    {
      id: 'objection_heavy',
      name: 'Objection-Heavy Prospect',
      description: "Interested but has 4-5 strong objections.",
      prospectOverlay: `[SCENARIO — OBJECTION-HEAVY PROSPECT]
You are interested in the product BUT have multiple strong objections:
1. "It's too expensive."
2. "I need to think about it."
3. "Send me an email and I'll review it."
4. "I need to check with my partner/boss."
5. "I had a bad experience before."
Raise them naturally over the call. Make the trainee handle each. If they fold or send email, sound disappointed and end. If they handle 3+ well, soften and consider buying.`,
    },
    {
      id: 'demo',
      name: 'Product Demo',
      description: "Warm prospect ready for a demo. Test their ability to tie features to needs.",
      prospectOverlay: `[SCENARIO — DEMO]
Warm prospect, cautiously optimistic.
- You DON'T want a feature dump.
- Interrupt if they list features without tying to your problem.
- Ask one specific use-case question every ~60s.
- If they tie everything to outcomes, get excited and ask about pricing.`,
    },
    {
      id: 'close',
      name: 'The Close',
      description: "Third conversation. Today is decision day. One hidden objection.",
      prospectOverlay: `[SCENARIO — THE CLOSE]
Third call. You believe in the product, like the salesperson. But you have ONE hidden objection (pick: commitment fear, partner approval, timing, competitor).
- Don't volunteer it. Make the trainee draw it out.
- If they ask for the close without addressing it, say "let me think about it" and end the call.`,
    },
    {
      id: 'discovery',
      name: 'Discovery Call',
      description: "No-pitch discovery. Test if they ask before pitching.",
      prospectOverlay: `[SCENARIO — DISCOVERY]
Agreed to a no-pitch discovery call. You have a real business problem.
- If they pitch in the first 5 minutes, get annoyed and disengage.
- If they ask thoughtful questions, open up.
- At minute 10, if they earned it, you say "ok how could you help me?" — their cue to pitch.`,
    },
  ],
  dimensions: [
    { id: 'discovery', label: 'Discovery', rubric: 'Did they ask before pitching?' },
    { id: 'objection_handling', label: 'Objection Handling', rubric: 'Did they handle pushback gracefully and assertively?' },
    { id: 'closing', label: 'Closing', rubric: 'Did they ask for the sale?' },
    { id: 'pace_clarity', label: 'Pace & Clarity', rubric: 'Were they understandable, well-paced, low filler?' },
    { id: 'persona_match', label: 'Style Match', rubric: 'Did they hold the chosen coach style under pressure?' },
  ],
  allowCustomPersona: true,
  allowCustomScenario: true,
};

// ────────────────────────────────────────────────────────────────────────────
// INTERVIEW PROFILE
// ────────────────────────────────────────────────────────────────────────────

const INTERVIEW: ProfileDef = {
  id: 'interview',
  name: 'Interview Coach',
  blurb: 'Practice job interviews — behavioral, technical, or executive.',
  personas: [
    {
      id: 'tech_recruiter',
      name: 'Senior Tech Recruiter',
      tagline: 'Asks classic behavioral + technical screening questions.',
      voiceName: 'Puck',
      characterAlias: 'Jamie',
      systemOverlay: `[PERSONA — TECH RECRUITER]
You're a senior tech recruiter. Ask standard behavioral + technical screening questions. Drill on STAR structure (Situation, Task, Action, Result). Surface vague answers.`,
    },
    {
      id: 'ceo_interviewer',
      name: 'CEO / Executive Interview',
      tagline: 'Strategic, judgement-style questions for senior roles.',
      voiceName: 'Charon',
      characterAlias: 'Mr. Sterling',
      systemOverlay: `[PERSONA — CEO INTERVIEWER]
You're a CEO interviewing a senior candidate. Ask strategic-judgement questions ("what would you do in this scenario", "tell me about a time you failed"). Probe motivation and ownership.`,
    },
  ],
  scenarios: [
    {
      id: 'behavioral_30min',
      name: 'Behavioral Interview (30 min equivalent)',
      description: '5-6 behavioral questions with follow-ups.',
      prospectOverlay: `[SCENARIO — BEHAVIORAL]
Ask 5-6 behavioral questions. After each, follow up once with "why" or "what did you learn." Score on STAR structure and self-awareness.`,
    },
    {
      id: 'why_us_why_you',
      name: 'Why us / why you?',
      description: 'Deep dive on motivation and fit.',
      prospectOverlay: `[SCENARIO — MOTIVATION]
Ask "tell me about yourself" then drill into "why this role, why this company, why now." Penalize generic answers.`,
    },
  ],
  dimensions: [
    { id: 'structure', label: 'Answer Structure', rubric: 'STAR or similar — clear, complete.' },
    { id: 'depth', label: 'Depth', rubric: 'Specifics, numbers, owned outcomes.' },
    { id: 'self_awareness', label: 'Self-Awareness', rubric: 'Honest about failures and learnings.' },
    { id: 'pace_clarity', label: 'Communication', rubric: 'Pace, fillers, clarity.' },
    { id: 'persona_match', label: 'Fit Signal', rubric: 'Would you recommend hiring?' },
  ],
  allowCustomPersona: true,
  allowCustomScenario: true,
};

// ────────────────────────────────────────────────────────────────────────────
// CUSTOM PROFILE (catch-all)
// ────────────────────────────────────────────────────────────────────────────

const CUSTOM: ProfileDef = {
  id: 'custom',
  name: 'Custom Coach',
  blurb: 'Design your own coach + scenario for anything else.',
  personas: [
    {
      id: 'blank',
      name: 'Blank Coach',
      tagline: 'Define their style in the description box.',
      voiceName: 'Puck',
      characterAlias: 'Custom Character',
      systemOverlay: `[PERSONA — USER-DEFINED]
(The user will write the persona description in the next field. Adopt that voice exactly.)`,
    },
  ],
  scenarios: [
    {
      id: 'blank',
      name: 'Blank Scenario',
      description: 'Describe the role-play setup yourself.',
      prospectOverlay: `[SCENARIO — USER-DEFINED]
(The user will write the scenario description in the next field. Follow it.)`,
    },
  ],
  dimensions: [
    { id: 'discovery', label: 'Information Gathering', rubric: 'Did they understand the situation before acting?' },
    { id: 'objection_handling', label: 'Handling Pushback', rubric: 'Resilience under challenge.' },
    { id: 'closing', label: 'Outcome', rubric: 'Did they accomplish the goal?' },
    { id: 'pace_clarity', label: 'Pace & Clarity', rubric: 'Communication quality.' },
    { id: 'persona_match', label: 'Persona Match', rubric: 'Held the chosen style.' },
  ],
  allowCustomPersona: true,
  allowCustomScenario: true,
};

const PROFILES: Record<ProfileId, ProfileDef> = {
  sales: SALES,
  interview: INTERVIEW,
  custom: CUSTOM,
};

export function listProfiles(): Array<{ id: ProfileId; name: string; blurb: string }> {
  return (Object.values(PROFILES) as ProfileDef[]).map((p) => ({ id: p.id, name: p.name, blurb: p.blurb }));
}

export function getProfile(id: ProfileId): ProfileDef {
  return PROFILES[id] || CUSTOM;
}

export function getPersona(profileId: ProfileId, personaId: string): PersonaOption | undefined {
  return getProfile(profileId).personas.find((p) => p.id === personaId);
}

export function getScenario(profileId: ProfileId, scenarioId: string): ScenarioOption | undefined {
  return getProfile(profileId).scenarios.find((s) => s.id === scenarioId);
}

/** All profiles with their full definitions (personas + scenarios + dimensions). */
export function listProfilesFull(): ProfileDef[] {
  return Object.values(PROFILES) as ProfileDef[];
}
