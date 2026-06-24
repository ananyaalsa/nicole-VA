import { describe, it, expect, vi } from 'vitest';
import { UiCommandBus, extractToolCalls } from './uiCommands';

describe('UiCommandBus', () => {
  it('dispatches a call to its registered handler with args', () => {
    const bus = new UiCommandBus();
    const handler = vi.fn();
    bus.register('set_camera', handler);
    const ran = bus.dispatch({ name: 'set_camera', args: { on: true } });
    expect(ran).toBe(true);
    expect(handler).toHaveBeenCalledWith({ on: true });
  });

  it('returns false and calls onUnknown for an unregistered command', () => {
    const bus = new UiCommandBus();
    const unknown = vi.fn();
    bus.onUnknown(unknown);
    const ran = bus.dispatch({ name: 'nope', args: {} });
    expect(ran).toBe(false);
    expect(unknown).toHaveBeenCalledWith({ name: 'nope', args: {} });
  });

  it('unregister removes the handler', () => {
    const bus = new UiCommandBus();
    const handler = vi.fn();
    const off = bus.register('mute_ai', handler);
    off();
    expect(bus.has('mute_ai')).toBe(false);
    expect(bus.dispatch({ name: 'mute_ai', args: { muted: true } })).toBe(false);
  });

  it('dispatchAll runs each call', () => {
    const bus = new UiCommandBus();
    const cam = vi.fn();
    const voice = vi.fn();
    bus.register('set_camera', cam);
    bus.register('set_voice', voice);
    bus.dispatchAll([
      { name: 'set_camera', args: { on: true } },
      { name: 'set_voice', args: { voiceName: 'Leda' } },
    ]);
    expect(cam).toHaveBeenCalled();
    expect(voice).toHaveBeenCalledWith({ voiceName: 'Leda' });
  });
});

describe('extractToolCalls', () => {
  it('pulls function calls out of a raw Gemini message', () => {
    const payload = {
      toolCall: {
        functionCalls: [
          { id: '1', name: 'set_camera', args: { on: true } },
          { id: '2', name: 'switch_mode', args: { mode: 'training' } },
        ],
      },
    };
    expect(extractToolCalls(payload)).toEqual([
      { name: 'set_camera', args: { on: true } },
      { name: 'switch_mode', args: { mode: 'training' } },
    ]);
  });

  it('returns [] when there are no tool calls', () => {
    expect(extractToolCalls({ serverContent: {} })).toEqual([]);
    expect(extractToolCalls(null)).toEqual([]);
  });
});
