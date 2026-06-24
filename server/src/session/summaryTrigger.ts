// src/session/summaryTrigger.ts
//
// Decides WHEN to summarize a running conversation and HOW to split it into the
// older slice (to be compressed into a summary) versus the recent slice (kept
// verbatim for immediate context).

import type { Turn } from '../types.js';

/** Number of recent turns always kept verbatim (never summarized). */
const KEEP_RECENT_TURNS = 8;

/** Turn-count threshold at/above which we summarize. */
const TURN_THRESHOLD = 40;

/** Estimated-token threshold at/above which we summarize. */
const TOKEN_THRESHOLD = 12000;

/**
 * estimateTokens: rough token estimate for `text`, ~4 chars per token, rounded
 * up. Cheap and deterministic — good enough to trigger summarization without
 * calling a tokenizer.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * shouldSummarize: true when the conversation has grown past either threshold —
 * too many turns OR too many estimated tokens.
 */
export function shouldSummarize(turnCount: number, estTokens: number): boolean {
  return turnCount >= TURN_THRESHOLD || estTokens >= TOKEN_THRESHOLD;
}

/**
 * splitForSummary: keep the LAST KEEP_RECENT_TURNS turns verbatim in `toKeep`,
 * and put everything earlier into `toSummarize`. With <= KEEP_RECENT_TURNS
 * turns, nothing is summarized and all turns are kept.
 */
export function splitForSummary(turns: Turn[]): {
  toSummarize: Turn[];
  toKeep: Turn[];
} {
  if (turns.length <= KEEP_RECENT_TURNS) {
    return { toSummarize: [], toKeep: turns.slice() };
  }
  const splitAt = turns.length - KEEP_RECENT_TURNS;
  return {
    toSummarize: turns.slice(0, splitAt),
    toKeep: turns.slice(splitAt),
  };
}
