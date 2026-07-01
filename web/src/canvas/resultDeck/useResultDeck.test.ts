import { renderHook, act } from '@testing-library/react';
import { useResultDeck } from './useResultDeck';

const wx = { place: 'Chicago', tempC: 26, feelsC: 30, condition: 'Clear sky', icon: '☀️', forecast: [] };

describe('useResultDeck', () => {
  it('pushes an item as an overlay and returns its id', () => {
    const { result } = renderHook(() => useResultDeck());
    let id = '';
    act(() => { id = result.current.push('weather', wx, { label: 'Weather · Chicago', icon: '☀️' }); });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({ id, kind: 'weather', state: 'overlay', label: 'Weather · Chicago' });
  });

  it('collapse → pill, expand → overlay, dismiss → removed', () => {
    const { result } = renderHook(() => useResultDeck());
    let id = '';
    act(() => { id = result.current.push('news', { items: [] }, { label: 'Top news', icon: '📰' }); });
    act(() => result.current.collapse(id));
    expect(result.current.items[0].state).toBe('pill');
    act(() => result.current.expand(id));
    expect(result.current.items[0].state).toBe('overlay');
    act(() => result.current.dismiss(id));
    expect(result.current.items).toHaveLength(0);
  });

  it('weather is singleton: a second weather push replaces payload and re-opens', () => {
    const { result } = renderHook(() => useResultDeck());
    act(() => { result.current.push('weather', wx, { label: 'Weather · Chicago', icon: '☀️' }); });
    act(() => { result.current.collapse(result.current.items[0].id); });
    act(() => { result.current.push('weather', { ...wx, tempC: 28 }, { label: 'Weather · Chicago', icon: '☀️' }); });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].state).toBe('overlay');
    expect((result.current.items[0].payload as typeof wx).tempC).toBe(28);
  });

  it('non-weather kinds stack (multiple pills)', () => {
    const { result } = renderHook(() => useResultDeck());
    act(() => { result.current.push('news', { items: [] }, { label: 'News', icon: '📰' }); });
    act(() => { result.current.push('products', { query: 'x', products: [] }, { label: 'Headsets', icon: '🛒' }); });
    expect(result.current.items).toHaveLength(2);
  });
});
