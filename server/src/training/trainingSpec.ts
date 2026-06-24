/**
 * TrainingSpec — the shape of an authored or AI-generated training (ported from
 * CHAT). In CHAT this extended ClientLessonSpec; here the needed lesson fields
 * are inlined so the server has no React/frontend dependency.
 */

export interface ClientMove {
  step: string;
  intent: string;
  keyLine: string;
}

export interface WorkedExample {
  label: 'good' | 'avoid';
  dialogue: string[];
  whyNotes: string[];
}

export interface TrainingPersona {
  alias: string;
  voiceName?: string;
  personaPrompt: string;
}

export interface TrainingLevel {
  id: string;
  label: string;
  difficultyPrompt: string;
  advanceScore: number;
}

export interface TrainingSpec {
  // Lesson fields (inlined from ClientLessonSpec).
  skillId: string;
  title: string;
  objective: string;
  hook: string;
  coreFramework: { name: string; moves: ClientMove[] };
  mnemonic: string;
  workedExamples: WorkedExample[];
  guidedPracticePrompts: string[];
  expectations: string[];

  // Training-specific fields.
  id: string;
  type: 'authored' | 'custom';
  createdBy?: string;
  createdAt?: string;
  persona: TrainingPersona;
  levels: TrainingLevel[];
  language?: string;
  sourceDictation?: string;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export function validateTrainingSpec(s: any): ValidationResult {
  if (!s || typeof s !== 'object') return { ok: false, error: 'spec is not an object' };
  for (const f of ['id', 'skillId', 'title', 'objective'] as const) {
    if (typeof s[f] !== 'string' || !s[f].trim()) return { ok: false, error: `missing ${f}` };
  }
  if (!s.coreFramework || !Array.isArray(s.coreFramework.moves) || s.coreFramework.moves.length < 1) {
    return { ok: false, error: 'coreFramework.moves must have at least one move' };
  }
  if (!s.persona || typeof s.persona.alias !== 'string' || typeof s.persona.personaPrompt !== 'string') {
    return { ok: false, error: 'persona.alias and persona.personaPrompt are required' };
  }
  if (!Array.isArray(s.levels) || s.levels.length < 1 || s.levels.length > 5) {
    return { ok: false, error: 'levels must be 1-5 entries' };
  }
  for (const lv of s.levels) {
    if (typeof lv.id !== 'string' || typeof lv.label !== 'string' || typeof lv.difficultyPrompt !== 'string') {
      return { ok: false, error: 'each level needs id + label + difficultyPrompt' };
    }
    if (typeof lv.advanceScore !== 'number' || lv.advanceScore < 0 || lv.advanceScore > 10) {
      return { ok: false, error: 'each level advanceScore must be 0-10' };
    }
  }
  return { ok: true };
}
