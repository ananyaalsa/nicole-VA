/**
 * Custom-training spec generator (ported from CHAT). Builds a prompt from the
 * user's request, calls a non-live text Gemini model, and parses/repairs the
 * returned JSON into a validated TrainingSpec.
 */
import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { validateTrainingSpec, type TrainingSpec } from './trainingSpec.js';

export interface SpecGenInput {
  dictation: string;
  skill: string;
  difficulty: string;
  title: string;
  personaHint?: string;
}

export function buildSpecGenerationPrompt(i: SpecGenInput): string {
  const request = (i.dictation || i.personaHint || i.title || i.skill || '').trim();
  return [
    'You design a CONVERSATION-PRACTICE TRAINING from the user\'s request. The user practices by ROLE-PLAYING against a persona you create, and gets coached on a framework you author. This is NOT limited to sales — it can be a JOB INTERVIEW, a fundraising pitch, a negotiation, a difficult-conversation, customer support, a cold call, anything the user describes.',
    '',
    '=========================================================',
    'THE USER\'S ACTUAL REQUEST — THIS IS THE WHOLE POINT. Build the training around EXACTLY this. Do NOT substitute a generic price-objection / sales-objection lesson unless the user explicitly asked for one:',
    `"""${request}"""`,
    '=========================================================',
    '',
    'First, silently identify from the request: (a) WHO the user is and what they are trying to do, (b) the SKILL or TOPIC to drill, and (c) WHO/what they practice against — this can be a role-play counterpart (a CEO interviewing them, an investor, an angry customer, a prospect) OR, for a LEARNING/TUTORING request (e.g. "recap me on the solar system like I\'m 25"), the persona is simply a friendly TUTOR/coach who quizzes and explains, and the "framework" is the set of key concepts/steps to remember. Build the spec around THAT specific situation. For a role-play scenario the persona is the other party; for a tutoring/recap scenario the persona is the tutor and the levels ramp from gentle recap to harder recall quizzing.',
    '',
    i.skill ? `Focus skill (if given): ${i.skill}.` : '',
    `Requested difficulty: ${i.difficulty}. Working title (rename freely to fit the request): ${i.title || '(none)'}.`,
    i.personaHint ? `Extra notes on who they\'re up against: ${i.personaHint}` : '',
    '',
    'Design:',
    '- objective + hook: one line each, SPECIFIC to the user\'s scenario (mention their actual situation, not a generic one).',
    '- A short memorable FRAMEWORK (3-5 moves) the user must learn to succeed at THEIR goal. Name it for the skill. Each move: step, intent, keyLine (an example line the USER would say in THEIR scenario).',
    '- A PERSONA = the OTHER PARTY from the request (alias = a realistic name + their role; personaPrompt = free-text capturing their attitude/role/context; pick ONE fitting prebuilt Gemini voice name for voiceName — e.g. Charon, Puck, Kore, Aoede, Fenrir).',
    '- A LEVELS ladder (1-5, easiest->hardest) — YOU decide how many based on complexity. Each level: id, label, difficultyPrompt (how the persona behaves at that level, in THIS scenario), advanceScore (0-10 to advance; harder levels need higher).',
    '- workedExamples (one good, optionally one to avoid) IN THE USER\'S SCENARIO, guidedPracticePrompts, and expectations.',
    '',
    'Return ONLY a JSON object (optionally fenced in ```json) with EXACTLY these fields:',
    'skillId, title, objective, hook, coreFramework{name, moves[{step,intent,keyLine}]}, mnemonic,',
    'workedExamples[{label:"good"|"avoid", dialogue[], whyNotes[]}], guidedPracticePrompts[], expectations[],',
    'persona{alias, voiceName, personaPrompt}, levels[{id,label,difficultyPrompt,advanceScore}].',
    'No prose outside the JSON.',
  ].filter(Boolean).join('\n');
}

export interface ParseResult {
  ok: boolean;
  spec?: TrainingSpec;
  error?: string;
}

const slug = (s: string) =>
  (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'level';

/**
 * REPAIR a near-valid generated spec so a small model omission (a level missing
 * difficultyPrompt, a non-numeric advanceScore, no levels at all, etc.) doesn't
 * reject the WHOLE training. The model usually gets the substance right; we fill
 * the structural gaps with sensible defaults rather than failing. Mutates a copy.
 */
export function normalizeGeneratedSpec(obj: any): any {
  const o = { ...(obj || {}) };

  // Framework moves — ensure each has step/intent/keyLine strings.
  if (o.coreFramework && Array.isArray(o.coreFramework.moves)) {
    o.coreFramework = {
      ...o.coreFramework,
      name: typeof o.coreFramework.name === 'string' && o.coreFramework.name.trim()
        ? o.coreFramework.name : 'Framework',
      moves: o.coreFramework.moves.map((m: any, i: number) => ({
        step: String(m?.step ?? `Step ${i + 1}`),
        intent: String(m?.intent ?? ''),
        keyLine: String(m?.keyLine ?? ''),
      })),
    };
  }

  // Persona — coerce alias/personaPrompt to strings.
  if (o.persona) {
    o.persona = {
      ...o.persona,
      alias: String(o.persona.alias ?? 'Coach'),
      personaPrompt: String(o.persona.personaPrompt ?? o.objective ?? 'A helpful practice partner.'),
      voiceName: o.persona.voiceName ?? 'Aoede',
    };
  }

  // Levels — the common failure. Repair each level; if none, synthesize a ladder.
  const DEFAULT_LABELS = ['Warmup', 'Standard', 'Tough', 'Expert', 'Mastery'];
  let levels: any[] = Array.isArray(o.levels) ? o.levels : [];
  if (levels.length === 0) {
    levels = [
      { label: 'Warmup', difficultyPrompt: 'Be gentle and supportive.', advanceScore: 6 },
      { label: 'Standard', difficultyPrompt: 'Normal difficulty.', advanceScore: 7 },
      { label: 'Tough', difficultyPrompt: 'Be demanding and push back.', advanceScore: 8 },
    ];
  }
  o.levels = levels.slice(0, 5).map((lv: any, i: number) => {
    const label = typeof lv?.label === 'string' && lv.label.trim() ? lv.label : (DEFAULT_LABELS[i] || `Level ${i + 1}`);
    const idStr = typeof lv?.id === 'string' && lv.id.trim() ? lv.id : slug(`${label}-${i + 1}`);
    const diff = typeof lv?.difficultyPrompt === 'string' && lv.difficultyPrompt.trim()
      ? lv.difficultyPrompt
      : `Difficulty ${i + 1} of ${Math.max(levels.length, 1)}.`;
    let adv = Number(lv?.advanceScore);
    if (!Number.isFinite(adv)) adv = 6 + i;            // ramp 6,7,8…
    adv = Math.max(0, Math.min(10, adv));
    return { id: idStr, label, difficultyPrompt: diff, advanceScore: adv };
  });

  // Arrays that downstream code maps over — guarantee they exist.
  if (!Array.isArray(o.workedExamples)) o.workedExamples = [];
  if (!Array.isArray(o.guidedPracticePrompts)) o.guidedPracticePrompts = [];
  if (!Array.isArray(o.expectations)) o.expectations = [];
  if (typeof o.mnemonic !== 'string') o.mnemonic = o.coreFramework?.name ?? '';
  if (typeof o.hook !== 'string') o.hook = '';
  if (typeof o.skillId !== 'string' || !o.skillId.trim()) o.skillId = slug(o.title || 'custom-training');

  return o;
}

export function parseGeneratedSpec(reply: string, id: string): ParseResult {
  const json = extractJson(reply);
  if (!json) return { ok: false, error: 'no JSON object found in reply' };
  let obj: any;
  try { obj = JSON.parse(json); } catch { return { ok: false, error: 'JSON parse error' }; }
  // Repair near-misses (e.g. a level missing difficultyPrompt) BEFORE validating,
  // so the whole training isn't rejected over a small structural gap.
  const repaired = normalizeGeneratedSpec(obj);
  const candidate = { ...repaired, id, type: 'custom' as const };
  const v = validateTrainingSpec(candidate);
  if (!v.ok) return { ok: false, error: v.error };
  return { ok: true, spec: candidate as TrainingSpec };
}

export function extractJson(s: string): string | null {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) return s.slice(first, last + 1);
  return null;
}

export interface GenerateResult {
  ok: boolean;
  spec?: TrainingSpec;
  error?: string;
}

/**
 * Generate a custom TrainingSpec end-to-end: build the prompt, call Gemini
 * (non-live text model), parse + repair the reply. On a parse failure, retries
 * ONCE with a corrective nudge appended demanding valid JSON.
 */
export async function generateCustomSpec(input: SpecGenInput, id: string): Promise<GenerateResult> {
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const basePrompt = buildSpecGenerationPrompt(input);

  const askModel = async (prompt: string): Promise<string> => {
    const response = await ai.models.generateContent({
      model: config.summarizerModel,
      contents: prompt,
    });
    return response.text ?? '';
  };

  // First attempt.
  let reply = '';
  try {
    reply = await askModel(basePrompt);
  } catch (err) {
    return { ok: false, error: `model call failed: ${String((err as Error)?.message ?? err)}` };
  }
  let parsed = parseGeneratedSpec(reply, id);
  if (parsed.ok) return parsed;

  // Retry ONCE with a corrective nudge.
  const retryPrompt =
    basePrompt +
    '\n\nYour previous reply was not valid JSON. Return ONLY the JSON object.';
  try {
    reply = await askModel(retryPrompt);
  } catch (err) {
    return { ok: false, error: `model call failed on retry: ${String((err as Error)?.message ?? err)}` };
  }
  parsed = parseGeneratedSpec(reply, id);
  return parsed;
}
