import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock the session hook — it touches AudioContext / getUserMedia / WebSocket.
const start = vi.fn(async () => {});
const stop = vi.fn();
const toggleMic = vi.fn();
const setVoice = vi.fn();
const sendText = vi.fn();
const sendVideoFrame = vi.fn();
let sessionState = {
  connected: false,
  micOn: true,
  transcript: [] as any[],
  amplitude: 0,
  start,
  stop,
  toggleMic,
  setVoice,
  sendText,
  sendVideoFrame,
};
vi.mock('../engine/useNicoleSession', () => ({
  useNicoleSession: () => sessionState,
}));
// Mock the camera hook so we can assert the button wiring without real getUserMedia.
const cameraStart = vi.fn(async () => {});
const cameraStop = vi.fn();
let cameraState = {
  on: false,
  stream: null as MediaStream | null,
  facing: 'user' as const,
  start: cameraStart,
  stop: cameraStop,
  flip: vi.fn(),
  error: null as string | null,
};
vi.mock('../engine/useCamera', () => ({
  useCamera: () => cameraState,
}));
// AuroraBackground uses canvas; keep it but canvas is stubbed by jsdom — render lightweight.
vi.mock('../components/AuroraBackground', () => ({
  default: () => <div data-testid="aurora" />,
}));
// SophiaAvatar mounts a WebGL canvas (three.js) jsdom can't run — stub it.
vi.mock('../avatar3d/SophiaAvatar', () => ({
  default: () => <div data-testid="sophia-avatar" />,
}));

import { TalkScreen } from './TalkScreen';

beforeEach(() => {
  start.mockClear();
  stop.mockClear();
  toggleMic.mockClear();
  setVoice.mockClear();
  cameraStart.mockClear();
  cameraStop.mockClear();
  sessionState = { connected: false, micOn: true, transcript: [], amplitude: 0, start, stop, toggleMic, setVoice, sendText, sendVideoFrame };
  cameraState = { on: false, stream: null, facing: 'user', start: cameraStart, stop: cameraStop, flip: vi.fn(), error: null };
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

  it('camera button is NOT disabled when disconnected and opens the camera', () => {
    render(<TalkScreen />);
    const cam = screen.getByTestId('camera-button') as HTMLButtonElement;
    expect(cam.disabled).toBe(false);
    fireEvent.click(cam);
    expect(cameraStart).toHaveBeenCalled();
  });

  it('camera button turns the camera off when it is already on', () => {
    cameraState = { ...cameraState, on: true };
    render(<TalkScreen />);
    fireEvent.click(screen.getByTestId('camera-button'));
    expect(cameraStop).toHaveBeenCalled();
  });

  it('offers a Training entry when onTrain is provided', () => {
    const onTrain = vi.fn();
    render(<TalkScreen onTrain={onTrain} />);
    fireEvent.click(screen.getByRole('button', { name: /training/i }));
    expect(onTrain).toHaveBeenCalled();
  });
});
