import { describe, it, expect } from 'vitest';
import {
  RESUME_HANDLE_MAX_AGE_MS,
  SESSION_PROACTIVE_RECONNECT_MS,
  isResumeHandleUsable,
  shouldProactiveReconnect,
} from './sessionTiming.js';

describe('constants', () => {
  it('RESUME_HANDLE_MAX_AGE_MS is 110 minutes', () => {
    expect(RESUME_HANDLE_MAX_AGE_MS).toBe(110 * 60 * 1000);
  });

  it('SESSION_PROACTIVE_RECONNECT_MS is 100 minutes', () => {
    expect(SESSION_PROACTIVE_RECONNECT_MS).toBe(100 * 60 * 1000);
  });
});

describe('isResumeHandleUsable', () => {
  it('null handle is unusable', () => {
    expect(isResumeHandleUsable(null, 1_000_000)).toBe(false);
  });

  it('fresh handle is usable', () => {
    const now = 1_000_000_000;
    const captured = now - 60_000; // 1 min ago
    expect(isResumeHandleUsable(captured, now)).toBe(true);
  });

  it('handle exactly at max age is usable (boundary)', () => {
    const now = 1_000_000_000;
    const captured = now - RESUME_HANDLE_MAX_AGE_MS;
    expect(isResumeHandleUsable(captured, now)).toBe(true);
  });

  it('expired handle is unusable', () => {
    const now = 1_000_000_000;
    const captured = now - (RESUME_HANDLE_MAX_AGE_MS + 1);
    expect(isResumeHandleUsable(captured, now)).toBe(false);
  });
});

describe('shouldProactiveReconnect', () => {
  it('true when session old enough, not speaking, usable handle', () => {
    expect(
      shouldProactiveReconnect(SESSION_PROACTIVE_RECONNECT_MS, 60_000, false),
    ).toBe(true);
  });

  it('false when speaking', () => {
    expect(
      shouldProactiveReconnect(SESSION_PROACTIVE_RECONNECT_MS, 60_000, true),
    ).toBe(false);
  });

  it('false when no handle', () => {
    expect(
      shouldProactiveReconnect(SESSION_PROACTIVE_RECONNECT_MS, null, false),
    ).toBe(false);
  });

  it('false when handle too old', () => {
    expect(
      shouldProactiveReconnect(
        SESSION_PROACTIVE_RECONNECT_MS,
        RESUME_HANDLE_MAX_AGE_MS + 1,
        false,
      ),
    ).toBe(false);
  });

  it('false when session too young', () => {
    expect(
      shouldProactiveReconnect(
        SESSION_PROACTIVE_RECONNECT_MS - 1,
        60_000,
        false,
      ),
    ).toBe(false);
  });
});
