import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStuckDetection } from './useStuckDetection';
import type { TranscriptLine } from '../engine/types';

const you = (text: string, n: number): TranscriptLine => ({ id: `y${n}`, speaker: 'you', text, streaming: false });

afterEach(() => vi.useRealTimers());

describe('useStuckDetection', () => {
  it('flags rambling when a learner turn is very long', () => {
    const long = Array(95).fill('word').join(' ');
    const { result } = renderHook(() => useStuckDetection({ transcript: [you(long, 1)], active: true }));
    expect(result.current?.type).toBe('rambling');
  });

  it('flags conceding when the learner gives up', () => {
    const { result } = renderHook(() => useStuckDetection({ transcript: [you('okay fine, no problem', 1)], active: true }));
    expect(result.current?.type).toBe('conceding');
  });

  it('does NOT flag a normal substantive turn', () => {
    const { result } = renderHook(() => useStuckDetection({ transcript: [you('I would open with a pattern interrupt and ask for twenty seconds', 1)], active: true }));
    expect(result.current).toBeNull();
  });

  it('flags silence after the threshold with no learner line', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStuckDetection({ transcript: [], active: true }));
    expect(result.current).toBeNull();
    act(() => { vi.advanceTimersByTime(10000); });
    expect(result.current?.type).toBe('silence');
  });

  it('stays null when not active (not in the live rep)', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStuckDetection({ transcript: [you('okay fine', 1)], active: false }));
    act(() => { vi.advanceTimersByTime(10000); });
    expect(result.current).toBeNull();
  });
});
