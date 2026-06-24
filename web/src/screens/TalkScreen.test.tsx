import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// WaveBackdrop draws on a <canvas>; jsdom has no 2D context. Stub it so the
// screen renders without the "getContext not implemented" noise/crash.
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

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
// Auth context — provide a fake signed-in user so the screen renders.
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { displayName: 'Gaurav', email: 'g@x.com', preferredVoice: 'Aoede', onboardingDone: true },
    token: 'test-token',
    updateUser: vi.fn(),
  }),
}));
// ProfilePanel pulls auth/api — stub it.
vi.mock('../components/ProfilePanel', () => ({
  ProfilePanel: () => null,
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
    expect(screen.getByTestId('mute-mic-button')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /end/i })).toBeInTheDocument();
  });

  it('shows the camera control when connected and opens the camera on click', () => {
    sessionState = { ...sessionState, connected: true };
    render(<TalkScreen />);
    const cam = screen.getAllByTestId('camera-button')[0] as HTMLButtonElement;
    fireEvent.click(cam);
    expect(cameraStart).toHaveBeenCalled();
  });

  it('shows Mute mic and Mute Nicole controls when connected', () => {
    sessionState = { ...sessionState, connected: true };
    render(<TalkScreen />);
    expect(screen.getByTestId('mute-mic-button')).toBeInTheDocument();
    expect(screen.getByTestId('mute-ai-button')).toBeInTheDocument();
  });

  it('camera button turns the camera off when it is already on', () => {
    sessionState = { ...sessionState, connected: true };
    cameraState = { ...cameraState, on: true };
    render(<TalkScreen />);
    // The camera control appears in both the header and the live controls when
    // connected — clicking either toggles it off.
    fireEvent.click(screen.getAllByTestId('camera-button')[0]);
    expect(cameraStop).toHaveBeenCalled();
  });

  it('offers a Training entry when onTrain is provided', () => {
    const onTrain = vi.fn();
    render(<TalkScreen onTrain={onTrain} />);
    fireEvent.click(screen.getByRole('button', { name: /training/i }));
    expect(onTrain).toHaveBeenCalled();
  });
});
