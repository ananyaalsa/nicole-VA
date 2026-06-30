import { describe, it, expect } from 'vitest';
import { detectLanguage } from './detectLanguage.js';

describe('detectLanguage', () => {
  it('returns null for plain English', () => {
    expect(detectLanguage('How are you doing today?')).toBeNull();
    expect(detectLanguage('Open my training module please')).toBeNull();
  });

  it('returns null for empty / whitespace', () => {
    expect(detectLanguage('')).toBeNull();
    expect(detectLanguage('   ')).toBeNull();
  });

  it('detects Devanagari as Hindi', () => {
    expect(detectLanguage('चलो हिंदी में बात करो।')).toBe('Hindi');
    expect(detectLanguage('मेरे बारे में बताओ')).toBe('Hindi');
  });

  it('detects romanized Hindi (Hinglish) on 2+ markers', () => {
    expect(detectLanguage('Haan bilkul, main aapki madad kar sakti hoon')).toBe('Hindi');
    expect(detectLanguage('Koi topic hai dimaag mein, ya aise hi baat karein?')).toBe('Hindi');
  });

  it('does not flip on a single stray loanword', () => {
    // One marker word in an English sentence should stay English.
    expect(detectLanguage('Can you say hai to my friend')).toBeNull();
  });

  it('detects Spanish on 2+ markers', () => {
    expect(detectLanguage('Claro que sí, podemos hablar en español')).toBe('Spanish');
  });

  it('detects French on 2+ markers', () => {
    expect(detectLanguage('Bonjour, comment allez vous, on peut parler')).toBe('French');
  });

  it('detects other scripts', () => {
    expect(detectLanguage('こんにちは')).toBe('Japanese');
    expect(detectLanguage('안녕하세요')).toBe('Korean');
    expect(detectLanguage('Здравствуйте')).toBe('Russian');
    expect(detectLanguage('مرحبا كيف حالك')).toBe('Arabic');
  });
});
