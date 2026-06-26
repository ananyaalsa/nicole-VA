import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const DEFAULT_SCORECARD = {
  overallScore: 5.0,
  band: 'proficient' as const,
  scores: [{ dimensionId: 'engagement', label: 'Engagement', score: 2 as const, band: 'proficient' as const, rationale: 'Good', evidenceQuote: null }],
  signals: { talkRatioPct: 50, questionCount: 1, longestMonologueWords: 10 },
  headline: 'Decent run',
  worked: { note: 'Kept going', quote: null },
  fix: { note: 'Push harder', quote: null, why: '' },
  nextTime: 'Ask more',
  spoken: 'some text',
};

// --- Mock the training API ------------------------------------------------
const SALES_PROFILE = {
  id: 'sales',
  name: 'Sales',
  blurb: 'Practice against tough buyers.',
  personas: [
    {
      id: 'grant',
      name: 'Grant',
      tagline: 'A blunt, time-poor VP of Ops.',
      systemOverlay: 'You are a blunt VP.',
      voiceName: 'Charon',
      characterAlias: 'Grant',
    },
  ],
  scenarios: [
    {
      id: 'cold',
      name: 'Cold call',
      description: 'You called him out of the blue.',
      prospectOverlay: 'Answer the phone annoyed.',
    },
  ],
  dimensions: [{ id: 'open', label: 'Strong open', rubric: 'Hooks in 10s.' }],
  allowCustomPersona: false,
  allowCustomScenario: false,
};

const fetchProfiles = vi.fn<() => Promise<unknown[]>>(async () => [SALES_PROFILE]);
const saveRun = vi.fn<(run: unknown) => Promise<{ id: number }>>(async () => ({ id: 1 }));
const generateCustomSpec = vi.fn<(input: unknown) => Promise<{ ok: boolean; spec?: unknown; error?: string }>>(
  async () => ({ ok: true, spec: undefined }),
);

vi.mock('../training/trainingApi', () => ({
  fetchProfiles: () => fetchProfiles(),
  saveRun: (run: unknown) => saveRun(run as never),
  generateCustomSpec: (input: unknown) => generateCustomSpec(input as never),
  HTTP_BASE: 'http://localhost:4000',
}));

// --- Mock the live roleplay session ---------------------------------------
const sessionStart = vi.fn(async () => {});
const sessionStop = vi.fn();
const toggleMic = vi.fn();
let sessionState = {
  connected: true,
  micOn: true,
  transcript: [
    { id: 'a', speaker: 'nicole' as const, text: 'Grant here, what is this about?' },
    { id: 'b', speaker: 'you' as const, text: 'Hi Grant, quick question for you.' },
  ],
  amplitude: 0,
  realtime: { you: '', nicole: '' },
  start: sessionStart,
  stop: sessionStop,
  toggleMic,
};
vi.mock('../training/useRoleplaySession', () => ({
  useRoleplaySession: () => sessionState,
}));

// AuroraBackground uses a canvas — stub it.
vi.mock('../components/AuroraBackground', () => ({
  default: () => <div data-testid="aurora" />,
}));

// DictationField uses a live session for mic; stub useDictation so it's inert.
vi.mock('../engine/useDictation', () => ({
  useDictation: () => ({
    listening: false,
    text: '',
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    toggle: vi.fn(),
    reset: vi.fn(),
  }),
  joinUserTranscript: () => '',
}));
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { displayName: 'Gaurav', preferredVoice: 'Aoede', onboardingDone: true } }),
}));

import type { TranscriptLine } from '../engine/types';
import { RoleplayScreen } from './RoleplayScreen';

beforeEach(() => {
  fetchProfiles.mockClear();
  saveRun.mockClear();
  generateCustomSpec.mockClear();
  sessionStart.mockClear();
  sessionStop.mockClear();
  toggleMic.mockClear();
  // Default fetch stub for judge scoring — tests that need a different scorecard
  // can call vi.stubGlobal('fetch', …) AFTER beforeEach to override it.
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ scorecard: DEFAULT_SCORECARD }),
  })) as unknown as typeof fetch);
  sessionState = {
    connected: true,
    micOn: true,
    transcript: [
      { id: 'a', speaker: 'nicole', text: 'Grant here, what is this about?' },
      { id: 'b', speaker: 'you', text: 'Hi Grant, quick question for you.' },
    ],
    amplitude: 0,
    realtime: { you: '', nicole: '' },
    start: sessionStart,
    stop: sessionStop,
    toggleMic,
  };
});

afterEach(() => cleanup());

async function pickThrough() {
  // Wait for profiles to load + render.
  await screen.findByTestId('profile-card');
  fireEvent.click(screen.getByTestId('profile-card'));
  fireEvent.click(screen.getByTestId('persona-card'));
  fireEvent.click(screen.getByTestId('scenario-card'));
}

describe('RoleplayScreen', () => {
  it('renders the profile picker after fetchProfiles resolves', async () => {
    render(<RoleplayScreen />);
    expect(await screen.findByText('Sales')).toBeInTheDocument();
    expect(fetchProfiles).toHaveBeenCalled();
  });

  it('disables Start roleplay until a persona and scenario are chosen', async () => {
    render(<RoleplayScreen />);
    await screen.findByTestId('profile-card');
    const startBtn = screen.getByTestId('start-roleplay-button') as HTMLButtonElement;
    expect(startBtn.disabled).toBe(true);

    fireEvent.click(screen.getByTestId('profile-card'));
    fireEvent.click(screen.getByTestId('persona-card'));
    expect((screen.getByTestId('start-roleplay-button') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('scenario-card'));
    expect((screen.getByTestId('start-roleplay-button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('entering the room auto-starts the session and shows the character (not Nicole)', async () => {
    render(<RoleplayScreen />);
    await pickThrough();
    fireEvent.click(screen.getByTestId('start-roleplay-button'));

    expect(screen.getByTestId('roleplay-room')).toBeInTheDocument();
    expect(sessionStart).toHaveBeenCalled();
    // The character is labelled by its alias, never "Nicole".
    expect(screen.getByTestId('character-label').textContent).toBe('Grant');
    expect(screen.queryByText('Nicole')).toBeNull();
  });

  it('relabels the character lines with the alias in the LiveRoom transcript', async () => {
    render(<RoleplayScreen />);
    await pickThrough();
    fireEvent.click(screen.getByTestId('start-roleplay-button'));

    // LiveRoom renders via ChatTranscript: .chat-who spans carry the speaker label.
    // The character's lines should show the alias "Grant", not the raw "nicole".
    const liveRoom = screen.getByTestId('live-room');
    expect(liveRoom.textContent).toContain('Grant');
    expect(liveRoom.textContent).not.toContain('Nicole');
    // User lines are labelled "You".
    expect(liveRoom.textContent).toContain('You');
  });

  it('End & score stops the session, shows SessionResults, and saves the run', async () => {
    render(<RoleplayScreen />);
    await pickThrough();
    fireEvent.click(screen.getByTestId('start-roleplay-button'));
    fireEvent.click(screen.getByTestId('end-score-button'));

    expect(sessionStop).toHaveBeenCalled();
    expect(await screen.findByTestId('roleplay-result')).toBeInTheDocument();
    expect(await screen.findByTestId('session-results')).toBeInTheDocument();

    await waitFor(() => expect(saveRun).toHaveBeenCalled());
    const savedArg = saveRun.mock.calls[0][0] as {
      kind: string;
      title: string;
      score: number;
    };
    expect(savedArg.kind).toBe('roleplay');
    expect(savedArg.title).toBe('Grant · Cold call');
    expect(typeof savedArg.score).toBe('number');
    expect(savedArg.score).toBeGreaterThanOrEqual(0);
  });

  it('Done returns to the picker', async () => {
    render(<RoleplayScreen />);
    await pickThrough();
    fireEvent.click(screen.getByTestId('start-roleplay-button'));
    fireEvent.click(screen.getByTestId('end-score-button'));
    await screen.findByTestId('session-results');
    fireEvent.click(screen.getByTestId('results-done'));
    expect(await screen.findByTestId('profile-card')).toBeInTheDocument();
  });

  it('scores via the judge and renders SessionResults on end', async () => {
    const fakeSc = {
      overallScore: 7.2,
      band: 'proficient' as const,
      scores: [],
      signals: { talkRatioPct: 52, questionCount: 2, longestMonologueWords: 11 },
      headline: 'h',
      worked: { note: 'w', quote: null },
      fix: { note: 'f', quote: null, why: '' },
      nextTime: 'n',
      spoken: 's',
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ scorecard: fakeSc }) })) as unknown as typeof fetch);
    // Set up session with transcript lines matching the brief's helper shape.
    sessionState = {
      ...sessionState,
      transcript: [
        { id: '1', speaker: 'you' as const, text: 'hi' },
        { id: '2', speaker: 'nicole' as const, text: 'who is this?' },
      ],
    };
    render(<RoleplayScreen />);
    await pickThrough();
    fireEvent.click(screen.getByTestId('start-roleplay-button'));
    fireEvent.click(screen.getByTestId('end-score-button'));
    await screen.findByTestId('session-results');
    expect(screen.getByText('7.2')).toBeInTheDocument();
  });

  it('offers a custom builder for the custom profile', async () => {
    fetchProfiles.mockResolvedValueOnce([
      { ...SALES_PROFILE, id: 'custom', name: 'Custom' },
    ]);
    generateCustomSpec.mockResolvedValueOnce({
      ok: true,
      spec: {
        title: 'Skeptical CFO renewal',
        objective: 'Defend the renewal price.',
        hook: 'This is too expensive.',
        persona: { alias: 'Dana', voiceName: 'Puck', personaPrompt: 'You are a CFO.' },
      } as never,
    });
    render(<RoleplayScreen />);
    fireEvent.click(await screen.findByTestId('profile-card'));
    const ta = screen.getByTestId('dictation-input') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'A skeptical CFO on a renewal call' } });
    fireEvent.click(screen.getByTestId('build-button'));
    await screen.findByTestId('custom-ready');
    expect(generateCustomSpec).toHaveBeenCalled();
    expect((screen.getByTestId('start-roleplay-button') as HTMLButtonElement).disabled).toBe(false);
  });
});
