import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock the session hook — it touches AudioContext / getUserMedia / WebSocket.
const start = vi.fn(async () => {});
const stop = vi.fn();
const toggleMic = vi.fn();
const setVoice = vi.fn();
let sessionState = {
  connected: false,
  micOn: true,
  transcript: [] as any[],
  amplitude: 0,
  start,
  stop,
  toggleMic,
  setVoice,
};
vi.mock('../engine/useNicoleSession', () => ({
  useNicoleSession: () => sessionState,
}));
// AuroraBackground uses canvas; keep it but canvas is stubbed by jsdom — render lightweight.
vi.mock('../components/AuroraBackground', () => ({
  default: () => <div data-testid="aurora" />,
}));

import { TalkScreen } from './TalkScreen';

beforeEach(() => {
  start.mockClear();
  stop.mockClear();
  toggleMic.mockClear();
  setVoice.mockClear();
  sessionState = { connected: false, micOn: true, transcript: [], amplitude: 0, start, stop, toggleMic, setVoice };
});

describe('TalkScreen', () => {
  it('renders the brand, avatar aura, transcript, and voice switcher', () => {
    render(<TalkScreen />);
    expect(screen.getByText('Nicole')).toBeInTheDocument();
    expect(screen.getByTestId('nicole-aura')).toBeInTheDocument();
    expect(screen.getByTestId('voice-switcher')).toBeInTheDocument();
  });

  it('shows "Start talking" when disconnected and calls start when clicked', () => {
    render(<TalkScreen />);
    const btn = screen.getByRole('button', { name: /start talking/i });
    fireEvent.click(btn);
    expect(start).toHaveBeenCalled();
  });

  it('shows Mute/End controls when connected', () => {
    sessionState = { ...sessionState, connected: true };
    render(<TalkScreen />);
    expect(screen.getByRole('button', { name: /mute/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /end/i })).toBeInTheDocument();
  });

  it('offers a Training entry when onTrain is provided', () => {
    const onTrain = vi.fn();
    render(<TalkScreen onTrain={onTrain} />);
    fireEvent.click(screen.getByRole('button', { name: /training/i }));
    expect(onTrain).toHaveBeenCalled();
  });
});
