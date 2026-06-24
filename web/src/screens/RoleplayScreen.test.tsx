import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

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

import { RoleplayScreen } from './RoleplayScreen';

beforeEach(() => {
  fetchProfiles.mockClear();
  saveRun.mockClear();
  generateCustomSpec.mockClear();
  sessionStart.mockClear();
  sessionStop.mockClear();
  toggleMic.mockClear();
  sessionState = {
    connected: true,
    micOn: true,
    transcript: [
      { id: 'a', speaker: 'nicole', text: 'Grant here, what is this about?' },
      { id: 'b', speaker: 'you', text: 'Hi Grant, quick question for you.' },
    ],
    amplitude: 0,
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

  it('relabels the character lines with the alias in the transcript', async () => {
    render(<RoleplayScreen />);
    await pickThrough();
    fireEvent.click(screen.getByTestId('start-roleplay-button'));

    const lines = screen.getAllByTestId('roleplay-line');
    // First line is the character speaking — shown as "Grant", not "Nicole".
    expect(lines[0].textContent).toContain('Grant');
    expect(lines[0]).toHaveAttribute('data-speaker', 'character');
    expect(lines[1]).toHaveAttribute('data-speaker', 'you');
  });

  it('End & score stops the session, shows a score, and saves the run', async () => {
    render(<RoleplayScreen />);
    await pickThrough();
    fireEvent.click(screen.getByTestId('start-roleplay-button'));
    fireEvent.click(screen.getByTestId('end-score-button'));

    expect(sessionStop).toHaveBeenCalled();
    expect(screen.getByTestId('roleplay-result')).toBeInTheDocument();
    expect(screen.getByTestId('roleplay-score')).toBeInTheDocument();
    // The scorecard derives from the profile dimension.
    expect(screen.getByText('Strong open')).toBeInTheDocument();

    await waitFor(() => expect(saveRun).toHaveBeenCalled());
    const savedArg = saveRun.mock.calls[0][0] as { kind: string; title: string; score: number };
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
    await screen.findByTestId('roleplay-result');
    fireEvent.click(screen.getByTestId('result-done-button'));
    expect(await screen.findByTestId('profile-card')).toBeInTheDocument();
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
