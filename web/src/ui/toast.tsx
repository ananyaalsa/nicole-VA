import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './toast.css';

/* A tiny glassmorphic-teal toast system: a context + a portal. No deps.
   Used to surface what Nicole is doing ("Checking the weather…" → "Done"). */

export type ToastKind = 'progress' | 'success' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  text: string;
  /** Optional glyph (emoji or short) shown left of the text. */
  icon?: string;
}

interface ToastCtx {
  /** Show a toast; returns its id (so a 'progress' toast can be resolved later). */
  show: (t: Omit<Toast, 'id'>) => string;
  /** Replace a toast (e.g. progress → success) and auto-dismiss it. */
  resolve: (id: string, patch: Partial<Omit<Toast, 'id'>>) => void;
  dismiss: (id: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

const AUTO_MS = 4000;        // success/error auto-dismiss
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) { clearTimeout(tm); timers.current.delete(id); }
  }, []);

  const arm = useCallback((id: string, ms: number) => {
    const existing = timers.current.get(id);
    if (existing) clearTimeout(existing);
    timers.current.set(id, setTimeout(() => dismiss(id), ms));
  }, [dismiss]);

  const show = useCallback((t: Omit<Toast, 'id'>) => {
    const id = `t${++seq}`;
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]); // cap stack at 4
    // Progress toasts persist until resolved; success/error auto-dismiss.
    if (t.kind !== 'progress') arm(id, AUTO_MS);
    return id;
  }, [arm]);

  const resolve = useCallback((id: string, patch: Partial<Omit<Toast, 'id'>>) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    arm(id, AUTO_MS);
  }, [arm]);

  // Clear timers on unmount.
  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); }, []);

  return (
    <Ctx.Provider value={{ show, resolve, dismiss }}>
      {children}
      {createPortal(
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast--${t.kind}`}>
              <span className="toast__ic" aria-hidden="true">
                {t.icon ?? (t.kind === 'success' ? '✓' : t.kind === 'error' ? '!' : '')}
                {t.kind === 'progress' && !t.icon && <span className="toast__spinner" />}
              </span>
              <span className="toast__text">{t.text}</span>
              <button type="button" className="toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

/** Access the toast API. Safe no-op if used outside a provider. */
export function useToast(): ToastCtx {
  return useContext(Ctx) ?? { show: () => '', resolve: () => {}, dismiss: () => {} };
}
