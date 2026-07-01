import { useCallback, useRef, useState } from 'react';
import type { ResultItem, ResultKind, ResultMeta, ResultPayload } from './resultTypes';

export interface ResultDeck {
  items: ResultItem[];
  push(kind: ResultKind, payload: ResultPayload, meta: ResultMeta): string;
  collapse(id: string): void;
  expand(id: string): void;
  dismiss(id: string): void;
}

/** Timed result deck: weather/news/search/products as overlay→pill items. */
export function useResultDeck(): ResultDeck {
  const [items, setItems] = useState<ResultItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((kind: ResultKind, payload: ResultPayload, meta: ResultMeta): string => {
    // weather is a singleton — replace its payload and re-open as an overlay.
    if (kind === 'weather') {
      let id = '';
      setItems((prev) => {
        const existing = prev.find((i) => i.kind === 'weather');
        if (existing) {
          id = existing.id;
          return prev.map((i) => i.kind === 'weather'
            ? { ...i, payload, label: meta.label, icon: meta.icon, state: 'overlay' as const } : i);
        }
        id = `r${++seq.current}`;
        return [...prev, { id, kind, payload, label: meta.label, icon: meta.icon, state: 'overlay' as const }];
      });
      return id;
    }
    const id = `r${++seq.current}`;
    setItems((prev) => [...prev, { id, kind, payload, label: meta.label, icon: meta.icon, state: 'overlay' }]);
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

  return { items, push, collapse, expand, dismiss };
}
