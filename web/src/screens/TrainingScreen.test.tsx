import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

/**
 * Mock useCoachingSession so the screen test never touches the real audio/WS
 * engine. The mock records the lesson it was started with and exposes a stable
 * fake result the screen renders from.
 */
const fake = {
  phase: 'intro' as const,
  scorecard: [] as Array<{ dimension: string; hit: boolean; tip: string }>,
  coachAmplitude: 0,
  coachTranscript: [] as Array<{
    id: string;
    speaker: 'you' | 'nicole';
    text: string;
  }>,
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  advance: vi.fn(),
  markProgress: vi.fn(),
};

const useCoachingSessionMock = vi.fn((_opts: { lesson: { title: string } }) => fake);

vi.mock('../training/useCoachingSession', () => ({
  useCoachingSession: (opts: { lesson: { title: string } }) =>
    useCoachingSessionMock(opts),
}));

// AuroraBackground + SophiaAvatar touch canvas/WebGL jsdom can't run — stub them.
vi.mock('../components/AuroraBackground', () => ({
  default: () => <div data-testid="aurora" />,
}));
vi.mock('../avatar3d/SophiaAvatar', () => ({
  default: () => <div data-testid="sophia-avatar" />,
}));
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { displayName: 'Gaurav', preferredVoice: 'Aoede', onboardingDone: true } }),
}));

import { TrainingScreen } from './TrainingScreen';
import { LESSONS } from '../training/lessons';

beforeEach(() => {
  useCoachingSessionMock.mockClear();
  fake.start.mockClear();
  fake.stop.mockClear();
  fake.advance.mockClear();
  fake.scorecard = [];
  fake.coachTranscript = [];
});

afterEach(() => {
  cleanup();
});

describe('TrainingScreen', () => {
  it('renders a lesson picker listing both lessons', () => {
    const { getByText, getAllByTestId } = render(<TrainingScreen />);
    expect(getAllByTestId('lesson-card')).toHaveLength(LESSONS.length);
    for (const lesson of LESSONS) {
      expect(getByText(lesson.title)).toBeInTheDocument();
    }
  });

  it('does not start a coaching session until a lesson is picked', () => {
    render(<TrainingScreen />);
    // The hook is only invoked from the session view, not the picker.
    expect(useCoachingSessionMock).not.toHaveBeenCalled();
  });

  it('selecting a lesson shows the phase indicator and scorecard', () => {
    const { getAllByTestId, getByTestId, queryByTestId } = render(
      <TrainingScreen />,
    );
    fireEvent.click(getAllByTestId('lesson-card')[0]);
    expect(getByTestId('phase-indicator')).toBeInTheDocument();
    expect(getByTestId('scorecard')).toBeInTheDocument();
    // Picker is gone once a session is active.
    expect(queryByTestId('lesson-card')).toBeNull();
  });

  it('passes the chosen lesson into useCoachingSession', () => {
    const { getAllByTestId } = render(<TrainingScreen />);
    fireEvent.click(getAllByTestId('lesson-card')[1]);
    expect(useCoachingSessionMock).toHaveBeenCalled();
    const arg = useCoachingSessionMock.mock.calls[0][0];
    expect(arg.lesson.title).toBe(LESSONS[1].title);
  });

  it('the phase indicator shows the current phase label', () => {
    const { getAllByTestId, getByTestId } = render(<TrainingScreen />);
    fireEvent.click(getAllByTestId('lesson-card')[0]);
    const indicator = getByTestId('phase-indicator');
    // 'intro' should surface a human label, not the raw key.
    expect(indicator.textContent?.toLowerCase()).toContain('intro');
  });

  it('the advance control calls advance()', () => {
    const { getAllByTestId, getByTestId } = render(<TrainingScreen />);
    fireEvent.click(getAllByTestId('lesson-card')[0]);
    fireEvent.click(getByTestId('advance-button'));
    expect(fake.advance).toHaveBeenCalled();
  });

  it('exit returns to the picker and calls onExit', () => {
    const onExit = vi.fn();
    const { getAllByTestId, getByTestId, queryByTestId } = render(
      <TrainingScreen onExit={onExit} />,
    );
    fireEvent.click(getAllByTestId('lesson-card')[0]);
    expect(queryByTestId('lesson-card')).toBeNull();
    fireEvent.click(getByTestId('exit-button'));
    expect(onExit).toHaveBeenCalled();
  });
});
