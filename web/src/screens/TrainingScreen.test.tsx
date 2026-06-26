import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';

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
  coachRealtime: { you: '', nicole: '' },
  scorecardResult: null as null | {
    overallScore: number;
    band: 'needs_work' | 'developing' | 'proficient' | 'strong';
    scores: Array<{
      dimensionId: string; label: string; score: 0 | 1 | 2 | 3;
      band: 'missing' | 'emerging' | 'proficient' | 'strong';
      rationale: string; evidenceQuote: string | null;
    }>;
    signals: { talkRatioPct: number; questionCount: number; longestMonologueWords: number };
    headline: string;
    worked: { note: string; quote: string | null };
    fix: { note: string; quote: string | null; why: string };
    nextTime: string; spoken: string;
  },
  practiceTranscript: [] as Array<{ speaker: 'you' | 'rep' | 'nicole'; text: string }>,
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  advance: vi.fn(),
  markProgress: vi.fn(),
  finishPractice: vi.fn(async () => {}),
  replayPractice: vi.fn(),
  reteach: vi.fn(),
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

/** A sample scorecard for debrief tests. */
const SAMPLE_SCORECARD = {
  overallScore: 7.5,
  band: 'proficient' as const,
  scores: [
    {
      dimensionId: 'acknowledge',
      label: 'Acknowledge',
      score: 2 as const,
      band: 'proficient' as const,
      rationale: 'Good acknowledgment.',
      evidenceQuote: null,
    },
  ],
  signals: { talkRatioPct: 50, questionCount: 2, longestMonologueWords: 30 },
  headline: 'Solid rep — one fix to sharpen.',
  worked: { note: 'Good opener.', quote: null },
  fix: { note: 'Ask more questions.', quote: null, why: 'Drives engagement.' },
  nextTime: 'Lead with a question.',
  spoken: 'Good work today.',
};

beforeEach(() => {
  useCoachingSessionMock.mockClear();
  fake.start.mockClear();
  fake.stop.mockClear();
  fake.advance.mockClear();
  fake.finishPractice.mockClear();
  fake.replayPractice.mockClear();
  fake.reteach.mockClear();
  fake.scorecard = [];
  fake.coachTranscript = [];
  fake.coachRealtime = { you: '', nicole: '' };
  fake.scorecardResult = null;
  fake.practiceTranscript = [];
  // Reset phase to intro
  (fake as { phase: string }).phase = 'intro';
});

afterEach(() => {
  cleanup();
});

/**
 * Helper: enter the training session by picking the first lesson and clicking Start.
 * Returns the render API for further assertions.
 */
const enterRoom = (
  api: { getAllByTestId: (id: string) => HTMLElement[]; getByTestId: (id: string) => HTMLElement },
  index = 0,
) => {
  fireEvent.click(api.getAllByTestId('lesson-card')[index]);
  fireEvent.click(api.getByTestId('start-training-button'));
};

/**
 * Helper: render TrainingScreen already in a live session at the given phase,
 * with optional overrides on the fake session object.
 */
const renderTrainingAtPhase = (
  phase: string,
  overrides: Partial<typeof fake> = {},
) => {
  // Apply overrides
  Object.assign(fake, { phase, ...overrides });
  const api = render(<TrainingScreen />);
  enterRoom(api);
  return api;
};

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

  it('selecting a lesson shows the phase indicator (inside LiveRoom rail)', () => {
    const api = render(<TrainingScreen />);
    enterRoom(api);
    expect(api.getByTestId('phase-indicator')).toBeInTheDocument();
    // The scorecard lives in the debrief, but the phase stepper proves we're in
    // the live room; the picker is gone.
    expect(api.queryByTestId('lesson-card')).toBeNull();
  });

  it('passes the chosen lesson into useCoachingSession', () => {
    const api = render(<TrainingScreen />);
    enterRoom(api, 1);
    expect(useCoachingSessionMock).toHaveBeenCalled();
    const arg = useCoachingSessionMock.mock.calls[0][0];
    expect(arg.lesson.title).toBe(LESSONS[1].title);
  });

  it('the phase indicator shows the current phase label', () => {
    const api = render(<TrainingScreen />);
    enterRoom(api);
    const indicator = api.getByTestId('phase-indicator');
    // 'intro' should surface a human label, not the raw key.
    expect(indicator.textContent?.toLowerCase()).toContain('intro');
  });

  it('shows the start button before session begins', () => {
    const api = render(<TrainingScreen />);
    enterRoom(api);
    expect(api.getByTestId('start-button')).toBeInTheDocument();
  });

  it('the start button calls start() and calls session.start', () => {
    const api = render(<TrainingScreen />);
    enterRoom(api);
    fireEvent.click(api.getByTestId('start-button'));
    expect(fake.start).toHaveBeenCalled();
  });

  it('shows the readiness confirm at readiness_check and a full-width live room', () => {
    renderTrainingAtPhase('readiness_check');
    expect(screen.getByTestId('live-room')).toBeInTheDocument();
    expect(screen.getByTestId('readiness-confirm')).toBeInTheDocument();
  });

  it('readiness-confirm calls advance()', () => {
    renderTrainingAtPhase('readiness_check');
    fireEvent.click(screen.getByTestId('readiness-confirm'));
    expect(fake.advance).toHaveBeenCalled();
  });

  it('shows practice-done button at roleplay_demo phase', () => {
    renderTrainingAtPhase('roleplay_demo');
    expect(screen.getByTestId('practice-done')).toBeInTheDocument();
  });

  it('renders SessionResults at debrief', () => {
    renderTrainingAtPhase('debrief', {
      scorecardResult: SAMPLE_SCORECARD,
      practiceTranscript: [{ speaker: 'you', text: 'hi' }],
    });
    expect(screen.getByTestId('session-results')).toBeInTheDocument();
  });

  it('exit returns to the picker and calls onExit', () => {
    const onExit = vi.fn();
    const api = render(<TrainingScreen onExit={onExit} />);
    enterRoom(api);
    expect(api.queryByTestId('lesson-card')).toBeNull();
    fireEvent.click(api.getByTestId('exit-button'));
    expect(onExit).toHaveBeenCalled();
  });
});
