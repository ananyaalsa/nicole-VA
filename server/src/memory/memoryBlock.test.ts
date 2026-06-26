import { describe, it, expect } from 'vitest';
import type { MemoryFact } from '../types.js';
import { formatMemoryBlock } from './memoryBlock.js';

describe('formatMemoryBlock', () => {
  it('renders the three provenance blocks even with no facts (so gaps cannot invite fabrication)', () => {
    const block = formatMemoryBlock([]);
    expect(block).toContain('[WHAT YOU KNOW ABOUT THEM]');
    expect(block).toContain('[LEARNED IN CONVERSATION]');
    expect(block).toContain('[RECENT ACTIVITY]');
    // Empty conversation/activity blocks render an explicit placeholder.
    expect(block).toMatch(/nothing yet/i);
  });

  it('puts profile (source=settings) facts under [WHAT YOU KNOW ABOUT THEM]', () => {
    const facts: MemoryFact[] = [
      { userId: 'u1', key: 'user_about', fact: 'Runs a coffee shop', factType: 'preference', source: 'settings' },
    ];
    const block = formatMemoryBlock(facts);
    const knowIdx = block.indexOf('[WHAT YOU KNOW ABOUT THEM]');
    const learnedIdx = block.indexOf('[LEARNED IN CONVERSATION]');
    expect(knowIdx).toBeGreaterThanOrEqual(0);
    // "Runs a coffee shop" appears in the KNOW block (before the LEARNED header).
    const aboutIdx = block.indexOf('Runs a coffee shop');
    expect(aboutIdx).toBeGreaterThan(knowIdx);
    expect(aboutIdx).toBeLessThan(learnedIdx);
  });

  it('puts conversationally-learned facts under [LEARNED IN CONVERSATION] with a date', () => {
    const facts: MemoryFact[] = [
      { userId: 'u1', key: 'pref', fact: 'Prefers concise answers', factType: 'preference', source: 'inferred', updatedAt: '2026-06-20T00:00:00.000Z' },
    ];
    const block = formatMemoryBlock(facts);
    const learnedIdx = block.indexOf('[LEARNED IN CONVERSATION]');
    const factIdx = block.indexOf('Prefers concise answers');
    expect(factIdx).toBeGreaterThan(learnedIdx);
    expect(block).toContain('2026-06-20');
  });

  it('renders display name / email and activity lines from extras', () => {
    const block = formatMemoryBlock([], {
      displayName: 'Maya',
      email: 'maya@x.io',
      activityLines: ['Total: 2 roleplay sessions completed.'],
    });
    expect(block).toContain('Name: Maya');
    expect(block).toContain('Email: maya@x.io');
    expect(block).toContain('2 roleplay sessions');
  });

  it('renders a [LIVE STATUS] line when provided', () => {
    const block = formatMemoryBlock([], { liveStatusLine: 'User just finished a Roleplay (Pricing call) 1 min ago — scored 6.4/10.' });
    expect(block).toContain('[LIVE STATUS]');
    expect(block).toContain('just finished a Roleplay');
  });
});
