import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

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
  // Active-speaker views (prospect during the live rep, coach otherwise). The
  // screen renders from these; default them to the coach's empty values.
  activeTranscript: [] as Array<{ id: string; speaker: 'you' | 'nicole'; text: string }>,
  activeRealtime: { you: '', nicole: '' },
  activeAmplitude: 0,
  inLiveRep: false,
  prospectLabel: 'Grant',
  ready: true,
  micOn: true,
  toggleMic: vi.fn(),
  aiMuted: false,
  toggleAiMute: vi.fn(),
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
  goLive: vi.fn(),
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

// Module-level no-op mocks so the real fetch is never called in tests.
vi.mock('../training/trainingApi', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../training/trainingApi')>();
  return {
    ...orig,
    saveRun: vi.fn(async () => ({ id: 0 })),
  };
});
vi.mock('../training/scoreApi', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../training/scoreApi')>();
  return {
    ...orig,
    postLiveStatus: vi.fn(async () => {}),
  };
});

import { TrainingScreen } from './TrainingScreen';
import { LESSONS } from '../training/lessons';
import * as trainingApi from '../training/trainingApi';
import * as scoreApi from '../training/scoreApi';

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
  fake.goLive.mockClear();
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
  // Reset module-level API mocks
  vi.mocked(trainingApi.saveRun).mockClear();
  vi.mocked(scoreApi.postLiveStatus).mockClear();
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
 * with optional overrides on the fake session object and optional API mock overrides.
 */
const renderTrainingAtPhase = (
  phase: string,
  overrides: Partial<typeof fake> = {},
  apiMocks: {
    saveRun?: ReturnType<typeof vi.fn>;
    postLiveStatus?: ReturnType<typeof vi.fn>;
  } = {},
) => {
  // Apply session overrides
  Object.assign(fake, { phase, ...overrides });
  // Inject API mocks if provided
  if (apiMocks.saveRun) vi.mocked(trainingApi.saveRun).mockImplementation(apiMocks.saveRun);
  if (apiMocks.postLiveStatus) vi.mocked(scoreApi.postLiveStatus).mockImplementation(apiMocks.postLiveStatus);
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

  it('shows where you are: a Step N of M header + plain phase labels', () => {
    const api = render(<TrainingScreen />);
    enterRoom(api);
    // Plain-language label (no raw key, no jargon) in the stepper.
    const indicator = api.getByTestId('phase-indicator');
    expect(indicator.textContent?.toLowerCase()).toContain('get set up');
    // And an unmistakable "Step 1 of 7" position header.
    const now = api.getByTestId('phase-now');
    expect(now.textContent).toMatch(/step 1 of 7/i);
    expect(now.textContent?.toLowerCase()).toContain('get set up');
  });

  it('auto-starts the lesson on entering the room (no separate Begin button)', () => {
    const api = render(<TrainingScreen />);
    enterRoom(api);
    // "Start drill" → straight into the lesson; Nicole opens it herself.
    expect(fake.start).toHaveBeenCalled();
    expect(api.queryByTestId('start-button')).not.toBeInTheDocument();
  });

  it('shows the readiness confirm at readiness_check and a full-width live room', () => {
    renderTrainingAtPhase('readiness_check');
    expect(screen.getByTestId('live-room')).toBeInTheDocument();
    expect(screen.getByTestId('readiness-confirm')).toBeInTheDocument();
  });

  it('readiness-confirm jumps straight to the live rep (goLive, no gatekeeping)', () => {
    renderTrainingAtPhase('readiness_check');
    fireEvent.click(screen.getByTestId('readiness-confirm'));
    expect(fake.goLive).toHaveBeenCalled();
  });

  it('offers "Skip to live rep" from a teaching phase too (no gatekeeping)', () => {
    renderTrainingAtPhase('teach');
    const skip = screen.getByTestId('readiness-confirm');
    expect(skip.textContent?.toLowerCase()).toContain('skip to live rep');
    fireEvent.click(skip);
    expect(fake.goLive).toHaveBeenCalled();
  });

  it('shows the practice-done action at roleplay_demo phase (in the footer bar)', () => {
    renderTrainingAtPhase('roleplay_demo');
    expect(screen.getByTestId('practice-done-footer')).toBeInTheDocument();
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

  it('saves a training run and posts finished status when results appear', async () => {
    const saveRunMock = vi.fn(async () => ({ id: 1 }));
    const postLiveStatusMock = vi.fn(async () => {});
    renderTrainingAtPhase(
      'debrief',
      { scorecardResult: SAMPLE_SCORECARD, practiceTranscript: [{ speaker: 'you', text: 'hi' }] },
      { saveRun: saveRunMock, postLiveStatus: postLiveStatusMock },
    );
    await waitFor(() => expect(saveRunMock).toHaveBeenCalled());
    expect(saveRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'training', score: SAMPLE_SCORECARD.overallScore }),
      // token is undefined in test env (useAuth mock has no token field)
      undefined,
    );
    expect(postLiveStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'training', state: 'finished' }),
      undefined,
    );
  });

  it('saves AGAIN when a second rep produces a new scorecard (replay is not lost)', async () => {
    const saveRunMock = vi.fn(async () => ({ id: 1 }));
    const api = renderTrainingAtPhase(
      'debrief',
      { scorecardResult: { ...SAMPLE_SCORECARD, overallScore: 5.0 }, practiceTranscript: [{ speaker: 'you', text: 'rep one' }] },
      { saveRun: saveRunMock },
    );
    await waitFor(() => expect(saveRunMock).toHaveBeenCalledTimes(1));
    // Simulate a replay producing a NEW scorecard object (different identity).
    Object.assign(fake, { scorecardResult: { ...SAMPLE_SCORECARD, overallScore: 8.0 } });
    api.rerender(<TrainingScreen />);
    // The second rep must be persisted too — the old boolean guard dropped it.
    await waitFor(() => expect(saveRunMock).toHaveBeenCalledTimes(2));
    expect(saveRunMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'training', score: 8.0 }),
      undefined,
    );
  });
});
