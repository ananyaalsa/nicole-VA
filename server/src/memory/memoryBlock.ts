import type { MemoryFact } from '../types.js';

/**
 * Render the durable memory facts as a system-prompt block. Empty input yields
 * an empty string (so callers can append it unconditionally). Each fact becomes
 * a bullet line, optionally prefixed with its key for clarity.
 */
export function formatMemoryBlock(facts: MemoryFact[]): string {
  if (facts.length === 0) return '';

  const lines = facts.map((f) => {
    const text = f.key ? `${f.key}: ${f.fact}` : f.fact;
    return `- ${text}`;
  });

  return `[MEMORY] Things you already know about this user:\n${lines.join('\n')}`;
}
