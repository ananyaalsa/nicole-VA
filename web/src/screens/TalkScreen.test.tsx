import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// WaveBackdrop draws on a <canvas>; jsdom has no 2D context. Stub it so the
// screen renders without the "getContext not implemented" noise/crash.
// Also stub scrollTo: on desktop the .talk-chat__feed always mounts, triggering
// the auto-scroll useLayoutEffect even with an empty transcript.
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  (HTMLElement.prototype as any).scrollTo = (HTMLElement.prototype as any).scrollTo ?? (() => {});
});

// Mock the session hook — it touches AudioContext / getUserMedia / WebSocket.
const start = vi.fn(async () => {});
const stop = vi.fn();
const toggleMic = vi.fn();
const setVoice = vi.fn();
const sendText = vi.fn();
const sendVideoFrame = vi.fn();
const setMic = vi.fn();
const clearSearchLinks = vi.fn();
let sessionState = {
  connected: false,
  micOn: true,
  transcript: [] as any[],
  searchLinks: [] as any[],
  clearSearchLinks,
  realtime: { you: '', nicole: '' },
  amplitude: 0,
  start,
  stop,
  toggleMic,
  setMic,
  setVoice,
  sendText,
  sendVideoFrame,
};
const useNicoleSessionMock = vi.fn(function() { return sessionState; });
vi.mock('../engine/useNicoleSession', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useNicoleSession: (opts: any) => (useNicoleSessionMock as any)(opts),
}));
// Mock the camera hook so we can assert the button wiring without real getUserMedia.
const cameraStart = vi.fn(async () => {});
const cameraStartScreen = vi.fn(async () => {});
const cameraStop = vi.fn();
let cameraState = {
  on: false,
  stream: null as MediaStream | null,
  facing: 'user' as const,
  source: null as 'camera' | 'screen' | null,
  start: cameraStart,
  startScreen: cameraStartScreen,
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
// Live2D avatars mount PIXI/WebGL canvases jsdom can't run — stub to lightweight
// markers so we can assert layout (center avatar vs transcript) without the deps.
vi.mock('../live2d/CenterAvatar', () => ({
  CenterAvatar: () => <div data-testid="center-avatar" />,
}));
vi.mock('../live2d/Live2DCompanion', () => ({
  Live2DCompanion: () => <div data-testid="live2d-companion" />,
}));
// Mobile detection — controllable per test.
let mockIsMobile = false;
vi.mock('../engine/useIsMobile', () => ({ useIsMobile: () => mockIsMobile }));
// scoreApi — stub fetchLiveStatus so TalkScreen [STATUS] tests stay deterministic.
const mockFetchLiveStatus = vi.fn(async (_token?: string) => null as any);
vi.mock('../training/scoreApi', () => ({
  fetchLiveStatus: (token?: string) => mockFetchLiveStatus(token),
  postLiveStatus: vi.fn(async () => {}),
  requestScore: vi.fn(async () => ({})),
}));
// CanvasHost — lightweight stub that renders panels by type.
vi.mock('../canvas/CanvasHost', () => ({
  CanvasHost: ({ children, panels }: any) => (
    <div data-testid="canvas-host">
      {panels.length === 0
        ? children
        : panels.map((p: any) => <div key={p.key} data-testid={`panel-${p.type}`} />)}
    </div>
  ),
}));
// useCanvas — use real React state so open() triggers re-renders and CanvasHost
// receives updated panels (enabling findByTestId('panel-connect') in tests).
vi.mock('../canvas/useCanvas', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return {
    useCanvas: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [panels, setPanels] = React.useState([]) as [any[], React.Dispatch<React.SetStateAction<any[]>>];
      const open = React.useCallback((type: string, args?: any) => {
        const key = type === 'connect' ? `connect:${String(args?.provider ?? 'unknown')}` : type;
        setPanels((prev: any[]) => [...prev.filter((p: any) => p.key !== key), { key, type, args }]);
      }, []);
      const close = React.useCallback((type: string, provider?: string) => {
        const key = type === 'connect' ? `connect:${provider ?? 'unknown'}` : type;
        setPanels((prev: any[]) => prev.filter((p: any) => p.key !== key));
      }, []);
      const closeAll = React.useCallback(() => setPanels([]), []);
      return { panels, open, close, closeAll };
    },
  };
});

import { TalkScreen } from './TalkScreen';

beforeEach(() => {
  start.mockClear();
  stop.mockClear();
  toggleMic.mockClear();
  setVoice.mockClear();
  sendText.mockClear();
  setMic.mockClear();
  mockFetchLiveStatus.mockClear();
  mockFetchLiveStatus.mockResolvedValue(null);
  mockIsMobile = false;
  sessionState = { connected: false, micOn: true, transcript: [], searchLinks: [], clearSearchLinks, realtime: { you: '', nicole: '' }, amplitude: 0, start, stop, toggleMic, setMic, setVoice, sendText, sendVideoFrame };
  cameraState = { on: false, stream: null, facing: 'user', source: null, start: cameraStart, startScreen: cameraStartScreen, stop: cameraStop, flip: vi.fn(), error: null };
  useNicoleSessionMock.mockClear();
  useNicoleSessionMock.mockImplementation(function() { return sessionState; });
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

  it('feeds a SILENT [STATUS] context on return (Nicole must NOT speak unprompted)', async () => {
    // Session must be connected so the effect fires.
    sessionState = { ...sessionState, connected: true };
    // fetchLiveStatus returns a finished training status.
    mockFetchLiveStatus.mockResolvedValue({ mode: 'training', state: 'finished', skill: 'Discovery', score: 8 });

    const { rerender } = render(<TalkScreen backgrounded={true} />);
    // Transition: backgrounded false = user returned to Talk.
    await act(async () => {
      rerender(<TalkScreen backgrounded={false} />);
    });

    // sendText should have been called once with a SILENT [STATUS] context line —
    // the user came back without re-engaging, so Nicole must be told to stay quiet
    // (not the old "ask how it went" directive that made her talk unprompted).
    expect(sendText).toHaveBeenCalledTimes(1);
    const msg = sendText.mock.calls[0][0] as string;
    expect(msg).toMatch(/^\[STATUS/);
    expect(msg.toLowerCase()).toContain('silent');
    expect(msg.toLowerCase()).toContain('do not respond');
  });

  it('MOBILE + connected: shows the big center avatar and NO transcript', () => {
    mockIsMobile = true;
    sessionState = {
      ...sessionState,
      connected: true,
      transcript: [{ id: 'l1', speaker: 'you', text: 'hello', streaming: false } as any],
    };
    render(<TalkScreen />);
    // The centered lip-syncing avatar is the screen…
    expect(screen.getByTestId('talk-center-stage')).toBeInTheDocument();
    expect(screen.getByTestId('center-avatar')).toBeInTheDocument();
    // …and the transcript text is NOT rendered on mobile.
    expect(screen.queryByText('hello')).toBeNull();
  });

  it('DESKTOP keeps the transcript (no center stage)', () => {
    mockIsMobile = false;
    // jsdom doesn't implement Element.scrollTo; the feed auto-scroll uses it.
    (HTMLElement.prototype as any).scrollTo = (HTMLElement.prototype as any).scrollTo ?? (() => {});
    sessionState = {
      ...sessionState,
      connected: true,
      transcript: [{ id: 'l1', speaker: 'you', text: 'hello', streaming: false } as any],
    };
    render(<TalkScreen />);
    expect(screen.queryByTestId('talk-center-stage')).toBeNull();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('ENDS the Talk session when it goes to the background (frees the Gemini session)', async () => {
    sessionState = { ...sessionState, connected: true, micOn: true };
    // Start in the foreground (live), then switch to another mode (backgrounded).
    const { rerender } = render(<TalkScreen backgrounded={false} />);
    stop.mockClear();
    await act(async () => { rerender(<TalkScreen backgrounded={true} />); });
    // Entering the background stops the live session so it stops burning credits
    // while Training/Roleplay (their own paid sessions) are active.
    expect(stop).toHaveBeenCalled();
  });

  it('DESKTOP renders the 3-panel workspace', () => {
    mockIsMobile = false;
    (HTMLElement.prototype as any).scrollTo = (HTMLElement.prototype as any).scrollTo ?? (() => {});
    sessionState = { ...sessionState, connected: true, searchLinks: [], transcript: [{ id: 'l1', speaker: 'you', text: 'hi', streaming: false } as any] };
    render(<TalkScreen />);
    expect(screen.getByTestId('canvas-host')).toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
  });

  it('DESKTOP opens a connect panel when a tool-result needs one', async () => {
    mockIsMobile = false;
    (HTMLElement.prototype as any).scrollTo = (HTMLElement.prototype as any).scrollTo ?? (() => {});
    let captured: ((r: any) => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useNicoleSessionMock as any).mockImplementation((opts: any) => { captured = opts.onToolResult; return sessionState; });
    sessionState = { ...sessionState, connected: true };
    render(<TalkScreen />);
    act(() => captured?.({ name: 'post_slack', ok: false, summary: '', needsConnect: 'slack' }));
    expect(await screen.findByTestId('panel-connect')).toBeInTheDocument();
  });
});
