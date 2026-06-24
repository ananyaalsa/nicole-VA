import { describe, it, expect, beforeEach, vi } from 'vitest';

// Config loads at import time — give it the env it needs.
process.env.GEMINI_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://x';

// Mock the Gemini SDK. `vi.hoisted` exposes the mock to the hoisted factory.
const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

import {
  buildSpecGenerationPrompt,
  parseGeneratedSpec,
  generateCustomSpec,
  type SpecGenInput,
} from './specGenerator.js';

const baseInput: SpecGenInput = {
  dictation: 'I want to practice negotiating my salary with a tough CFO.',
  skill: 'salary negotiation',
  difficulty: 'hard',
  title: 'Salary Negotiation',
};

// A spec the model would return that is MISSING the levels array — the
// normalizer should synthesize a ladder so it still validates.
function specWithoutLevels(): Record<string, unknown> {
  return {
    skillId: 'salary-negotiation',
    title: 'Salary Negotiation',
    objective: 'Negotiate a higher offer with a tough CFO.',
    hook: 'The first number is rarely the best number.',
    coreFramework: {
      name: 'ANCHOR',
      moves: [{ step: 'Anchor', intent: 'Set a high target', keyLine: 'Based on my impact, I was targeting X.' }],
    },
    mnemonic: 'ANCHOR',
    workedExamples: [],
    guidedPracticePrompts: [],
    expectations: [],
    persona: { alias: 'CFO Dana', voiceName: 'Charon', personaPrompt: 'A budget-conscious CFO.' },
    // no "levels" on purpose
  };
}

describe('training/specGenerator', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  describe('buildSpecGenerationPrompt', () => {
    it("includes the user's request text", () => {
      const prompt = buildSpecGenerationPrompt(baseInput);
      expect(prompt).toContain('I want to practice negotiating my salary with a tough CFO.');
      expect(prompt).toContain('salary negotiation');
    });
  });

  describe('parseGeneratedSpec', () => {
    it('repairs a spec missing levels (synthesizes a ladder) and returns ok', () => {
      const reply = JSON.stringify(specWithoutLevels());
      const r = parseGeneratedSpec(reply, 'custom-salary-1');
      expect(r.ok).toBe(true);
      expect(r.spec).toBeDefined();
      expect(r.spec!.id).toBe('custom-salary-1');
      expect(r.spec!.type).toBe('custom');
      expect(r.spec!.levels.length).toBeGreaterThanOrEqual(1);
      // Synthesized ladder advanceScores are within bounds.
      for (const lv of r.spec!.levels) {
        expect(lv.advanceScore).toBeGreaterThanOrEqual(0);
        expect(lv.advanceScore).toBeLessThanOrEqual(10);
      }
    });

    it('returns an error when no JSON is present', () => {
      const r = parseGeneratedSpec('totally not json', 'x');
      expect(r.ok).toBe(false);
    });
  });

  describe('generateCustomSpec', () => {
    it('returns ok with the spec when the model returns valid JSON', async () => {
      mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify(specWithoutLevels()) });
      const r = await generateCustomSpec(baseInput, 'custom-salary-2');
      expect(r.ok).toBe(true);
      expect(r.spec?.id).toBe('custom-salary-2');
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('succeeds on the 2nd attempt when the first reply is junk', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({ text: 'sorry, here is no json at all' })
        .mockResolvedValueOnce({ text: JSON.stringify(specWithoutLevels()) });

      const r = await generateCustomSpec(baseInput, 'custom-salary-3');
      expect(r.ok).toBe(true);
      expect(r.spec?.id).toBe('custom-salary-3');
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);

      // The retry prompt carries the corrective nudge.
      const retryPrompt = mockGenerateContent.mock.calls[1][0].contents as string;
      expect(retryPrompt).toContain('Return ONLY the JSON object.');
    });

    it('fails after retry when both replies are junk', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({ text: 'nope' })
        .mockResolvedValueOnce({ text: 'still nope' });
      const r = await generateCustomSpec(baseInput, 'custom-salary-4');
      expect(r.ok).toBe(false);
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });
  });
});
