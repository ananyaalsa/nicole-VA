import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCamera } from './useCamera';

// Minimal fakes for getUserMedia + canvas + video.
class FakeTrack {
  stopped = false;
  listeners: Record<string, Array<() => void>> = {};
  stop() {
    this.stopped = true;
  }
  addEventListener(ev: string, cb: () => void) {
    (this.listeners[ev] ??= []).push(cb);
  }
  // Test helper: simulate the browser's "Stop sharing" ending the track.
  end() {
    for (const cb of this.listeners['ended'] ?? []) cb();
  }
}
class FakeStream {
  tracks = [new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
  // Real MediaStreams expose this; attachStream wires the 'ended' teardown via it.
  getVideoTracks() {
    return this.tracks;
  }
}

beforeEach(() => {
  const getUserMedia = vi.fn(async () => new FakeStream() as unknown as MediaStream);
  const getDisplayMedia = vi.fn(async () => new FakeStream() as unknown as MediaStream);
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: { getUserMedia, getDisplayMedia },
    configurable: true,
  });
  // canvas.getContext + toDataURL
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(
    () => 'data:image/jpeg;base64,ABC123',
  ) as never;
  // video.play resolves, and pretend a frame is ready.
  HTMLVideoElement.prototype.play = vi.fn(async () => {});
  Object.defineProperty(HTMLVideoElement.prototype, 'readyState', {
    get: () => 4,
    configurable: true,
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
    get: () => 640,
    configurable: true,
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
    get: () => 480,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCamera', () => {
  it('starts the camera and reports it is on', async () => {
    const onFrame = vi.fn();
    const { result } = renderHook(() => useCamera({ onFrame, intervalMs: 10 }));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.on).toBe(true);
    expect(result.current.stream).not.toBeNull();
  });

  it('captures frames and calls onFrame with base64 (no data: prefix)', async () => {
    const onFrame = vi.fn();
    const { result } = renderHook(() => useCamera({ onFrame, intervalMs: 10 }));
    await act(async () => {
      await result.current.start();
    });
    await waitFor(() => expect(onFrame).toHaveBeenCalled());
    expect(onFrame).toHaveBeenCalledWith('ABC123');
  });

  it('stop() turns it off and stops the tracks', async () => {
    const onFrame = vi.fn();
    const { result } = renderHook(() => useCamera({ onFrame, intervalMs: 10 }));
    let stream: FakeStream | null = null;
    await act(async () => {
      await result.current.start();
    });
    stream = result.current.stream as unknown as FakeStream;
    act(() => result.current.stop());
    expect(result.current.on).toBe(false);
    expect(stream.getTracks()[0].stopped).toBe(true);
  });

  it('startScreen() shares the screen and marks the source as "screen"', async () => {
    const onFrame = vi.fn();
    const { result } = renderHook(() => useCamera({ onFrame, intervalMs: 10 }));
    await act(async () => {
      await result.current.startScreen();
    });
    expect(result.current.on).toBe(true);
    expect(result.current.source).toBe('screen');
  });

  it('tears down when the shared track ends (browser "Stop sharing")', async () => {
    const onFrame = vi.fn();
    const { result } = renderHook(() => useCamera({ onFrame, intervalMs: 10 }));
    await act(async () => {
      await result.current.startScreen();
    });
    const stream = result.current.stream as unknown as FakeStream;
    act(() => stream.getTracks()[0].end());
    expect(result.current.on).toBe(false);
    expect(result.current.source).toBeNull();
  });
});
