import { describe, it, expect } from 'vitest';
import { synthesizeBrief, briefOverlay } from './roleplayBrief';
import type { PersonaOption, ScenarioOption } from './trainingApi';

const persona: PersonaOption = { id: 'grant', name: 'Grant', tagline: 'a blunt VP of Ops', systemOverlay: '', voiceName: 'Charon', characterAlias: 'Grant' };
const scenario: ScenarioOption = { id: 'cold', name: 'Cold Call', description: 'out of the blue', prospectOverlay: '' };

describe('synthesizeBrief', () => {
  it('builds who/situation/objective/context from persona + scenario', () => {
    const b = synthesizeBrief(persona, scenario, 'medium', 0);
    expect(b.who).toContain('Grant');
    expect(b.who).toContain('blunt VP of Ops');
    expect(b.situation.toLowerCase()).toContain('cold call');
    expect(b.objective.toLowerCase()).toContain('cold call');
    expect(b.context.length).toBeGreaterThan(0);
  });

  it('varies the framing with the variant index (not the same script)', () => {
    const a = synthesizeBrief(persona, scenario, 'medium', 0);
    const b = synthesizeBrief(persona, scenario, 'medium', 1);
    expect(a.situation).not.toBe(b.situation);
  });

  it('reflects difficulty in the context bullets', () => {
    const hard = synthesizeBrief(persona, scenario, 'hard', 0);
    expect(hard.context.join(' ').toLowerCase()).toMatch(/tough|pushback|objection/);
  });

  it('briefOverlay embeds the situation + objective for the prospect', () => {
    const b = synthesizeBrief(persona, scenario, 'easy', 0);
    const ov = briefOverlay(b);
    expect(ov).toContain(b.objective);
    expect(ov.toLowerCase()).toContain('scenario brief');
  });
});
