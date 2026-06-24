import { describe, it, expect } from 'vitest';
import { VOICES, DEFAULT_VOICE } from './voices';
import type { Voice } from './voices';

const EXPECTED_NAMES = [
  'Aoede',
  'Kore',
  'Leda',
  'Zephyr',
  'Charon',
  'Fenrir',
  'Orus',
  'Puck',
];

describe('VOICES', () => {
  it('contains exactly 8 voices', () => {
    expect(VOICES).toHaveLength(8);
  });

  it('contains all 8 expected voice names', () => {
    const names = VOICES.map((v) => v.name);
    for (const expected of EXPECTED_NAMES) {
      expect(names).toContain(expected);
    }
  });

  it('has the exact set of names (no extras)', () => {
    const names = VOICES.map((v) => v.name).sort();
    expect(names).toEqual([...EXPECTED_NAMES].sort());
  });

  it('has unique names', () => {
    const names = VOICES.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('each voice has a non-empty stylePrompt', () => {
    for (const v of VOICES) {
      expect(typeof v.stylePrompt).toBe('string');
      expect(v.stylePrompt.trim().length).toBeGreaterThan(0);
    }
  });

  it('each voice has a non-empty label', () => {
    for (const v of VOICES) {
      expect(typeof v.label).toBe('string');
      expect(v.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('each voice has a valid gender', () => {
    for (const v of VOICES) {
      expect(['female', 'male']).toContain(v.gender);
    }
  });

  it('has 4 female and 4 male voices', () => {
    const female = VOICES.filter((v) => v.gender === 'female');
    const male = VOICES.filter((v) => v.gender === 'male');
    expect(female).toHaveLength(4);
    expect(male).toHaveLength(4);
  });

  it('classifies the expected female voices', () => {
    const female = VOICES.filter((v) => v.gender === 'female').map((v) => v.name);
    for (const name of ['Aoede', 'Kore', 'Leda', 'Zephyr']) {
      expect(female).toContain(name);
    }
  });

  it('classifies the expected male voices', () => {
    const male = VOICES.filter((v) => v.gender === 'male').map((v) => v.name);
    for (const name of ['Charon', 'Fenrir', 'Orus', 'Puck']) {
      expect(male).toContain(name);
    }
  });

  it('exposes Aoede as the default voice', () => {
    expect(DEFAULT_VOICE).toBe('Aoede');
    expect(VOICES.map((v: Voice) => v.name)).toContain(DEFAULT_VOICE);
  });
});
