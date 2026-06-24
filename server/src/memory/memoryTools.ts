import { saveFact, forgetFact } from './db.js';

/** A Gemini function-declaration parameter schema (subset we use). */
interface ToolParams {
  type: 'object';
  properties: Record<string, { type: string; description?: string }>;
  required: string[];
}

/** A Gemini function declaration. */
interface ToolDecl {
  name: string;
  description: string;
  parameters: ToolParams;
}

/**
 * Gemini function declarations exposing durable memory to Nicole. She calls
 * these to persist or remove things she learns about the user across sessions.
 */
export const MEMORY_TOOL_DECLS: ToolDecl[] = [
  {
    name: 'save_memory',
    description:
      'Persist a durable fact about the user so you remember it in future ' +
      'conversations (e.g. their name, business, goals, preferences). Call ' +
      'this proactively whenever you learn something worth remembering.',
    parameters: {
      type: 'object',
      properties: {
        fact: {
          type: 'string',
          description: 'The fact to remember, in a short natural sentence.',
        },
        key: {
          type: 'string',
          description:
            'Optional stable key for this fact (e.g. "name", "business"). ' +
            'Saving with an existing key overwrites the previous value.',
        },
        factType: {
          type: 'string',
          description:
            'Optional category, e.g. "identity", "business", "goal", "preference".',
        },
      },
      required: ['fact'],
    },
  },
  {
    name: 'forget_memory',
    description:
      'Remove a previously saved fact about the user by its key (e.g. when ' +
      'the user asks you to forget something or corrects an earlier fact).',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'The key of the fact to forget.',
        },
      },
      required: ['key'],
    },
  },
];

/**
 * Turn a fact into a stable slug key from its first few words. Used when
 * save_memory is called without an explicit key.
 */
function slugifyFact(fact: string): string {
  const slug = fact
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('-');
  return slug || 'fact';
}

/**
 * Dispatch a memory tool call from Gemini to the DB layer. Returns
 * `{ ok: true }` on success and `{ ok: false }` for unknown tools.
 */
export async function handleMemoryTool(
  name: string,
  args: any,
  userId: string,
): Promise<{ ok: boolean }> {
  switch (name) {
    case 'save_memory': {
      await saveFact({
        userId,
        key: args.key ?? slugifyFact(args.fact ?? ''),
        fact: args.fact,
        factType: args.factType,
      });
      return { ok: true };
    }
    case 'forget_memory': {
      await forgetFact(userId, args.key);
      return { ok: true };
    }
    default:
      return { ok: false };
  }
}
