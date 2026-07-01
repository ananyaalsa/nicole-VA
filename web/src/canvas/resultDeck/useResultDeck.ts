import { useCallback, useRef, useState } from 'react';
import type { ResultItem, ResultKind, ResultMeta, ResultPayload } from './resultTypes';

export interface ResultDeck {
  items: ResultItem[];
  push(kind: ResultKind, payload: ResultPayload, meta: ResultMeta): string;
  collapse(id: string): void;
  expand(id: string): void;
  dismiss(id: string): void;
  clear(): void;
}

/** Max non-weather items retained. Over a long session the news/search/product
 *  stack would otherwise grow without bound; we keep only the most recent few.
 *  The weather singleton is preserved on top of this cap. */
const MAX_STACK = 6;

/** Timed result deck: weather/news/search/products as overlay→pill items. */
export function useResultDeck(): ResultDeck {
  const [items, setItems] = useState<ResultItem[]>([]);
  const seq = useRef(0);
  const ver = useRef(0);

  const push = useCallback((kind: ResultKind, payload: ResultPayload, meta: ResultMeta): string => {
    // weather is a singleton — replace its payload and re-open as an overlay.
    if (kind === 'weather') {
      let id = '';
      setItems((prev) => {
        const existing = prev.find((i) => i.kind === 'weather');
        if (existing) {
          id = existing.id;
          return prev.map((i) => i.kind === 'weather'
            ? { ...i, payload, label: meta.label, icon: meta.icon, state: 'overlay' as const, version: ++ver.current } : i);
        }
        id = `r${++seq.current}`;
        return [...prev, { id, kind, payload, label: meta.label, icon: meta.icon, state: 'overlay' as const, version: ++ver.current }];
      });
      return id;
    }
    const id = `r${++seq.current}`;
    setItems((prev) => {
      const next = [...prev, { id, kind, payload, label: meta.label, icon: meta.icon, state: 'overlay' as const, version: ++ver.current }];
      // Cap the non-weather stack: keep the weather singleton (if any) plus the
      // MAX_STACK most-recent non-weather items; drop the oldest beyond that.
      const nonWeather = next.filter((i) => i.kind !== 'weather');
      if (nonWeather.length <= MAX_STACK) return next;
      const keep = new Set(nonWeather.slice(nonWeather.length - MAX_STACK).map((i) => i.id));
      return next.filter((i) => i.kind === 'weather' || keep.has(i.id));
    });
    return id;
  }, []);

  const collapse = useCallback((id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, state: 'pill' } : i)));
  }, []);
  const expand = useCallback((id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, state: 'overlay' } : i)));
  }, []);
  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);
  // Wipe the whole deck — used when a session ends so stale overlays/pills don't
  // leak into the next session.
  const clear = useCallback(() => setItems([]), []);

  return { items, push, collapse, expand, dismiss, clear };
}
