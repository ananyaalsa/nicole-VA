import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Transcript } from './Transcript';
import type { TranscriptLine } from '../engine/types';

afterEach(() => {
  cleanup();
});

function makeLines(n: number): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (let i = 0; i < n; i++) {
    lines.push({
      id: `line-${i}`,
      speaker: i % 2 === 0 ? 'you' : 'nicole',
      text: `message number ${i}`,
    });
  }
  return lines;
}

describe('Transcript', () => {
  it('renders only the last maxRendered lines', () => {
    const lines = makeLines(500);
    const { getAllByTestId } = render(
      <Transcript lines={lines} maxRendered={120} />,
    );
    expect(getAllByTestId('transcript-line')).toHaveLength(120);
  });

  it('renders the newest line text', () => {
    const lines = makeLines(500);
    const { getByText } = render(<Transcript lines={lines} maxRendered={120} />);
    // Newest line is index 499.
    expect(getByText('message number 499')).toBeInTheDocument();
  });

  it('does not render lines that rolled off the DOM', () => {
    const lines = makeLines(500);
    const { queryByText } = render(
      <Transcript lines={lines} maxRendered={120} />,
    );
    // index 0 should have rolled off (only last 120 kept).
    expect(queryByText('message number 0')).toBeNull();
  });

  it('shows You and Nicole speaker labels', () => {
    const lines: TranscriptLine[] = [
      { id: 'a', speaker: 'you', text: 'hi there' },
      { id: 'b', speaker: 'nicole', text: 'hello back' },
    ];
    const { getByText } = render(<Transcript lines={lines} />);
    expect(getByText('You')).toBeInTheDocument();
    expect(getByText('Nicole')).toBeInTheDocument();
  });

  it('applies a speaker-specific class per line', () => {
    const lines: TranscriptLine[] = [
      { id: 'a', speaker: 'you', text: 'hi' },
      { id: 'b', speaker: 'nicole', text: 'yo' },
    ];
    const { container } = render(<Transcript lines={lines} />);
    expect(
      container.querySelector('.transcript-line--you'),
    ).not.toBeNull();
    expect(
      container.querySelector('.transcript-line--nicole'),
    ).not.toBeNull();
  });

  it('defaults maxRendered to 120', () => {
    const lines = makeLines(300);
    const { getAllByTestId } = render(<Transcript lines={lines} />);
    expect(getAllByTestId('transcript-line')).toHaveLength(120);
  });

  it('renders all lines when fewer than maxRendered', () => {
    const lines = makeLines(5);
    const { getAllByTestId } = render(
      <Transcript lines={lines} maxRendered={120} />,
    );
    expect(getAllByTestId('transcript-line')).toHaveLength(5);
  });
});
