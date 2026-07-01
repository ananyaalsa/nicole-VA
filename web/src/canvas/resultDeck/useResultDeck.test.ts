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

  it('bumps version on every push (incl. weather singleton replace) so the error boundary can reset', () => {
    const { result } = renderHook(() => useResultDeck());
    act(() => { result.current.push('weather', wx, { label: 'W', icon: '☀️' }); });
    const v1 = result.current.items[0].version;
    act(() => { result.current.push('weather', { ...wx, tempC: 28 }, { label: 'W', icon: '☀️' }); });
    const v2 = result.current.items[0].version;
    expect(v2).toBeGreaterThan(v1); // same id, new version → boundary resetKey changes
  });

  it('caps the non-weather stack at 6, keeping the most recent (fix E)', () => {
    const { result } = renderHook(() => useResultDeck());
    // Push 8 non-weather items with distinguishable labels.
    for (let n = 1; n <= 8; n++) {
      act(() => { result.current.push('news', { items: [] }, { label: `News ${n}`, icon: '📰' }); });
    }
    const nonWeather = result.current.items.filter((i) => i.kind !== 'weather');
    expect(nonWeather).toHaveLength(6);
    // The 2 oldest (News 1, News 2) were trimmed; News 3–8 remain in order.
    expect(nonWeather.map((i) => i.label)).toEqual(['News 3', 'News 4', 'News 5', 'News 6', 'News 7', 'News 8']);
  });

  it('the weather singleton survives the non-weather cap (fix E)', () => {
    const { result } = renderHook(() => useResultDeck());
    act(() => { result.current.push('weather', wx, { label: 'Weather · Chicago', icon: '☀️' }); });
    for (let n = 1; n <= 8; n++) {
      act(() => { result.current.push('products', { query: `q${n}`, products: [] }, { label: `P ${n}`, icon: '🛒' }); });
    }
    // Weather singleton preserved + 6 most-recent products = 7 total.
    expect(result.current.items.filter((i) => i.kind === 'weather')).toHaveLength(1);
    expect(result.current.items.filter((i) => i.kind !== 'weather')).toHaveLength(6);
  });

  it('clear() wipes the whole deck (fix G)', () => {
    const { result } = renderHook(() => useResultDeck());
    act(() => { result.current.push('weather', wx, { label: 'W', icon: '☀️' }); });
    act(() => { result.current.push('news', { items: [] }, { label: 'N', icon: '📰' }); });
    expect(result.current.items.length).toBeGreaterThan(0);
    act(() => result.current.clear());
    expect(result.current.items).toHaveLength(0);
  });
});
