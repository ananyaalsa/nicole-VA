import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Scorecard } from './Scorecard';
import type { ScoreEntry } from '../training/useCoachingSession';

afterEach(() => {
  cleanup();
});

describe('Scorecard', () => {
  it('renders one row per entry', () => {
    const entries: ScoreEntry[] = [
      { dimension: 'Acknowledge', hit: true, tip: 'Validated first.' },
      { dimension: 'Clarify', hit: false, tip: 'Ask what expensive means.' },
    ];
    const { getAllByTestId } = render(<Scorecard entries={entries} />);
    expect(getAllByTestId('scorecard-entry')).toHaveLength(2);
  });

  it('shows the dimension and tip text', () => {
    const entries: ScoreEntry[] = [
      { dimension: 'Elevate', hit: true, tip: 'Great value reframe.' },
    ];
    const { getByText } = render(<Scorecard entries={entries} />);
    expect(getByText('Elevate')).toBeInTheDocument();
    expect(getByText('Great value reframe.')).toBeInTheDocument();
  });

  it('distinguishes a hit from a miss', () => {
    const entries: ScoreEntry[] = [
      { dimension: 'Acknowledge', hit: true, tip: 'good' },
      { dimension: 'Clarify', hit: false, tip: 'bad' },
    ];
    const { container } = render(<Scorecard entries={entries} />);
    expect(container.querySelector('[data-hit="true"]')).not.toBeNull();
    expect(container.querySelector('[data-hit="false"]')).not.toBeNull();
  });

  it('renders an empty-state when there are no entries', () => {
    const { getByTestId, queryAllByTestId } = render(<Scorecard entries={[]} />);
    expect(queryAllByTestId('scorecard-entry')).toHaveLength(0);
    expect(getByTestId('scorecard-empty')).toBeInTheDocument();
  });
});
