import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { UseNicoleSessionOptions } from '../engine/useNicoleSession';
import type { TranscriptLine } from '../engine/types';

/**
 * A fake useNicoleSession that records, per instance, the latest options it was
 * called with and whether start/stop were invoked. We key instances by `mode`
 * so the test can assert on the coach vs. prospect session independently.
 */
interface FakeInstance {
  options: UseNicoleSessionOptions;
  started: boolean;
  startCalls: number;
  stopped: boolean;
  stopCalls: number;
  /** Transcript lines fed by simulateUserTurn for auto-advance tests. */
  transcript: TranscriptLine[];
  /** Every text sent via sendText (used to assert the one-shot opener). */
  sentTexts: string[];
}

const instances: FakeInstance[] = [];

// The hook reads the auth token via useAuth; stub it so no AuthProvider is needed.
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', user: null }),
}));

vi.mock('../engine/useNicoleSession', () => {
  return {
    useNicoleSession: (opts: UseNicoleSessionOptions) => {
      // React calls the hook on every render; reuse a stable instance per slot.
      // We allocate one FakeInstance per mode the first time we see it.
      let inst = instances.find((i) => i.options.mode === opts.mode);
      if (!inst) {
        inst = {
          options: opts,
          started: false,
          startCalls: 0,
          stopped: false,
          stopCalls: 0,
          transcript: [],
          sentTexts: [],
        };
        instances.push(inst);
      }
      inst.options = opts; // keep latest options (e.g. updated systemOverlay)
      return {
        connected: inst.started,
        micOn: false,
        transcript: inst.transcript,
        realtime: { you: '', nicole: '' },
        amplitude: 0,
        start: async () => {
          inst!.started = true;
          inst!.startCalls += 1;
        },
        stop: () => {
          inst!.stopped = true;
          inst!.stopCalls += 1;
        },
        toggleMic: () => {},
        setVoice: () => {},
        sendText: (text: string) => { inst!.sentTexts.push(text); },
        afterNextModelTurn: (cb: () => void) => { cb(); },
      };
    },
  };
});

// Import AFTER the mock is registered.
import { useCoachingSession } from './useCoachingSession';
import { LESSONS } from './lessons';

const coach = () => instances.find((i) => i.options.mode === 'coach')!;
const prospect = () => instances.find((i) => i.options.mode === 'prospect')!;

/** Render the hook and return both the react-testing-library handle and a helper
 *  that pushes a `{speaker:'you'}` committed line into the fake coach transcript
 *  so the auto-advance evaluator can count it as a user turn. */
function renderCoaching(lesson = LESSONS[0]) {
  const { result, rerender, unmount } = renderHook(() =>
    useCoachingSession({ lesson }),
  );
  return {
    result,
    rerender,
    unmount,
    simulateUserTurn(text = 'hi') {
      const inst = instances.find((i) => i.options.mode === 'coach');
      if (!inst) return;
      inst.transcript = [
        ...inst.transcript,
        { id: `t${Date.now()}`, speaker: 'you' as const, text, streaming: false },
      ];
      // Re-render the hook so it picks up the transcript change.
      rerender();
    },
  };
}

beforeEach(() => {
  instances.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useCoachingSession', () => {
  const lesson = LESSONS[0];

  it('creates a coach session (mode coach) and a prospect session (mode prospect)', () => {
    renderHook(() => useCoachingSession({ lesson }));
    expect(coach()).toBeDefined();
    expect(prospect()).toBeDefined();
    expect(coach().options.mode).toBe('coach');
    expect(prospect().options.mode).toBe('prospect');
  });

  it('starts at the intro phase', () => {
    const { result } = renderHook(() => useCoachingSession({ lesson }));
    expect(result.current.phase).toBe('intro');
  });

  it('coach overlay is the phase prompt for the current phase', () => {
    const { result } = renderHook(() => useCoachingSession({ lesson }));
    expect(result.current.phase).toBe('intro');
    // Intro overlay names the hook; later phases would not in the same way.
    expect(coach().options.systemOverlay).toContain(lesson.hook);
  });

  it('start() starts the coach session but NOT the prospect', async () => {
    const { result } = renderHook(() => useCoachingSession({ lesson }));
    await act(async () => {
      await result.current.start();
    });
    expect(coach().started).toBe(true);
    expect(prospect().started).toBe(false);
  });

  it('advance() moves the phase per phaseMachine', () => {
    const { result } = renderHook(() => useCoachingSession({ lesson }));
    expect(result.current.phase).toBe('intro');
    act(() => result.current.advance());
    expect(result.current.phase).toBe('teach');
    act(() => result.current.advance());
    expect(result.current.phase).toBe('model');
  });

  it('re-starts the coach with an updated overlay when the phase changes', async () => {
    const { result } = renderHook(() => useCoachingSession({ lesson }));
    await act(async () => {
      await result.current.start();
    });
    const startsAfterStart = coach().startCalls;
    const introOverlay = coach().options.systemOverlay;
    act(() => result.current.advance());
    expect(result.current.phase).toBe('teach');
    // Overlay updated to the teach phase prompt...
    expect(coach().options.systemOverlay).not.toBe(introOverlay);
    // ...and the coach reconnected with the new overlay.
    expect(coach().startCalls).toBeGreaterThan(startsAfterStart);
  });

  it('activates the prospect session only during roleplay_demo', async () => {
    const { result } = renderHook(() => useCoachingSession({ lesson }));
    await act(async () => {
      await result.current.start();
    });
    // Walk to roleplay_demo: intro -> teach -> model -> guided_practice ->
    // readiness_check -> roleplay_demo (5 advances).
    for (let i = 0; i < 5; i++) act(() => result.current.advance());
    expect(result.current.phase).toBe('roleplay_demo');
    expect(prospect().started).toBe(true);

    // Leaving roleplay_demo (-> debrief) stops the prospect.
    act(() => result.current.advance());
    expect(result.current.phase).toBe('debrief');
    expect(prospect().stopped).toBe(true);
  });

  it('markProgress appends a ScoreEntry to the scorecard', () => {
    const { result } = renderHook(() => useCoachingSession({ lesson }));
    expect(result.current.scorecard).toHaveLength(0);
    act(() =>
      result.current.markProgress({
        dimension: 'Acknowledge',
        hit: true,
        tip: 'Nice, you validated first.',
      }),
    );
    expect(result.current.scorecard).toHaveLength(1);
    expect(result.current.scorecard[0]).toEqual({
      dimension: 'Acknowledge',
      hit: true,
      tip: 'Nice, you validated first.',
    });
    act(() =>
      result.current.markProgress({
        dimension: 'Clarify',
        hit: false,
        tip: 'Ask what expensive means.',
      }),
    );
    expect(result.current.scorecard).toHaveLength(2);
  });

  it('stop() stops BOTH the coach and prospect sessions', async () => {
    const { result } = renderHook(() => useCoachingSession({ lesson }));
    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.stop());
    expect(coach().stopped).toBe(true);
    expect(prospect().stopped).toBe(true);
  });

  it('uses the provided coach and prospect voices', () => {
    renderHook(() =>
      useCoachingSession({
        lesson,
        coachVoice: 'Kore',
        prospectVoice: 'Charon',
      }),
    );
    expect(coach().options.voiceName).toBe('Kore');
    expect(prospect().options.voiceName).toBe('Charon');
  });
});

describe('useCoachingSession — auto-advance', () => {
  beforeEach(() => {
    instances.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('auto-advances intro after a turn + min dwell using fake timers', async () => {
    vi.useFakeTimers();
    const view = renderCoaching();
    await act(async () => { await view.result.current.start(); });
    // simulate one user turn in intro (triggers the transcript-change evaluator)
    await act(async () => { view.simulateUserTurn('hello'); });
    // advance fake time past intro minPhaseMs (6s) + the 2s evaluator tick
    await act(async () => { vi.advanceTimersByTime(9000); });
    expect(view.result.current.phase).toBe('teach');
  });

  it('fires the coach opener ONCE per session, not on every phase reconnect', async () => {
    vi.useFakeTimers();
    const view = renderCoaching();
    await act(async () => { await view.result.current.start(); });
    // Re-render so the hook observes coach.connected=true (the fake flips a flag
    // inside start(); the effect that fires the opener runs on the next render).
    await act(async () => { view.rerender(); });
    // Let the 500ms opener timeout fire on the first connect.
    await act(async () => { vi.advanceTimersByTime(600); });
    const openCount = () => coach().sentTexts.filter((t) => t.startsWith('[OPEN]')).length;
    expect(openCount()).toBe(1);
    // A manual phase advance reconnects the coach to push the new overlay; the
    // opener must NOT fire again (else she re-introduces herself mid-lesson).
    await act(async () => { view.result.current.advance(); });
    await act(async () => { view.rerender(); });
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(openCount()).toBe(1);
  });
});
