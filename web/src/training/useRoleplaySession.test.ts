import { describe, it, expect } from 'vitest';
import { buildRoleplayOverlay } from './useRoleplaySession';
import type { PersonaOption, ScenarioOption } from './trainingApi';

const persona: PersonaOption = {
  id: 'cardone',
  name: 'Grant Cardone',
  tagline: 'Aggressive',
  systemOverlay: '[COACH PERSONA — GRANT CARDONE] be tough',
  voiceName: 'Fenrir',
  characterAlias: 'Grant',
};
const scenario: ScenarioOption = {
  id: 'cold_call',
  name: 'Cold Call',
  description: 'busy prospect',
  prospectOverlay: '[SCENARIO — COLD CALL] you are busy',
};

describe('buildRoleplayOverlay', () => {
  it('includes the persona overlay, scenario overlay, and the character alias', () => {
    const out = buildRoleplayOverlay(persona, scenario);
    expect(out).toContain('Grant');
    expect(out).toContain('[COACH PERSONA — GRANT CARDONE]');
    expect(out).toContain('[SCENARIO — COLD CALL]');
  });

  it('instructs the model to stay in character and NOT coach', () => {
    const out = buildRoleplayOverlay(persona, scenario);
    expect(out).toMatch(/in character/i);
    expect(out).toMatch(/do NOT coach/i);
    expect(out).toMatch(/never introduce yourself as Nicole/i);
  });

  it('folds in extra free-text when provided (custom persona/scenario)', () => {
    const out = buildRoleplayOverlay(persona, scenario, 'EXTRA CUSTOM CONTEXT');
    expect(out).toContain('EXTRA CUSTOM CONTEXT');
  });
});
