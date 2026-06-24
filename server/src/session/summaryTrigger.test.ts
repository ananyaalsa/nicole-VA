import { describe, it, expect } from 'vitest';
import type { Turn } from '../types.js';
import {
  estimateTokens,
  shouldSummarize,
  splitForSummary,
} from './summaryTrigger.js';

describe('estimateTokens', () => {
  it('estimates ~length/4 rounded up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('shouldSummarize', () => {
  it('false below both thresholds', () => {
    expect(shouldSummarize(39, 11_999)).toBe(false);
  });

  it('true at turn threshold', () => {
    expect(shouldSummarize(40, 0)).toBe(true);
  });

  it('true above turn threshold', () => {
    expect(shouldSummarize(41, 0)).toBe(true);
  });

  it('true at token threshold', () => {
    expect(shouldSummarize(0, 12_000)).toBe(true);
  });

  it('true above token threshold', () => {
    expect(shouldSummarize(0, 12_001)).toBe(true);
  });
});

function makeTurns(n: number): Turn[] {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'nicole',
    text: `turn ${i}`,
  }));
}

describe('splitForSummary', () => {
  it('empty array → both empty', () => {
    const { toSummarize, toKeep } = splitForSummary([]);
    expect(toSummarize).toEqual([]);
    expect(toKeep).toEqual([]);
  });

  it('exactly 8 turns → toSummarize empty, all kept', () => {
    const turns = makeTurns(8);
    const { toSummarize, toKeep } = splitForSummary(turns);
    expect(toSummarize).toEqual([]);
    expect(toKeep).toEqual(turns);
  });

  it('fewer than 8 turns → toSummarize empty, all kept', () => {
    const turns = makeTurns(3);
    const { toSummarize, toKeep } = splitForSummary(turns);
    expect(toSummarize).toEqual([]);
    expect(toKeep).toEqual(turns);
  });

  it('more than 8 turns → keeps last 8, summarizes the rest', () => {
    const turns = makeTurns(12);
    const { toSummarize, toKeep } = splitForSummary(turns);
    expect(toKeep).toHaveLength(8);
    expect(toSummarize).toHaveLength(4);
    expect(toSummarize).toEqual(turns.slice(0, 4));
    expect(toKeep).toEqual(turns.slice(4));
  });
});
