import { describe, it, expect, beforeEach, vi } from 'vitest';

// Ensure config loads without a real environment (db.js imports config).
process.env.GEMINI_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://x';

const { saveFact, forgetFact } = vi.hoisted(() => ({
  saveFact: vi.fn(async () => ({ ok: true })),
  forgetFact: vi.fn(async () => undefined),
}));
vi.mock('./db.js', () => ({ saveFact, forgetFact }));

import { MEMORY_TOOL_DECLS, handleMemoryTool } from './memoryTools.js';

describe('MEMORY_TOOL_DECLS', () => {
  it('declares both save_memory and forget_memory', () => {
    const names = MEMORY_TOOL_DECLS.map((d) => d.name);
    expect(names).toContain('save_memory');
    expect(names).toContain('forget_memory');
  });

  it('save_memory requires fact and forget_memory requires key', () => {
    const save = MEMORY_TOOL_DECLS.find((d) => d.name === 'save_memory')!;
    expect(save.parameters.type).toBe('object');
    expect(save.parameters.required).toContain('fact');
    expect(Object.keys(save.parameters.properties)).toEqual(
      expect.arrayContaining(['fact', 'key', 'factType']),
    );

    const forget = MEMORY_TOOL_DECLS.find((d) => d.name === 'forget_memory')!;
    expect(forget.parameters.required).toContain('key');
    expect(Object.keys(forget.parameters.properties)).toContain('key');
  });
});

describe('handleMemoryTool', () => {
  beforeEach(() => {
    saveFact.mockClear();
    forgetFact.mockClear();
  });

  it('save_memory calls saveFact with userId, fact, factType and a key', async () => {
    const result = await handleMemoryTool(
      'save_memory',
      { fact: 'User loves espresso', factType: 'preference' },
      'u1',
    );
    expect(result).toEqual({ ok: true });
    expect(saveFact).toHaveBeenCalledTimes(1);
    const arg = saveFact.mock.calls[0][0];
    expect(arg.userId).toBe('u1');
    expect(arg.fact).toBe('User loves espresso');
    expect(arg.factType).toBe('preference');
    // A key was derived from the fact when none was provided.
    expect(typeof arg.key).toBe('string');
    expect(arg.key.length).toBeGreaterThan(0);
  });

  it('save_memory uses the provided key when given', async () => {
    await handleMemoryTool('save_memory', { fact: 'x', key: 'drink' }, 'u1');
    expect(saveFact.mock.calls[0][0].key).toBe('drink');
  });

  it('forget_memory calls forgetFact with userId and key', async () => {
    const result = await handleMemoryTool('forget_memory', { key: 'drink' }, 'u1');
    expect(result).toEqual({ ok: true });
    expect(forgetFact).toHaveBeenCalledWith('u1', 'drink');
  });

  it('returns { ok: false } for an unknown tool name', async () => {
    const result = await handleMemoryTool('do_something_else', {}, 'u1');
    expect(result).toEqual({ ok: false });
    expect(saveFact).not.toHaveBeenCalled();
    expect(forgetFact).not.toHaveBeenCalled();
  });
});
