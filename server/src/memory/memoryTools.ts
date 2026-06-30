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
            'The TOPIC this fact belongs to, so memories are organised and accumulate ' +
            'by area. Use a short, consistent label like "business", "travel", "weather", ' +
            '"goal", "people", "preference", "health", "finance", or "identity". Reuse the ' +
            'SAME label for related facts so they group together (all weather facts under ' +
            '"weather", etc.). Always set this.',
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
 * Turn a fact into a key from its first few words. When save_memory is called
 * WITHOUT an explicit key we append a short time-based suffix so each new fact is
 * its OWN row and ACCUMULATES (rather than overwriting a same-slug fact). This is
 * what lets "all the weather things" build up one by one. An EXPLICIT key (passed
 * by Nicole) still overwrites — that's how she updates a known fact like "name".
 */
function slugifyFact(fact: string): string {
  const slug = fact
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('-');
  const suffix = Date.now().toString(36).slice(-5);
  return `${slug || 'fact'}-${suffix}`;
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
