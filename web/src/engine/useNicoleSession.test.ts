import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNicoleSession } from './useNicoleSession';

// ---------------------------------------------------------------------------
// Fake WebSocket
// ---------------------------------------------------------------------------

interface SentRecord {
  raw: string;
  parsed: unknown;
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: SentRecord[] = [];
  closed = false;
  closeCalls = 0;

  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    let parsed: unknown = data;
    try {
      parsed = JSON.parse(data);
    } catch {
      /* keep raw */
    }
    this.sent.push({ raw: data, parsed });
  }

  close(): void {
    this.closeCalls += 1;
    this.closed = true;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: 'normal' });
  }

  // --- test helpers --------------------------------------------------------
  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }

  emit(payloadObj: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payloadObj) });
  }

  /** Last fake created. */
  static last(): FakeWebSocket {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  }

  /** All connect-config messages sent across all instances. */
  static connectConfigs(): Array<Record<string, unknown>> {
    const configs: Array<Record<string, unknown>> = [];
    for (const inst of FakeWebSocket.instances) {
      for (const s of inst.sent) {
        const p = s.parsed as { type?: string; config?: Record<string, unknown> };
        if (p && p.type === 'connect' && p.config) configs.push(p.config);
      }
    }
    return configs;
  }
}

// ---------------------------------------------------------------------------
// Fake mic / AudioContext stubs
// ---------------------------------------------------------------------------

class FakeMediaStreamTrack {
  enabled = true;
  stopped = false;
  kind = 'audio';
  stop(): void {
    this.stopped = true;
  }
}

class FakeMediaStream {
  tracks: FakeMediaStreamTrack[];
  constructor() {
    this.tracks = [new FakeMediaStreamTrack()];
  }
  getTracks(): FakeMediaStreamTrack[] {
    return this.tracks;
  }
  getAudioTracks(): FakeMediaStreamTrack[] {
    return this.tracks;
  }
}

class FakeAudioNode {
  connected: FakeAudioNode[] = [];
  disconnectCalls = 0;
  onaudioprocess: ((ev: unknown) => void) | null = null;
  connect(node: FakeAudioNode): FakeAudioNode {
    this.connected.push(node);
    return node;
  }
  disconnect(): void {
    this.disconnectCalls += 1;
  }
}

class FakeAudioBuffer {
  length: number;
  numberOfChannels = 1;
  sampleRate: number;
  private data: Float32Array;
  constructor(length: number, sampleRate: number) {
    this.length = length;
    this.sampleRate = sampleRate;
    this.data = new Float32Array(length);
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  sampleRate: number;
  currentTime = 0;
  state: 'running' | 'suspended' | 'closed' = 'running';
  destination = new FakeAudioNode();
  closeCalls = 0;

  constructor(opts?: { sampleRate?: number }) {
    this.sampleRate = opts?.sampleRate ?? 48000;
    FakeAudioContext.instances.push(this);
  }
  createMediaStreamSource(): FakeAudioNode {
    return new FakeAudioNode();
  }
  createScriptProcessor(): FakeAudioNode {
    return new FakeAudioNode();
  }
  createGain(): FakeAudioNode & { gain: { value: number; setValueAtTime: () => void; setTargetAtTime: () => void } } {
    const n = new FakeAudioNode() as FakeAudioNode & { gain: { value: number; setValueAtTime: () => void; setTargetAtTime: () => void } };
    n.gain = { value: 1, setValueAtTime() {}, setTargetAtTime() {} };
    return n;
  }
  createAnalyser(): FakeAudioNode & {
    fftSize: number;
    frequencyBinCount: number;
    getByteTimeDomainData: (a: Uint8Array) => void;
    getFloatTimeDomainData: (a: Float32Array) => void;
  } {
    const n = new FakeAudioNode() as FakeAudioNode & {
      fftSize: number;
      frequencyBinCount: number;
      getByteTimeDomainData: (a: Uint8Array) => void;
      getFloatTimeDomainData: (a: Float32Array) => void;
    };
    n.fftSize = 256;
    n.frequencyBinCount = 128;
    n.getByteTimeDomainData = (a: Uint8Array) => a.fill(128);
    n.getFloatTimeDomainData = (a: Float32Array) => a.fill(0);
    return n;
  }
  createBuffer(_ch: number, length: number, sampleRate: number): FakeAudioBuffer {
    return new FakeAudioBuffer(length, sampleRate);
  }
  createBufferSource(): FakeAudioNode & {
    buffer: unknown;
    start: (when?: number) => void;
    stop: () => void;
    onended: (() => void) | null;
  } {
    const n = new FakeAudioNode() as FakeAudioNode & {
      buffer: unknown;
      start: (when?: number) => void;
      stop: () => void;
      onended: (() => void) | null;
    };
    n.buffer = null;
    n.onended = null;
    n.start = () => {};
    n.stop = () => {};
    return n;
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closeCalls += 1;
    this.state = 'closed';
    return Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Wiring globals
// ---------------------------------------------------------------------------

let getUserMediaMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  FakeWebSocket.instances = [];
  FakeAudioContext.instances = [];

  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
  vi.stubGlobal('AudioContext', FakeAudioContext as unknown as typeof AudioContext);
  // Some code paths look for webkitAudioContext.
  vi.stubGlobal(
    'webkitAudioContext',
    FakeAudioContext as unknown as typeof AudioContext,
  );

  getUserMediaMock = vi.fn(async () => new FakeMediaStream());
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: getUserMediaMock },
  });

  // requestAnimationFrame / cancel — deterministic no-op scheduler.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    return setTimeout(() => cb(performance.now?.() ?? 0), 0) as unknown as number;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function startSession(
  opts: Parameters<typeof useNicoleSession>[0],
): Promise<ReturnType<typeof renderHook<ReturnType<typeof useNicoleSession>, unknown>>> {
  const view = renderHook(() => useNicoleSession(opts));
  await act(async () => {
    await view.result.current.start();
  });
  // Drive the socket to OPEN so connect is flushed.
  await act(async () => {
    FakeWebSocket.last().emitOpen();
  });
  return view;
}

describe('useNicoleSession', () => {
  it('start() opens a WebSocket and sends a connect message with the voiceName', async () => {
    const view = await startSession({
      voiceName: 'Kore',
      serverWs: 'ws://test/ai-live',
    });

    expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(1);
    expect(FakeWebSocket.last().url).toBe('ws://test/ai-live');

    const configs = FakeWebSocket.connectConfigs();
    expect(configs.length).toBeGreaterThanOrEqual(1);
    expect(configs[0].voiceName).toBe('Kore');

    expect(view.result.current.connected).toBe(true);
  });

  // Helper: emit one Gemini serverContent message.
  const emit = (sc: Record<string, unknown>) =>
    FakeWebSocket.last().emit({ type: 'message', payload: { serverContent: sc } });

  it('streams into realtime lines, then commits one bubble per speaker on turnComplete', async () => {
    const view = await startSession({ voiceName: 'Aoede', serverWs: 'ws://test/ai-live' });
    act(() => {
      emit({ inputTranscription: { text: 'hello nicole' } });
      emit({ outputTranscription: { text: 'hi there' } });
    });
    // Before turnComplete: text lives in the live (realtime) lines, NOT committed.
    expect(view.result.current.realtime.you).toContain('hello nicole');
    expect(view.result.current.realtime.nicole).toContain('hi there');
    expect(view.result.current.transcript).toHaveLength(0);
    // turnComplete commits both as one bubble each, clearing realtime.
    act(() => { emit({ turnComplete: true }); });
    const t = view.result.current.transcript;
    expect(t.find((l) => l.speaker === 'you')?.text).toContain('hello nicole');
    expect(t.find((l) => l.speaker === 'nicole')?.text).toContain('hi there');
    expect(view.result.current.realtime.you).toBe('');
    expect(view.result.current.realtime.nicole).toBe('');
  });

  it('keeps ONE bubble per speaker even when input/output transcription interleave', async () => {
    const view = await startSession({ voiceName: 'Aoede', serverWs: 'ws://test/ai-live' });
    const youFrags = ['It', "'s ", 'go', 'ing ', 'good'];
    const nicoleFrags = ['That', "'s ", 'great ', 'to ', 'hear'];
    act(() => {
      for (let i = 0; i < youFrags.length; i++) {
        emit({ inputTranscription: { text: youFrags[i] } });
        emit({ outputTranscription: { text: nicoleFrags[i] } });
      }
      emit({ turnComplete: true });
    });
    const t = view.result.current.transcript;
    const you = t.filter((l) => l.speaker === 'you');
    const nicole = t.filter((l) => l.speaker === 'nicole');
    expect(you).toHaveLength(1);
    expect(nicole).toHaveLength(1);
    expect(you[0].text.replace(/\s+/g, '')).toBe("It'sgoinggood");
    expect(nicole[0].text.replace(/\s+/g, '')).toBe("That'sgreattohear");
  });

  it('commits lines in chronological (start) order — you BEFORE Nicole, never swapped', async () => {
    const view = await startSession({ voiceName: 'Aoede', serverWs: 'ws://test/ai-live' });
    // You start speaking first; Nicole's reply begins after and its chunks keep
    // arriving (so Nicole is the LAST speaker to chunk before turnComplete). The
    // old code ordered by last-chunk speaker and put Nicole's line ABOVE yours.
    act(() => {
      emit({ inputTranscription: { text: 'Air is so slow' } });
      emit({ outputTranscription: { text: 'I understand, ' } });
      emit({ outputTranscription: { text: 'it should clear up soon' } });
      emit({ turnComplete: true });
    });
    const t = view.result.current.transcript;
    expect(t).toHaveLength(2);
    // Your line must come FIRST, Nicole's reply SECOND.
    expect(t[0].speaker).toBe('you');
    expect(t[0].text).toContain('Air is so slow');
    expect(t[1].speaker).toBe('nicole');
    expect(t[1].text).toContain('it should clear up soon');
  });

  it('keeps the user in ONE bubble when speaking SLOWLY (real-time gaps between words)', async () => {
    const view = await startSession({ voiceName: 'Aoede', serverWs: 'ws://test/ai-live' });
    const frags = ['No, I', "'m also ", 'ready ', 'to ', 'dive in'];
    for (const f of frags) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        emit({ inputTranscription: { text: f } });
        await new Promise((r) => setTimeout(r, 80)); // a real pause between words
      });
    }
    // Mid-utterance: still ONE growing realtime line, nothing committed yet.
    expect(view.result.current.transcript).toHaveLength(0);
    expect(view.result.current.realtime.you.replace(/\s+/g, '')).toBe("No,I'malsoreadytodivein");
    // Turn ends → exactly one committed bubble.
    act(() => { emit({ turnComplete: true }); });
    const you = view.result.current.transcript.filter((l) => l.speaker === 'you');
    expect(you).toHaveLength(1);
    expect(you[0].text.replace(/\s+/g, '')).toBe("No,I'malsoreadytodivein");
  });

  it('commits Nicole’s bubble on turnComplete (one bubble, caret cleared)', async () => {
    const view = await startSession({ voiceName: 'Aoede', serverWs: 'ws://test/ai-live' });
    act(() => { emit({ outputTranscription: { text: 'All done here.' } }); });
    expect(view.result.current.realtime.nicole).toContain('All done here.');
    act(() => { emit({ turnComplete: true }); });
    const nicole = view.result.current.transcript.filter((l) => l.speaker === 'nicole');
    expect(nicole).toHaveLength(1);
    expect(nicole[0].text).toContain('All done here.');
    expect(nicole[0].streaming).toBe(false);
    expect(view.result.current.realtime.nicole).toBe('');
  });

  it('handles a CUMULATIVE transcription snapshot without double-printing', async () => {
    const view = await startSession({ voiceName: 'Aoede', serverWs: 'ws://test/ai-live' });
    // Gemini 3.1 sends input transcription as a growing FULL string, not deltas.
    act(() => {
      emit({ inputTranscription: { text: 'Hi' } });
      emit({ inputTranscription: { text: 'Hi there' } });
      emit({ inputTranscription: { text: 'Hi there friend' } });
      emit({ turnComplete: true });
    });
    const you = view.result.current.transcript.filter((l) => l.speaker === 'you');
    expect(you).toHaveLength(1);
    expect(you[0].text).toBe('Hi there friend'); // replaced, not concatenated
  });

  it('setVoice reconnects with the new voiceName in the connect config', async () => {
    const view = await startSession({
      voiceName: 'Aoede',
      serverWs: 'ws://test/ai-live',
    });
    const firstWs = FakeWebSocket.last();

    await act(async () => {
      view.result.current.setVoice('Charon');
    });
    await act(async () => {
      // New socket opens.
      FakeWebSocket.last().emitOpen();
    });

    // Original socket was closed during reconnect.
    expect(firstWs.closeCalls).toBeGreaterThanOrEqual(1);

    const configs = FakeWebSocket.connectConfigs();
    const last = configs[configs.length - 1];
    expect(last.voiceName).toBe('Charon');
  });

  it('stop() closes the WebSocket and stops all mic tracks', async () => {
    const view = await startSession({
      voiceName: 'Aoede',
      serverWs: 'ws://test/ai-live',
    });
    const ws = FakeWebSocket.last();
    const stream = await getUserMediaMock.mock.results[0].value;

    act(() => {
      view.result.current.stop();
    });

    expect(ws.closeCalls).toBeGreaterThanOrEqual(1);
    for (const track of stream.getTracks()) {
      expect(track.stopped).toBe(true);
    }
    await waitFor(() => {
      expect(
        FakeAudioContext.instances.every((c) => c.closeCalls >= 1),
      ).toBe(true);
    });
  });

  it('unmount closes the WebSocket and stops mic tracks (leak-safety)', async () => {
    const view = await startSession({
      voiceName: 'Aoede',
      serverWs: 'ws://test/ai-live',
    });
    const ws = FakeWebSocket.last();
    const stream = await getUserMediaMock.mock.results[0].value;

    act(() => {
      view.unmount();
    });

    expect(ws.closeCalls).toBeGreaterThanOrEqual(1);
    for (const track of stream.getTracks()) {
      expect(track.stopped).toBe(true);
    }
  });

  it('caps the transcript so it cannot grow unbounded', async () => {
    const view = await startSession({
      voiceName: 'Aoede',
      serverWs: 'ws://test/ai-live',
    });

    act(() => {
      const ws = FakeWebSocket.last();
      for (let i = 0; i < 1200; i++) {
        ws.emit({
          type: 'message',
          payload: {
            serverContent: {
              outputTranscription: { text: `line ${i}` },
              turnComplete: true,
            },
          },
        });
      }
    });

    expect(view.result.current.transcript.length).toBeLessThanOrEqual(400);
  });

  it('toggleMic flips the micOn flag and the track enabled state', async () => {
    const view = await startSession({
      voiceName: 'Aoede',
      serverWs: 'ws://test/ai-live',
    });
    const stream = await getUserMediaMock.mock.results[0].value;

    expect(view.result.current.micOn).toBe(true);
    act(() => {
      view.result.current.toggleMic();
    });
    expect(view.result.current.micOn).toBe(false);
    expect(stream.getTracks()[0].enabled).toBe(false);
  });

  it('afterNextModelTurn fires on the next turnComplete', async () => {
    const view = await startSession({ voiceName: 'Aoede', serverWs: 'ws://test/ai-live' });
    let fired = false;
    act(() => {
      // mid-utterance: nicole has streamed text but no turnComplete yet
      emit({ outputTranscription: { text: 'thinking...' } });
      view.result.current.afterNextModelTurn(() => { fired = true; });
    });
    expect(fired).toBe(false);
    act(() => { emit({ turnComplete: true }); });
    expect(fired).toBe(true);
  });

  it('afterNextModelTurn also fires on barge-in (interrupted), not just turnComplete', async () => {
    const view = await startSession({ voiceName: 'Aoede', serverWs: 'ws://test/ai-live' });
    let fired = false;
    act(() => {
      emit({ outputTranscription: { text: 'mid sentence' } });
      view.result.current.afterNextModelTurn(() => { fired = true; });
    });
    expect(fired).toBe(false);
    // Barge-in ends her turn → the deferred callback should fire immediately,
    // not wait out the 6s safety timeout.
    act(() => { emit({ interrupted: true }); });
    expect(fired).toBe(true);
  });
});
