// web/src/canvas/useCanvas.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCanvas } from './useCanvas';

describe('useCanvas', () => {
  it('opens a panel and lists it', () => {
    const { result } = renderHook(() => useCanvas());
    act(() => result.current.open('weather', { place: 'Pune' }));
    expect(result.current.panels).toHaveLength(1);
    expect(result.current.panels[0]).toMatchObject({ type: 'weather', key: 'weather', args: { place: 'Pune' } });
  });

  it('is a singleton per type — reopening refreshes, not duplicates', () => {
    const { result } = renderHook(() => useCanvas());
    act(() => result.current.open('weather', { place: 'A' }));
    act(() => result.current.open('weather', { place: 'B' }));
    expect(result.current.panels).toHaveLength(1);
    expect(result.current.panels[0].args).toEqual({ place: 'B' });
  });

  it('keeps one connect card PER provider', () => {
    const { result } = renderHook(() => useCanvas());
    act(() => result.current.open('connect', { provider: 'slack' }));
    act(() => result.current.open('connect', { provider: 'gmail' }));
    expect(result.current.panels).toHaveLength(2);
    expect(result.current.panels.map((p) => p.key)).toEqual(['connect:slack', 'connect:gmail']);
  });

  it('close removes one panel (by type, or provider for connect)', () => {
    const { result } = renderHook(() => useCanvas());
    act(() => result.current.open('connect', { provider: 'slack' }));
    act(() => result.current.open('weather'));
    act(() => result.current.close('connect', 'slack'));
    expect(result.current.panels.map((p) => p.key)).toEqual(['weather']);
  });

  it("close('connect') with NO provider closes ALL connect cards", () => {
    const { result } = renderHook(() => useCanvas());
    act(() => result.current.open('connect', { provider: 'slack' }));
    act(() => result.current.open('connect', { provider: 'gmail' }));
    act(() => result.current.open('weather'));
    // Nicole calling close_panel({ type: 'connect' }) with no provider must clear
    // every connect card (not build a bogus connect:unknown key that matches none).
    act(() => result.current.close('connect'));
    expect(result.current.panels.map((p) => p.key)).toEqual(['weather']);
  });

  it('closeAll empties the canvas', () => {
    const { result } = renderHook(() => useCanvas());
    act(() => result.current.open('weather'));
    act(() => result.current.open('note', { text: 'hi' }));
    act(() => result.current.closeAll());
    expect(result.current.panels).toHaveLength(0);
  });
});
