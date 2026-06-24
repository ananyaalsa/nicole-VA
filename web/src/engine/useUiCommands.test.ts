import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUiCommands } from './useUiCommands';

describe('useUiCommands', () => {
  it('dispatches a tool call to the matching action handler', () => {
    const setCamera = vi.fn();
    const { result } = renderHook(() => useUiCommands({ set_camera: setCamera }));
    result.current.onToolCall([{ name: 'set_camera', args: { on: true } }]);
    expect(setCamera).toHaveBeenCalledWith({ on: true });
  });

  it('routes several calls to their handlers', () => {
    const setVoice = vi.fn();
    const muteAi = vi.fn();
    const { result } = renderHook(() =>
      useUiCommands({ set_voice: setVoice, mute_ai: muteAi }),
    );
    result.current.onToolCall([
      { name: 'set_voice', args: { voiceName: 'Leda' } },
      { name: 'mute_ai', args: { muted: true } },
    ]);
    expect(setVoice).toHaveBeenCalledWith({ voiceName: 'Leda' });
    expect(muteAi).toHaveBeenCalledWith({ muted: true });
  });

  it('ignores a call with no registered handler', () => {
    const { result } = renderHook(() => useUiCommands({ set_camera: vi.fn() }));
    expect(() => result.current.onToolCall([{ name: 'unknown', args: {} }])).not.toThrow();
  });

  it('always calls the LATEST handler closure (no stale state)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ fn }) => useUiCommands({ set_camera: fn }),
      { initialProps: { fn: first } },
    );
    rerender({ fn: second });
    result.current.onToolCall([{ name: 'set_camera', args: { on: false } }]);
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });
});
