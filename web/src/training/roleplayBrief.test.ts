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
    // The situation always references the scenario; the objective is non-empty
    // (not every objective template embeds the scenario name, which is fine).
    expect(b.situation.toLowerCase()).toContain('cold call');
    expect(b.objective.trim().length).toBeGreaterThan(0);
    expect(b.context.length).toBeGreaterThan(0);
  });

  it('varies the framing with the variant index (not the same script)', () => {
    const a = synthesizeBrief(persona, scenario, 'medium', 0);
    const b = synthesizeBrief(persona, scenario, 'medium', 1);
    expect(a.situation).not.toBe(b.situation);
  });

  it('invents a concrete role + company and varies it across re-rolls', () => {
    const a = synthesizeBrief(persona, scenario, 'medium', 0);
    const b = synthesizeBrief(persona, scenario, 'medium', 1);
    // Each brief names a role at a company (e.g. "VP of Sales at Northwind...").
    expect(a.role).toMatch(/ at /);
    expect(a.role.length).toBeGreaterThan(8);
    // A re-roll lands on a different company/role.
    expect(a.role).not.toBe(b.role);
    // The situation now references the company, not just "a prospect".
    expect(a.situation).toContain(a.role.split(' at ')[1].split(' — ')[0]);
  });

  it('the objective stays varied across re-rolls too', () => {
    const a = synthesizeBrief(persona, scenario, 'medium', 0);
    const b = synthesizeBrief(persona, scenario, 'medium', 1);
    expect(a.objective).not.toBe(b.objective);
  });

  it('briefOverlay tells the prospect their role', () => {
    const b = synthesizeBrief(persona, scenario, 'medium', 0);
    expect(briefOverlay(b)).toContain(b.role);
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
