import { describe, it, expect } from 'vitest';
import { joinUserTranscript } from './useDictation';
import type { TranscriptLine } from './types';

const line = (speaker: 'you' | 'nicole', text: string, id: string): TranscriptLine => ({
  id,
  speaker,
  text,
});

describe('joinUserTranscript', () => {
  it('keeps only the user (you) lines and joins them', () => {
    const lines = [
      line('you', 'hello there', '1'),
      line('nicole', 'ignored', '2'),
      line('you', 'this is a custom coach', '3'),
    ];
    expect(joinUserTranscript(lines)).toBe('hello there this is a custom coach');
  });

  it('returns empty string when there are no user lines', () => {
    expect(joinUserTranscript([line('nicole', 'hi', '1')])).toBe('');
    expect(joinUserTranscript([])).toBe('');
  });

  it('trims and drops blank user lines', () => {
    const lines = [line('you', '  spaced  ', '1'), line('you', '   ', '2')];
    expect(joinUserTranscript(lines)).toBe('spaced');
  });
});
