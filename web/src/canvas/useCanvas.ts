import { useCallback, useRef, useState } from 'react';
import type { Panel, PanelType } from './canvasTypes';

function keyFor(type: PanelType, args?: Record<string, unknown>): string {
  if (type === 'connect') return `connect:${String(args?.provider ?? 'unknown')}`;
  return type;
}

export interface UseCanvas {
  panels: Panel[];
  open(type: PanelType, args?: Record<string, unknown>): void;
  close(type: PanelType, provider?: string): void;
  closeAll(): void;
}

export function useCanvas(): UseCanvas {
  const [panels, setPanels] = useState<Panel[]>([]);
  // Monotonic counter → a fresh `nonce` on every open() so the PanelFrame boundary
  // resets when a singleton panel is reopened (see open() below and CanvasHost).
  const nonceRef = useRef(0);

  const open = useCallback((type: PanelType, args?: Record<string, unknown>) => {
    const key = keyFor(type, args);
    setPanels((prev) => {
      const without = prev.filter((p) => p.key !== key);
      // Reopening moves it to the end (newest-last / newest-on-top). A fresh
      // monotonic `nonce` each open lets the PanelFrame error boundary reset when
      // a singleton (weather/note/…) is reopened with new args — otherwise a
      // once-crashed panel would keep its stable key and stay stuck on the error
      // state even after reopening the same type with good data.
      const nonce = nonceRef.current++;
      return [...without, { key, type, args, nonce }];
    });
  }, []);

  const close = useCallback((type: PanelType, provider?: string) => {
    setPanels((prev) => {
      // close('connect') with NO provider means "close every connect card". Building
      // keyFor('connect', undefined) would give `connect:unknown`, which matches no
      // real `connect:<provider>` card, so nothing would close. Filter by prefix.
      if (type === 'connect' && !provider) {
        return prev.filter((p) => !p.key.startsWith('connect:'));
      }
      const key = keyFor(type, provider ? { provider } : undefined);
      return prev.filter((p) => p.key !== key);
    });
  }, []);

  const closeAll = useCallback(() => setPanels([]), []);

  return { panels, open, close, closeAll };
}
