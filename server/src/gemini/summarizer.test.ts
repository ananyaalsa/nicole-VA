import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Turn } from '../types.js';

// Ensure config loads without a real environment.
process.env.GEMINI_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://x';

// Mock the Gemini SDK so no real API call is made. `vi.hoisted` makes the mock
// fn available to the hoisted `vi.mock` factory without a TDZ error.
const { generateContent } = vi.hoisted(() => ({
  generateContent: vi.fn(async () => ({ text: '  SUMMARY  ' })),
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({
    models: { generateContent },
  })),
}));

import { summarizeTurns } from './summarizer.js';

describe('summarizeTurns', () => {
  beforeEach(() => {
    generateContent.mockClear();
  });

  it('returns "" for empty turns WITHOUT calling Gemini', async () => {
    const result = await summarizeTurns([]);
    expect(result).toBe('');
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('calls generateContent with the summarizer model and returns trimmed text', async () => {
    const turns: Turn[] = [
      { role: 'user', text: 'My name is Sam.' },
      { role: 'nicole', text: 'Nice to meet you, Sam.' },
    ];
    const result = await summarizeTurns(turns);

    expect(generateContent).toHaveBeenCalledTimes(1);
    const arg = generateContent.mock.calls[0][0] as {
      model: string;
      contents: string;
    };
    expect(arg.model).toBe('gemini-2.5-flash');
    // Transcript built from the turns is included in the prompt.
    expect(arg.contents).toContain('User: My name is Sam.');
    expect(arg.contents).toContain('Nicole: Nice to meet you, Sam.');
    // Response text is trimmed.
    expect(result).toBe('SUMMARY');
  });
});
