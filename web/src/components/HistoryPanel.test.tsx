import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const fetchHistory = vi.fn();
vi.mock('../training/trainingApi', () => ({
  fetchHistory: () => fetchHistory(),
}));

import { HistoryPanel } from './HistoryPanel';

const RUNS = [
  {
    id: 2,
    userId: 'u',
    kind: 'roleplay' as const,
    profileId: 'sales',
    personaId: 'grant',
    scenarioId: 'cold',
    title: 'Grant · Cold call',
    score: 7.2,
    scorecard: [
      { dimension: 'Strong open', hit: true, tip: 'Nice hook.' },
      { dimension: 'Handle pushback', hit: false, tip: 'Slow down.' },
    ],
    transcript: 'You: hi',
    createdAt: '2026-06-20T10:00:00.000Z',
  },
  {
    id: 1,
    userId: 'u',
    kind: 'training' as const,
    profileId: null,
    personaId: null,
    scenarioId: null,
    title: 'SPIN questioning drill',
    score: 5.5,
    scorecard: [{ dimension: 'Situation', hit: true, tip: 'Good.' }],
    transcript: null,
    createdAt: '2026-06-18T09:00:00.000Z',
  },
];

beforeEach(() => {
  fetchHistory.mockReset();
});
afterEach(() => cleanup());

describe('HistoryPanel', () => {
  it('renders both runs with titles and scores newest-first', async () => {
    fetchHistory.mockResolvedValueOnce(RUNS);
    render(<HistoryPanel />);

    expect(await screen.findByText('Grant · Cold call')).toBeInTheDocument();
    expect(screen.getByText('SPIN questioning drill')).toBeInTheDocument();

    const scores = screen.getAllByTestId('history-score').map((n) => n.textContent);
    expect(scores[0]).toContain('7.2');
    expect(scores[1]).toContain('5.5');

    // Roleplay vs Training kind labels both render.
    expect(screen.getByText('Roleplay')).toBeInTheDocument();
    expect(screen.getByText('Training')).toBeInTheDocument();

    // Scorecard summary present (1 of 2 hit on the roleplay run).
    const summaries = screen.getAllByTestId('history-summary').map((n) => n.textContent);
    expect(summaries[0]).toContain('1/2');
  });

  it('shows the empty message when there are no runs', async () => {
    fetchHistory.mockResolvedValueOnce([]);
    render(<HistoryPanel />);
    expect(await screen.findByTestId('history-empty')).toHaveTextContent(
      /no sessions yet/i,
    );
  });

  it('calls onClose when the close button is clicked', async () => {
    fetchHistory.mockResolvedValueOnce([]);
    const onClose = vi.fn();
    render(<HistoryPanel onClose={onClose} />);
    await screen.findByTestId('history-empty');
    fireEvent.click(screen.getByTestId('history-close-button'));
    expect(onClose).toHaveBeenCalled();
  });
});
