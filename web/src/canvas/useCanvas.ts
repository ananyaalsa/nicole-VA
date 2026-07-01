import { useCallback, useState } from 'react';
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

  const open = useCallback((type: PanelType, args?: Record<string, unknown>) => {
    const key = keyFor(type, args);
    setPanels((prev) => {
      const without = prev.filter((p) => p.key !== key);
      // Reopening moves it to the end (newest-last / newest-on-top).
      return [...without, { key, type, args }];
    });
  }, []);

  const close = useCallback((type: PanelType, provider?: string) => {
    const key = keyFor(type, provider ? { provider } : undefined);
    setPanels((prev) => prev.filter((p) => p.key !== key));
  }, []);

  const closeAll = useCallback(() => setPanels([]), []);

  return { panels, open, close, closeAll };
}
