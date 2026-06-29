import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionResults } from './SessionResults';
import type { Scorecard } from '../training/scoreApi';

const SC: Scorecard = {
  overallScore: 6.7, band: 'developing',
  scores: [{ dimensionId: 'ack', label: 'Acknowledge', score: 3, band: 'strong', rationale: 'restated well', evidenceQuote: 'I hear you' }],
  signals: { talkRatioPct: 55, questionCount: 3, longestMonologueWords: 18 },
  headline: 'Strong rapport, weak close.',
  worked: { note: 'Good acknowledgement', quote: 'I hear you' },
  fix: { note: 'Ask for the next step', quote: null, why: 'Deals stall' },
  nextTime: 'Book 20 minutes Thursday.', spoken: '...',
};

describe('SessionResults', () => {
  it('shows the verdict, a dimension row, and the dual transcript; fires actions', () => {
    const onAgain = vi.fn(); const onDone = vi.fn();
    render(
      <SessionResults scorecard={SC} transcript={[{ speaker: 'you', text: 'hi' }]} repLabel="Marcus" onAgain={onAgain} onDone={onDone} saving={false} />,
    );
    expect(screen.getByTestId('results-overall')).toHaveTextContent('6.7');
    expect(screen.getByText('Acknowledge')).toBeInTheDocument();
    expect(screen.getByText('Strong rapport, weak close.')).toBeInTheDocument();
    expect(screen.getByTestId('dual-transcript')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('results-again'));
    fireEvent.click(screen.getByTestId('results-done'));
    expect(onAgain).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });
});
