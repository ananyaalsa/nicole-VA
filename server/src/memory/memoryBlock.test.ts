import { describe, it, expect } from 'vitest';
import type { MemoryFact } from '../types.js';
import { formatMemoryBlock } from './memoryBlock.js';

describe('formatMemoryBlock', () => {
  it('returns an empty string for no facts', () => {
    expect(formatMemoryBlock([])).toBe('');
  });

  it('returns a [MEMORY] block listing each fact', () => {
    const facts: MemoryFact[] = [
      { userId: 'u1', key: 'name', fact: 'User is named Sam', factType: 'identity' },
      { userId: 'u1', key: 'business', fact: 'Runs a coffee shop', factType: 'business' },
    ];
    const block = formatMemoryBlock(facts);
    expect(block).toContain('[MEMORY]');
    expect(block).toContain('User is named Sam');
    expect(block).toContain('Runs a coffee shop');
    // Each fact is rendered on its own bullet line.
    expect(block).toMatch(/- .*User is named Sam/);
    expect(block).toMatch(/- .*Runs a coffee shop/);
  });
});
