import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import type { Turn } from '../types.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

const SUMMARY_INSTRUCTION =
  'Summarize the key facts, decisions, names, numbers, and context from this ' +
  'conversation in 4-6 concise sentences. Write it as notes Nicole can use to ' +
  'continue seamlessly. Do not add greetings.';

/**
 * Compress a list of conversational turns into a short notes-style summary that
 * Nicole can use to continue seamlessly. Returns '' for empty input without
 * touching the Gemini API.
 */
export async function summarizeTurns(turns: Turn[]): Promise<string> {
  if (turns.length === 0) return '';

  const transcript = turns
    .map((t) => `${t.role === 'user' ? 'User' : 'Nicole'}: ${t.text}`)
    .join('\n');

  const response = await ai.models.generateContent({
    model: config.summarizerModel,
    contents: `${SUMMARY_INSTRUCTION}\n\n${transcript}`,
  });

  return (response.text ?? '').trim();
}
