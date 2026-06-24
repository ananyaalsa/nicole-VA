import { describe, it, expect } from 'vitest';
import { listProfiles, getProfile, getPersona, getScenario } from './profiles.js';

describe('training/profiles', () => {
  it('listProfiles returns sales + interview + custom', () => {
    const ids = listProfiles().map((p) => p.id);
    expect(ids).toContain('sales');
    expect(ids).toContain('interview');
    expect(ids).toContain('custom');
    expect(ids).toHaveLength(3);
  });

  it('sales profile has cardone / belfort / wolf personas', () => {
    const personaIds = getProfile('sales').personas.map((p) => p.id);
    expect(personaIds).toEqual(['cardone', 'belfort', 'wolf']);
  });

  it("getPersona('sales','cardone').voiceName === 'Fenrir'", () => {
    const p = getPersona('sales', 'cardone');
    expect(p).toBeDefined();
    expect(p?.voiceName).toBe('Fenrir');
  });

  it("getScenario('sales','cold_call') has a prospectOverlay", () => {
    const s = getScenario('sales', 'cold_call');
    expect(s).toBeDefined();
    expect(typeof s?.prospectOverlay).toBe('string');
    expect(s!.prospectOverlay.length).toBeGreaterThan(0);
  });

  it('interview profile has tech_recruiter + ceo_interviewer personas', () => {
    const personaIds = getProfile('interview').personas.map((p) => p.id);
    expect(personaIds).toEqual(['tech_recruiter', 'ceo_interviewer']);
  });

  it('interview profile has behavioral_30min + why_us_why_you scenarios', () => {
    const scenarioIds = getProfile('interview').scenarios.map((s) => s.id);
    expect(scenarioIds).toEqual(['behavioral_30min', 'why_us_why_you']);
  });

  it('custom profile has blank persona + blank scenario', () => {
    const custom = getProfile('custom');
    expect(custom.personas.map((p) => p.id)).toEqual(['blank']);
    expect(custom.scenarios.map((s) => s.id)).toEqual(['blank']);
  });

  it('getPersona returns undefined for an unknown persona', () => {
    expect(getPersona('sales', 'nope')).toBeUndefined();
  });
});
