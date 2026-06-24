// Client for the Nicole 2.0 training/roleplay backend API.
// Talks to the server's /api/training/* routes.

const HTTP_BASE =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_SERVER_HTTP ?? 'http://localhost:4000';

export interface PersonaOption {
  id: string;
  name: string;
  tagline: string;
  systemOverlay: string;
  voiceName: string;
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
  rubric: string;
}
export interface ProfileDef {
  id: string;
  name: string;
  blurb: string;
  personas: PersonaOption[];
  scenarios: ScenarioOption[];
  dimensions: DimensionDef[];
  allowCustomPersona: boolean;
  allowCustomScenario: boolean;
}

export interface TrainingMove {
  step: string;
  intent: string;
  keyLine: string;
}
export interface TrainingSpec {
  id: string;
  type: 'authored' | 'custom';
  skillId: string;
  title: string;
  objective: string;
  hook: string;
  coreFramework: { name: string; moves: TrainingMove[] };
  mnemonic: string;
  workedExamples: { label: 'good' | 'avoid'; dialogue: string[]; whyNotes: string[] }[];
  guidedPracticePrompts: string[];
  expectations: string[];
  persona: { alias: string; voiceName?: string; personaPrompt: string };
  levels: { id: string; label: string; difficultyPrompt: string; advanceScore: number }[];
}

export interface TrainingRun {
  id: number;
  userId: string;
  kind: 'roleplay' | 'training';
  profileId: string | null;
  personaId: string | null;
  scenarioId: string | null;
  title: string;
  score: number | null;
  scorecard: unknown;
  transcript: string | null;
  createdAt: string;
}

/** Fetch the full profile list (Sales / Interview / Custom) with personas + scenarios. */
export async function fetchProfiles(): Promise<ProfileDef[]> {
  const res = await fetch(`${HTTP_BASE}/api/training/profiles`);
  if (!res.ok) throw new Error(`profiles ${res.status}`);
  const data = await res.json();
  return data.profiles ?? [];
}

/** Generate a custom training spec from the user's described goal. */
export async function generateCustomSpec(input: {
  dictation?: string;
  skill?: string;
  difficulty?: string;
  title?: string;
  personaHint?: string;
}): Promise<{ ok: boolean; spec?: TrainingSpec; error?: string }> {
  const res = await fetch(`${HTTP_BASE}/api/training/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return res.json();
}

/** List past training/roleplay runs (newest first). */
export async function fetchHistory(): Promise<TrainingRun[]> {
  const res = await fetch(`${HTTP_BASE}/api/training/history`);
  if (!res.ok) throw new Error(`history ${res.status}`);
  const data = await res.json();
  return data.runs ?? [];
}

/** Persist a finished run with its scorecard. */
export async function saveRun(run: {
  kind: 'roleplay' | 'training';
  profileId?: string;
  personaId?: string;
  scenarioId?: string;
  title: string;
  score?: number;
  scorecard?: unknown;
  transcript?: string;
}): Promise<{ id: number }> {
  const res = await fetch(`${HTTP_BASE}/api/training/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(run),
  });
  if (!res.ok) throw new Error(`saveRun ${res.status}`);
  return res.json();
}
