# Talk 3-Panel Workspace + Canvas + Inline Connect — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the desktop Talk screen into a 3-panel workspace (Nicole · Canvas · Chat) where Nicole opens rich, self-contained panels in the center — including a glassmorphism per-integration inline Connect card — driven by a new `open_panel` tool and existing events.

**Architecture:** A single `useCanvas` reducer owns an ordered list of center "panels"; every source (Nicole's `open_panel` tool, auto-events like weather/search/needs-connect, connect retries) funnels through its `open/close` methods. Panels are pure, typed, isolated components looked up in a `PANELS` registry and each wrapped in an error boundary. The desktop Talk layout becomes a 3-column CSS grid; mobile (≤640px) and medium (≤1024px) fall back to existing layouts unchanged. A new `open_panel`/`close_panel` UI-control tool rides the existing `extractToolCalls → UiCommandBus → useUiCommands` path.

**Tech Stack:** React 19 + TypeScript + Vite (web), Node + TypeScript + `node:http` + `ws` (server), Vitest + Testing Library, existing `@google/genai` Gemini Live relay.

## Global Constraints

- Desktop Talk only. Mobile Talk (≤640px), Training, and Roleplay layouts are UNCHANGED. All existing Talk/Training/Roleplay tests must stay green.
- Every user-facing error is SHORT and human-friendly: ≤ ~8 words where possible, active voice, no codes / HTTP status / provider or tool internal names, offer the next step ("Retry?", "Try again?") when there is one. Route them through a `friendlyError(kind)` helper.
- Connect card is ONE per integration (keyed by provider). It dismisses on ✕ OR after 10s of no interaction; hover/focus pauses and resets the 10s timer.
- `open_panel` / `close_panel` are pure UI actions (no server side effects), declared like `set_camera` and gated to Talk mode.
- Panel types (v1): `connect`, `weather`, `search_results`, `note`, `integrations`. No `calendar`, no `presentation`, no draggable/resizable panels, no Note persistence.
- Follow existing patterns: tool declarations in `server/src/gemini/uiControlTools.ts`; UI-command handlers in `web/src/engine/useUiCommands.ts`; integration status via `IntegrationStatus` from `web/src/integrations/integrationsApi.ts`.
- TDD: write the failing test first, watch it fail, implement minimally, watch it pass, commit. Run web tests with `cd web && npx vitest run <path>`; server with `cd server && npx vitest run <path>`; typecheck with `npx tsc --noEmit` (ignore false-positive `aria-pressed`/`aria-selected`/`aria-busy`/`aria-expanded` lint errors).

## File Structure

**New (web):**
- `web/src/canvas/canvasTypes.ts` — `PanelType`, `Panel`, `CanvasArgs` types (shared, no deps).
- `web/src/canvas/useCanvas.ts` — the reducer hook (`panels`, `open`, `close`, `closeAll`).
- `web/src/canvas/CanvasHost.tsx` + `.css` — renders the panel stack; idle = children (HomePanel).
- `web/src/canvas/PanelFrame.tsx` — shared panel chrome (title, ✕) + per-panel error boundary.
- `web/src/canvas/panels/ConnectPanel.tsx` + `.css` — the glassmorphism connect card.
- `web/src/canvas/panels/WeatherPanel.tsx` — re-homes the weather card.
- `web/src/canvas/panels/SearchResultsPanel.tsx` — wraps existing `LinkCards`.
- `web/src/canvas/panels/IntegrationsPanel.tsx` — provider grid (connect/disconnect).
- `web/src/canvas/panels/NotePanel.tsx` — scratch text card + copy.
- `web/src/canvas/panels/registry.ts` — `PANELS: Record<PanelType, PanelComponent>`.
- `web/src/integrations/useIntegrations.ts` — reactive `IntegrationStatus[]` hook.
- `web/src/ui/friendlyError.ts` — the short-error string helper.

**Modified (web):**
- `web/src/screens/TalkScreen.tsx` — mount canvas + 3-column layout; wire `open_panel`; feed `searchLinks`/weather/needsConnect into canvas.
- `web/src/screens/TalkScreen.css` — 3-column grid + breakpoints.
- `web/src/engine/useNicoleSession.ts` — surface `needsConnect` from tool-result echo (type + capture).

**Modified (server):**
- `server/src/gemini/uiControlTools.ts` — declare `open_panel` + `close_panel`; add to `UI_CONTROL_TOOL_NAMES`.
- `server/src/prompt/nicolePrompt.ts` — short section teaching Nicole when to open panels.
- `server/src/integrations/toolDispatch.ts` — return `needsConnect: <provider>` when a tool's provider is not connected.

---

### Task 1: Canvas types + `useCanvas` reducer

**Files:**
- Create: `web/src/canvas/canvasTypes.ts`
- Create: `web/src/canvas/useCanvas.ts`
- Test: `web/src/canvas/useCanvas.test.ts`

**Interfaces:**
- Produces: `type PanelType = 'connect'|'weather'|'search_results'|'note'|'integrations'`; `interface Panel { key: string; type: PanelType; args?: Record<string, unknown> }`; `useCanvas(): { panels: Panel[]; open(type: PanelType, args?: Record<string, unknown>): void; close(type: PanelType, provider?: string): void; closeAll(): void }`.
- Singleton rule: opening a `type` replaces the existing panel of that type EXCEPT `connect`, which is keyed by `connect:<provider>` (so each provider gets its own card). `key` = `type` for singletons, `connect:<provider>` for connect.

- [ ] **Step 1: Write the failing test**

```ts
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

  it('closeAll empties the canvas', () => {
    const { result } = renderHook(() => useCanvas());
    act(() => result.current.open('weather'));
    act(() => result.current.open('note', { text: 'hi' }));
    act(() => result.current.closeAll());
    expect(result.current.panels).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd web && npx vitest run src/canvas/useCanvas.test.ts`
Expected: FAIL — `Cannot find module './useCanvas'`.

- [ ] **Step 3: Implement the types**

```ts
// web/src/canvas/canvasTypes.ts
export type PanelType = 'connect' | 'weather' | 'search_results' | 'note' | 'integrations';

export interface Panel {
  /** Unique key: the type for singletons, `connect:<provider>` for connect cards. */
  key: string;
  type: PanelType;
  args?: Record<string, unknown>;
}
```

- [ ] **Step 4: Implement the hook**

```ts
// web/src/canvas/useCanvas.ts
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
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `cd web && npx vitest run src/canvas/useCanvas.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add web/src/canvas/canvasTypes.ts web/src/canvas/useCanvas.ts web/src/canvas/useCanvas.test.ts
git commit -m "feat(canvas): useCanvas reducer + panel types"
```

---

### Task 2: `friendlyError` helper + short-error pass

**Files:**
- Create: `web/src/ui/friendlyError.ts`
- Test: `web/src/ui/friendlyError.test.ts`

**Interfaces:**
- Produces: `type FriendlyErrorKind = 'connect'|'integrations_load'|'action'|'weather'|'search'|'generic'`; `friendlyError(kind: FriendlyErrorKind, provider?: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/ui/friendlyError.test.ts
import { describe, it, expect } from 'vitest';
import { friendlyError } from './friendlyError';

describe('friendlyError', () => {
  it('names the provider for a connect failure and offers a retry', () => {
    const msg = friendlyError('connect', 'Slack');
    expect(msg).toBe("Couldn't connect Slack — want to try again?");
  });
  it('gives a short integrations-load message', () => {
    expect(friendlyError('integrations_load')).toBe("Couldn't load your integrations. Retry?");
  });
  it('gives a short generic action message', () => {
    expect(friendlyError('action')).toBe("That didn't go through. Try once more?");
  });
  it('every message is short (<= 8 words) and has no error codes', () => {
    for (const kind of ['connect','integrations_load','action','weather','search','generic'] as const) {
      const m = friendlyError(kind, 'X');
      expect(m.split(/\s+/).length).toBeLessThanOrEqual(8);
      expect(m).not.toMatch(/error:|http|\b\d{3}\b|undefined/i);
    }
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd web && npx vitest run src/ui/friendlyError.test.ts`
Expected: FAIL — `Cannot find module './friendlyError'`.

- [ ] **Step 3: Implement**

```ts
// web/src/ui/friendlyError.ts
export type FriendlyErrorKind =
  | 'connect' | 'integrations_load' | 'action' | 'weather' | 'search' | 'generic';

/** Short, human-friendly, jargon-free error lines. No codes, no internals. */
export function friendlyError(kind: FriendlyErrorKind, provider?: string): string {
  const name = provider ?? 'that';
  switch (kind) {
    case 'connect':           return `Couldn't connect ${name} — want to try again?`;
    case 'integrations_load': return "Couldn't load your integrations. Retry?";
    case 'action':            return "That didn't go through. Try once more?";
    case 'weather':           return "Couldn't reach the weather right now.";
    case 'search':            return "Couldn't fetch results right now.";
    default:                  return 'Something went wrong. Try again?';
  }
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `cd web && npx vitest run src/ui/friendlyError.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/ui/friendlyError.ts web/src/ui/friendlyError.test.ts
git commit -m "feat(ui): friendlyError helper for short human errors"
```

---

### Task 3: `useIntegrations` reactive status hook

**Files:**
- Create: `web/src/integrations/useIntegrations.ts`
- Test: `web/src/integrations/useIntegrations.test.tsx`

**Interfaces:**
- Consumes: `fetchIntegrations(token: string): Promise<IntegrationStatus[]>` and `type IntegrationStatus` from `web/src/integrations/integrationsApi.ts`.
- Produces: `useIntegrations(token: string | null): { statuses: IntegrationStatus[]; loading: boolean; error: boolean; refresh(): void }`. Refreshes on mount and whenever a `nicole:integrations-updated` window event fires.

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/integrations/useIntegrations.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const fetchIntegrations = vi.fn();
vi.mock('./integrationsApi', () => ({ fetchIntegrations: (t: string) => fetchIntegrations(t) }));

import { useIntegrations } from './useIntegrations';

beforeEach(() => { fetchIntegrations.mockReset(); });

describe('useIntegrations', () => {
  it('loads statuses on mount', async () => {
    fetchIntegrations.mockResolvedValue([{ id: 'slack', name: 'Slack', description: '', configured: true, connected: false, scopes: [], connectedAt: null }]);
    const { result } = renderHook(() => useIntegrations('tok'));
    await waitFor(() => expect(result.current.statuses).toHaveLength(1));
    expect(result.current.statuses[0].id).toBe('slack');
  });

  it('refetches on the nicole:integrations-updated event', async () => {
    fetchIntegrations.mockResolvedValue([]);
    renderHook(() => useIntegrations('tok'));
    await waitFor(() => expect(fetchIntegrations).toHaveBeenCalledTimes(1));
    act(() => window.dispatchEvent(new Event('nicole:integrations-updated')));
    await waitFor(() => expect(fetchIntegrations).toHaveBeenCalledTimes(2));
  });

  it('sets error=true when the fetch fails', async () => {
    fetchIntegrations.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useIntegrations('tok'));
    await waitFor(() => expect(result.current.error).toBe(true));
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd web && npx vitest run src/integrations/useIntegrations.test.tsx`
Expected: FAIL — `Cannot find module './useIntegrations'`.

- [ ] **Step 3: Implement**

```ts
// web/src/integrations/useIntegrations.ts
import { useCallback, useEffect, useState } from 'react';
import { fetchIntegrations, type IntegrationStatus } from './integrationsApi';

export interface UseIntegrations {
  statuses: IntegrationStatus[];
  loading: boolean;
  error: boolean;
  refresh(): void;
}

export function useIntegrations(token: string | null): UseIntegrations {
  const [statuses, setStatuses] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const refresh = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(false);
    fetchIntegrations(token)
      .then((s) => { setStatuses(s); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const on = () => refresh();
    window.addEventListener('nicole:integrations-updated', on);
    return () => window.removeEventListener('nicole:integrations-updated', on);
  }, [refresh]);

  return { statuses, loading, error, refresh };
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `cd web && npx vitest run src/integrations/useIntegrations.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/integrations/useIntegrations.ts web/src/integrations/useIntegrations.test.tsx
git commit -m "feat(integrations): reactive useIntegrations status hook"
```

---

### Task 4: `ConnectPanel` — glassmorphism connect card with 10s / hover dismissal

**Files:**
- Create: `web/src/canvas/panels/ConnectPanel.tsx`
- Create: `web/src/canvas/panels/ConnectPanel.css`
- Test: `web/src/canvas/panels/ConnectPanel.test.tsx`

**Interfaces:**
- Consumes: `connectIntegration(token: string, provider: string): Promise<ConnectResult>` from `integrationsApi`; `friendlyError` from `web/src/ui/friendlyError.ts`.
- Produces: `ConnectPanel(props: { provider: string; reason?: string; token: string | null; onClose(): void }): JSX.Element`. On successful connect it dispatches `window.dispatchEvent(new Event('nicole:integrations-updated'))` then calls `onClose()` after a brief "Connected ✓" flash. Auto-closes after 10000ms of no pointer/focus interaction; entering hover/focus clears the timer, leaving resets it.

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/canvas/panels/ConnectPanel.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const connectIntegration = vi.fn();
vi.mock('../../integrations/integrationsApi', () => ({ connectIntegration: (t: string, p: string) => connectIntegration(t, p) }));

import { ConnectPanel } from './ConnectPanel';

beforeEach(() => { vi.useFakeTimers(); connectIntegration.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe('ConnectPanel', () => {
  it('shows the provider name and reason', () => {
    render(<ConnectPanel provider="slack" reason="post to your team" token="t" onClose={() => {}} />);
    expect(screen.getByTestId('connect-panel')).toBeInTheDocument();
    expect(screen.getByText(/connect slack/i)).toBeInTheDocument();
    expect(screen.getByText(/post to your team/i)).toBeInTheDocument();
  });

  it('Connect calls connectIntegration and, on success, signals + closes', async () => {
    connectIntegration.mockResolvedValue({ ok: true, provider: 'slack' });
    const onClose = vi.fn();
    const evt = vi.fn();
    window.addEventListener('nicole:integrations-updated', evt);
    render(<ConnectPanel provider="slack" token="t" onClose={onClose} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /connect slack/i })); });
    expect(connectIntegration).toHaveBeenCalledWith('t', 'slack');
    expect(evt).toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(onClose).toHaveBeenCalled();
    window.removeEventListener('nicole:integrations-updated', evt);
  });

  it('the ✕ closes immediately', () => {
    const onClose = vi.fn();
    render(<ConnectPanel provider="slack" token="t" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/dismiss/i));
    expect(onClose).toHaveBeenCalled();
  });

  it('auto-dismisses after 10s of no interaction', () => {
    const onClose = vi.fn();
    render(<ConnectPanel provider="slack" token="t" onClose={onClose} />);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(onClose).toHaveBeenCalled();
  });

  it('hover pauses the 10s timer (does not close while hovered)', () => {
    const onClose = vi.fn();
    render(<ConnectPanel provider="slack" token="t" onClose={onClose} />);
    const card = screen.getByTestId('connect-panel');
    act(() => { vi.advanceTimersByTime(6000); });
    fireEvent.mouseEnter(card);
    act(() => { vi.advanceTimersByTime(30000); });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseLeave(card);            // resets to a fresh 10s
    act(() => { vi.advanceTimersByTime(9000); });
    expect(onClose).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd web && npx vitest run src/canvas/panels/ConnectPanel.test.tsx`
Expected: FAIL — `Cannot find module './ConnectPanel'`.

- [ ] **Step 3: Implement the component**

```tsx
// web/src/canvas/panels/ConnectPanel.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { connectIntegration } from '../../integrations/integrationsApi';
import { friendlyError } from '../../ui/friendlyError';
import './ConnectPanel.css';

const AUTO_DISMISS_MS = 10000;

/** Nicely-cased provider label, e.g. "slack" → "Slack". */
function label(p: string): string { return p.charAt(0).toUpperCase() + p.slice(1); }

export interface ConnectPanelProps {
  provider: string;
  reason?: string;
  token: string | null;
  onClose(): void;
}

export function ConnectPanel({ provider, reason, token, onClose }: ConnectPanelProps): JSX.Element {
  const [state, setState] = useState<'idle' | 'connecting' | 'done' | 'error'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);
  const armTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => onClose(), AUTO_DISMISS_MS);
  }, [clearTimer, onClose]);

  // Arm on mount; pause on hover/focus; clean up on unmount.
  useEffect(() => { armTimer(); return clearTimer; }, [armTimer, clearTimer]);

  const onConnect = useCallback(async () => {
    if (!token) return;
    clearTimer();
    setState('connecting');
    const r = await connectIntegration(token, provider);
    if (r.ok) {
      window.dispatchEvent(new Event('nicole:integrations-updated'));
      setState('done');
      timerRef.current = setTimeout(() => onClose(), 1200); // brief "Connected ✓" flash
    } else {
      setState('error');
      armTimer(); // resume auto-dismiss
    }
  }, [token, provider, clearTimer, armTimer, onClose]);

  const l = label(provider);
  return (
    <div
      className={`connect-panel connect-panel--${provider}`}
      data-testid="connect-panel"
      onMouseEnter={clearTimer}
      onMouseLeave={armTimer}
      onFocus={clearTimer}
      onBlur={armTimer}
    >
      <button type="button" className="connect-panel__x" onClick={onClose} aria-label={`Dismiss connect ${l}`}>✕</button>
      <div className="connect-panel__row">
        <span className={`connect-panel__logo logo--${provider}`} aria-hidden="true">{l.charAt(0)}</span>
        <div className="connect-panel__txt">
          <strong>Connect {l}</strong>
          <p>{reason ? reason : `So I can use ${l} for you.`}</p>
        </div>
      </div>
      {state === 'error' && <p className="connect-panel__err">{friendlyError('connect', l)}</p>}
      <div className="connect-panel__actions">
        <button type="button" className="connect-panel__btn primary" disabled={state === 'connecting' || state === 'done'} onClick={() => void onConnect()}>
          {state === 'connecting' ? 'Connecting…' : state === 'done' ? 'Connected ✓' : `Connect ${l}`}
        </button>
        <button type="button" className="connect-panel__btn ghost" onClick={onClose}>Not now</button>
      </div>
      <span className="connect-panel__timer" aria-hidden="true" />
    </div>
  );
}

export default ConnectPanel;
```

- [ ] **Step 4: Add the glassmorphism CSS**

```css
/* web/src/canvas/panels/ConnectPanel.css */
.connect-panel {
  position: relative; border-radius: var(--radius-lg, 18px); padding: 16px 18px;
  background: rgba(255,255,255,.55);
  -webkit-backdrop-filter: blur(14px) saturate(140%); backdrop-filter: blur(14px) saturate(140%);
  border: 1px solid rgba(255,255,255,.6);
  box-shadow: 0 10px 34px rgba(11,61,56,.14), inset 0 1px 0 rgba(255,255,255,.5);
  overflow: hidden;
}
.connect-panel::before { content:''; position:absolute; inset:0; pointer-events:none;
  background: radial-gradient(400px 120px at 0% 0%, rgba(var(--accent-rgb,15,118,110),.18), transparent 70%); }
.connect-panel__x { position:absolute; top:10px; right:12px; border:0; background:transparent; color:var(--text-3); font-size:1rem; line-height:1; cursor:pointer; }
.connect-panel__row { display:flex; align-items:center; gap:13px; }
.connect-panel__logo { width:44px; height:44px; border-radius:12px; display:grid; place-items:center; flex-shrink:0; color:#fff; font-weight:800; font-size:1.1rem; background:var(--accent); box-shadow:0 4px 14px rgba(0,0,0,.12); }
.logo--slack { background:#4A154B; } .logo--gmail, .logo--google { background:#EA4335; } .logo--notion { background:#111; } .logo--todoist { background:#e44332; }
.connect-panel__txt strong { font-size:.98rem; } .connect-panel__txt p { margin:2px 0 0; color:var(--text-2); font-size:.84rem; }
.connect-panel__err { margin:8px 0 0; font-size:.82rem; color:var(--danger,#b91c1c); }
.connect-panel__actions { display:flex; gap:10px; margin-top:13px; }
.connect-panel__btn { border:0; border-radius:999px; padding:9px 18px; font:inherit; font-weight:700; cursor:pointer; }
.connect-panel__btn.primary { background:var(--accent); color:#fff; }
.connect-panel__btn.primary:disabled { opacity:.7; cursor:default; }
.connect-panel__btn.ghost { background:transparent; color:var(--text-2); border:1px solid var(--border); }
.connect-panel__timer { position:absolute; left:0; bottom:0; height:3px; width:100%; transform-origin:left;
  background:linear-gradient(90deg,var(--accent),#5ec8bb); animation:connect-timer 10s linear forwards; }
.connect-panel:hover .connect-panel__timer, .connect-panel:focus-within .connect-panel__timer { animation-play-state:paused; }
@keyframes connect-timer { from{transform:scaleX(1)} to{transform:scaleX(0)} }
@media (prefers-reduced-motion: reduce) { .connect-panel__timer { animation:none; display:none; } }
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `cd web && npx vitest run src/canvas/panels/ConnectPanel.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add web/src/canvas/panels/ConnectPanel.tsx web/src/canvas/panels/ConnectPanel.css web/src/canvas/panels/ConnectPanel.test.tsx
git commit -m "feat(canvas): glassmorphism ConnectPanel with 10s/hover dismissal"
```

---

### Task 5: Remaining v1 panels (Weather, SearchResults, Note, Integrations) + registry

**Files:**
- Create: `web/src/canvas/panels/WeatherPanel.tsx`
- Create: `web/src/canvas/panels/SearchResultsPanel.tsx`
- Create: `web/src/canvas/panels/NotePanel.tsx`
- Create: `web/src/canvas/panels/IntegrationsPanel.tsx`
- Create: `web/src/canvas/panels/registry.ts`
- Test: `web/src/canvas/panels/registry.test.tsx`

**Interfaces:**
- Consumes: `LinkCards` from `web/src/components/LinkCards.tsx` (props `{ links: SearchLink[]; onClose?(): void }`); `useIntegrations` (Task 3); `disconnectIntegration`, `connectIntegration` from `integrationsApi`; `friendlyError` (Task 2); the shared `Panel`/`PanelType` (Task 1).
- Produces: `interface PanelComponentProps { panel: Panel; token: string | null; onClose(): void }`; `PANELS: Record<PanelType, (props: PanelComponentProps) => JSX.Element>`. Each panel reads its data from `panel.args`.

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/canvas/panels/registry.test.tsx
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../integrations/useIntegrations', () => ({ useIntegrations: () => ({ statuses: [
  { id: 'slack', name: 'Slack', description: '', configured: true, connected: false, scopes: [], connectedAt: null },
  { id: 'gmail', name: 'Gmail', description: '', configured: true, connected: true, scopes: [], connectedAt: '2026-01-01' },
], loading: false, error: false, refresh: () => {} }) }));
vi.mock('../../components/LinkCards', () => ({ LinkCards: () => <div data-testid="link-cards" /> }));
import { render, screen } from '@testing-library/react';
import { PANELS } from './registry';

const P = (type: keyof typeof PANELS, args: Record<string, unknown>) =>
  render(PANELS[type]({ panel: { key: type, type, args }, token: 't', onClose: () => {} }));

describe('PANELS registry', () => {
  it('has all five v1 panel types', () => {
    expect(Object.keys(PANELS).sort()).toEqual(['connect','integrations','note','search_results','weather']);
  });
  it('note panel shows its text', () => {
    P('note', { text: 'remember this' });
    expect(screen.getByText('remember this')).toBeInTheDocument();
  });
  it('weather panel shows temperature + place', () => {
    P('weather', { place: 'Pune', tempC: 24, condition: 'Partly cloudy', icon: '⛅', feelsC: 26, forecast: [] });
    expect(screen.getByText(/pune/i)).toBeInTheDocument();
    expect(screen.getByText(/24/)).toBeInTheDocument();
  });
  it('search_results panel renders LinkCards', () => {
    P('search_results', { links: [{ url: 'https://x.com', title: 'X' }] });
    expect(screen.getByTestId('link-cards')).toBeInTheDocument();
  });
  it('integrations panel lists providers with connected state', () => {
    P('integrations', {});
    expect(screen.getByText('Slack')).toBeInTheDocument();
    expect(screen.getByText('Gmail')).toBeInTheDocument();
    expect(screen.getByText(/connected/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd web && npx vitest run src/canvas/panels/registry.test.tsx`
Expected: FAIL — `Cannot find module './registry'`.

- [ ] **Step 3: Implement WeatherPanel**

```tsx
// web/src/canvas/panels/WeatherPanel.tsx
import type { JSX } from 'react';
import type { PanelComponentProps } from './registry';

export function WeatherPanel({ panel }: PanelComponentProps): JSX.Element {
  const a = panel.args ?? {};
  const forecast = Array.isArray(a.forecast) ? (a.forecast as Array<{ date: string; hiC: number; loC: number; icon: string }>) : [];
  return (
    <div className="canvas-weather" data-testid="weather-panel">
      <div className="canvas-weather__now">
        <span className="canvas-weather__ic" aria-hidden="true">{String(a.icon ?? '🌡️')}</span>
        <span className="canvas-weather__temp">{String(a.tempC ?? '--')}°</span>
        <span>{String(a.condition ?? '')}<br /><small>Feels {String(a.feelsC ?? a.tempC ?? '--')}°</small></span>
      </div>
      <div className="canvas-weather__place">{String(a.place ?? 'Your area')}</div>
      {forecast.length > 0 && (
        <div className="canvas-weather__days">
          {forecast.map((d) => (
            <div key={d.date} className="canvas-weather__day">
              <span aria-hidden="true">{d.icon}</span>
              <span>{d.hiC}°/{d.loC}°</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement SearchResultsPanel**

```tsx
// web/src/canvas/panels/SearchResultsPanel.tsx
import type { JSX } from 'react';
import { LinkCards } from '../../components/LinkCards';
import type { SearchLink } from '../../engine/useNicoleSession';
import type { PanelComponentProps } from './registry';

export function SearchResultsPanel({ panel, onClose }: PanelComponentProps): JSX.Element {
  const links = (panel.args?.links as SearchLink[] | undefined) ?? [];
  return <LinkCards links={links} onClose={onClose} />;
}
```

- [ ] **Step 5: Implement NotePanel**

```tsx
// web/src/canvas/panels/NotePanel.tsx
import { useState } from 'react';
import type { JSX } from 'react';
import type { PanelComponentProps } from './registry';

export function NotePanel({ panel }: PanelComponentProps): JSX.Element {
  const text = String(panel.args?.text ?? '');
  const [copied, setCopied] = useState(false);
  const copy = () => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };
  return (
    <div className="canvas-note" data-testid="note-panel">
      <button type="button" className="canvas-note__copy" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
      <pre className="canvas-note__body">{text}</pre>
    </div>
  );
}
```

- [ ] **Step 6: Implement IntegrationsPanel**

```tsx
// web/src/canvas/panels/IntegrationsPanel.tsx
import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import { useIntegrations } from '../../integrations/useIntegrations';
import { connectIntegration, disconnectIntegration } from '../../integrations/integrationsApi';
import { friendlyError } from '../../ui/friendlyError';
import type { PanelComponentProps } from './registry';

export function IntegrationsPanel({ token }: PanelComponentProps): JSX.Element {
  const { statuses, error, refresh } = useIntegrations(token);
  const [busy, setBusy] = useState<string | null>(null);

  const connect = useCallback(async (id: string) => {
    if (!token) return;
    setBusy(id);
    const r = await connectIntegration(token, id);
    setBusy(null);
    if (r.ok) { window.dispatchEvent(new Event('nicole:integrations-updated')); refresh(); }
  }, [token, refresh]);

  const disconnect = useCallback(async (id: string) => {
    if (!token) return;
    setBusy(id);
    try { await disconnectIntegration(token, id); window.dispatchEvent(new Event('nicole:integrations-updated')); refresh(); }
    catch { /* handled by the error state below */ }
    setBusy(null);
  }, [token, refresh]);

  if (error) return <div className="canvas-integrations" data-testid="integrations-panel"><p className="canvas-integrations__err">{friendlyError('integrations_load')}</p></div>;

  return (
    <div className="canvas-integrations" data-testid="integrations-panel">
      <div className="canvas-integrations__grid">
        {statuses.filter((s) => s.configured).map((s) => (
          <div key={s.id} className="canvas-integrations__item">
            <span className={`canvas-integrations__logo logo--${s.id}`} aria-hidden="true">{s.name.charAt(0)}</span>
            <span className="canvas-integrations__name">{s.name}</span>
            {s.connected
              ? <button type="button" className="canvas-integrations__st ok" disabled={busy === s.id} onClick={() => void disconnect(s.id)}>Connected</button>
              : <button type="button" className="canvas-integrations__st no" disabled={busy === s.id} onClick={() => void connect(s.id)}>Connect →</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Implement the registry**

```tsx
// web/src/canvas/panels/registry.ts
import type { JSX } from 'react';
import type { Panel, PanelType } from '../canvasTypes';
import { ConnectPanel } from './ConnectPanel';
import { WeatherPanel } from './WeatherPanel';
import { SearchResultsPanel } from './SearchResultsPanel';
import { NotePanel } from './NotePanel';
import { IntegrationsPanel } from './IntegrationsPanel';

export interface PanelComponentProps {
  panel: Panel;
  token: string | null;
  onClose(): void;
}

export const PANELS: Record<PanelType, (props: PanelComponentProps) => JSX.Element> = {
  connect: ({ panel, token, onClose }) =>
    ConnectPanel({ provider: String(panel.args?.provider ?? ''), reason: panel.args?.reason as string | undefined, token, onClose }),
  weather: (props) => WeatherPanel(props),
  search_results: (props) => SearchResultsPanel(props),
  note: (props) => NotePanel(props),
  integrations: (props) => IntegrationsPanel(props),
};
```

- [ ] **Step 8: Add minimal panel CSS**

Create `web/src/canvas/panels/panels.css` with `.canvas-weather*`, `.canvas-note*`, `.canvas-integrations*` styles (mirror the mockup: weather now-line + day chips; note as a `pre` with a copy button; integrations 2-col grid with logo + name + status button). Import it from `registry.ts` via `import './panels.css'`.

- [ ] **Step 9: Run tests, confirm pass**

Run: `cd web && npx vitest run src/canvas/panels/registry.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 10: Commit**

```bash
git add web/src/canvas/panels/
git commit -m "feat(canvas): weather, search, note, integrations panels + registry"
```

---

### Task 6: `PanelFrame` (error boundary + chrome) and `CanvasHost`

**Files:**
- Create: `web/src/canvas/PanelFrame.tsx`
- Create: `web/src/canvas/CanvasHost.tsx`
- Create: `web/src/canvas/CanvasHost.css`
- Test: `web/src/canvas/CanvasHost.test.tsx`

**Interfaces:**
- Consumes: `PANELS`, `PanelComponentProps` (Task 5); `Panel` (Task 1).
- Produces: `PanelFrame(props: { children: React.ReactNode }): JSX.Element` (a class error boundary rendering "This didn't load." on error). `CanvasHost(props: { panels: Panel[]; token: string | null; onClose(type: PanelType, provider?: string): void; children?: React.ReactNode }): JSX.Element` — renders `children` (idle) when `panels` is empty; otherwise renders each panel wrapped in `PanelFrame`, newest last.

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/canvas/CanvasHost.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('./panels/registry', () => ({
  PANELS: {
    weather: () => <div data-testid="p-weather">W</div>,
    note: () => { throw new Error('boom'); },
    connect: () => <div>C</div>, search_results: () => <div>S</div>, integrations: () => <div>I</div>,
  },
}));
import { CanvasHost } from './CanvasHost';

describe('CanvasHost', () => {
  it('renders idle children when there are no panels', () => {
    render(<CanvasHost panels={[]} token="t" onClose={() => {}}><div data-testid="idle">home</div></CanvasHost>);
    expect(screen.getByTestId('idle')).toBeInTheDocument();
  });
  it('renders open panels (newest last) instead of idle', () => {
    render(<CanvasHost panels={[{ key: 'weather', type: 'weather' }]} token="t" onClose={() => {}}><div data-testid="idle" /></CanvasHost>);
    expect(screen.queryByTestId('idle')).toBeNull();
    expect(screen.getByTestId('p-weather')).toBeInTheDocument();
  });
  it('a crashing panel is contained by the error boundary', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CanvasHost panels={[{ key: 'note', type: 'note' }]} token="t" onClose={() => {}} />);
    expect(screen.getByText(/didn't load/i)).toBeInTheDocument();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd web && npx vitest run src/canvas/CanvasHost.test.tsx`
Expected: FAIL — `Cannot find module './CanvasHost'`.

- [ ] **Step 3: Implement PanelFrame (error boundary)**

```tsx
// web/src/canvas/PanelFrame.tsx
import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { crashed: boolean; }

/** Wraps one panel so a render error can't take down the canvas or session. */
export class PanelFrame extends Component<Props, State> {
  state: State = { crashed: false };
  static getDerivedStateFromError(): State { return { crashed: true }; }
  componentDidCatch(): void { /* contained; nothing to report to the user */ }
  render(): ReactNode {
    if (this.state.crashed) return <div className="canvas-panel-error">This didn't load.</div>;
    return this.props.children;
  }
}

export default PanelFrame;
```

- [ ] **Step 4: Implement CanvasHost**

```tsx
// web/src/canvas/CanvasHost.tsx
import type { JSX, ReactNode } from 'react';
import type { Panel, PanelType } from './canvasTypes';
import { PANELS } from './panels/registry';
import { PanelFrame } from './PanelFrame';
import './CanvasHost.css';

export interface CanvasHostProps {
  panels: Panel[];
  token: string | null;
  onClose(type: PanelType, provider?: string): void;
  children?: ReactNode;
}

export function CanvasHost({ panels, token, onClose, children }: CanvasHostProps): JSX.Element {
  if (panels.length === 0) {
    return <div className="canvas-host canvas-host--idle" data-testid="canvas-host">{children}</div>;
  }
  return (
    <div className="canvas-host" data-testid="canvas-host">
      <div className="canvas-host__head">Canvas · what Nicole opened</div>
      {panels.map((p) => {
        const Render = PANELS[p.type];
        const provider = p.type === 'connect' ? String(p.args?.provider ?? '') : undefined;
        return (
          <div className="canvas-host__panel" key={p.key}>
            <PanelFrame>{Render({ panel: p, token, onClose: () => onClose(p.type, provider) })}</PanelFrame>
          </div>
        );
      })}
    </div>
  );
}

export default CanvasHost;
```

- [ ] **Step 5: Add CanvasHost CSS**

```css
/* web/src/canvas/CanvasHost.css */
.canvas-host { height:100%; overflow:auto; padding:22px; }
.canvas-host--idle { display:flex; align-items:center; justify-content:center; padding:0; }
.canvas-host__head { font-size:.68rem; letter-spacing:.1em; text-transform:uppercase; color:var(--accent); font-weight:700; margin-bottom:12px; }
.canvas-host__panel { margin-bottom:16px; }
.canvas-panel-error { padding:14px 16px; border:1px dashed var(--border); border-radius:12px; color:var(--text-3); font-size:.85rem; }
```

- [ ] **Step 6: Run tests, confirm pass**

Run: `cd web && npx vitest run src/canvas/CanvasHost.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add web/src/canvas/PanelFrame.tsx web/src/canvas/CanvasHost.tsx web/src/canvas/CanvasHost.css web/src/canvas/CanvasHost.test.tsx
git commit -m "feat(canvas): CanvasHost + PanelFrame error boundary"
```

---

### Task 7: `open_panel` / `close_panel` server tool declarations

**Files:**
- Modify: `server/src/gemini/uiControlTools.ts`
- Modify: `server/src/prompt/nicolePrompt.ts`
- Test: `server/src/gemini/uiControlTools.test.ts`

**Interfaces:**
- Produces: two new entries in `UI_CONTROL_TOOL_DECLS` (`open_panel`, `close_panel`) and their names added to `UI_CONTROL_TOOL_NAMES`.

- [ ] **Step 1: Write the failing test (extend the existing file)**

```ts
// add to server/src/gemini/uiControlTools.test.ts
import { UI_CONTROL_TOOL_DECLS, UI_CONTROL_TOOL_NAMES } from './uiControlTools.js';

it('declares open_panel and close_panel and registers their names', () => {
  const names = UI_CONTROL_TOOL_DECLS.map((d) => d.name);
  expect(names).toContain('open_panel');
  expect(names).toContain('close_panel');
  expect(UI_CONTROL_TOOL_NAMES.has('open_panel')).toBe(true);
  expect(UI_CONTROL_TOOL_NAMES.has('close_panel')).toBe(true);
  const open = UI_CONTROL_TOOL_DECLS.find((d) => d.name === 'open_panel')!;
  expect(open.parameters.properties.type.enum).toEqual(['connect','weather','search_results','note','integrations']);
  expect(open.parameters.required).toContain('type');
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd server && npx vitest run src/gemini/uiControlTools.test.ts`
Expected: FAIL — `open_panel` not found.

- [ ] **Step 3: Add the tool names**

In `server/src/gemini/uiControlTools.ts`, add to the `UI_CONTROL_TOOL_NAMES` set (after `'set_display_name',`):

```ts
  'open_panel',
  'close_panel',
```

- [ ] **Step 4: Add the declarations**

Append to `UI_CONTROL_TOOL_DECLS` (before the closing `];`):

```ts
  {
    name: 'open_panel',
    description:
      "Open a rich panel on the user's CANVAS (the center of the screen) so they " +
      'can see and act on something. Use for: a connect card when you need an ' +
      'integration that is not connected (type "connect", provider e.g. "slack"); ' +
      'a note the user might want to keep (type "note", text = the content); the ' +
      'weather; search results; or the integrations manager. Say ONE short line ' +
      'that it is on their screen — do not read the panel contents aloud.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['connect', 'weather', 'search_results', 'note', 'integrations'], description: 'Which panel to open.' },
        provider: { type: 'string', description: 'For type "connect": the integration id, e.g. "slack", "google", "notion", "todoist".' },
        reason: { type: 'string', description: 'For "connect": one short line on why (e.g. "post to your team").' },
        text: { type: 'string', description: 'For "note": the note content to show.' },
      },
      required: ['type'],
    },
  },
  {
    name: 'close_panel',
    description: 'Close a panel on the canvas. Omit type to close them all.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['connect', 'weather', 'search_results', 'note', 'integrations'], description: 'Which panel to close; omit to close all.' },
        provider: { type: 'string', description: 'For "connect": which provider card to close.' },
      },
      required: [],
    },
  },
```

- [ ] **Step 5: Add prompt guidance**

In `server/src/prompt/nicolePrompt.ts`, in the UI-control section (after the `set_voice` bullet block), add a bullet:

```
- Open something on their CANVAS → open_panel({ type, … }). Use it to: show a connect card when you need an integration that is not connected (type "connect", provider); hand them a note worth keeping (type "note", text); or open the weather / search results / integrations manager. Say one short line that it is on their screen; never read the panel out loud. Close with close_panel.
```

- [ ] **Step 6: Run tests, confirm pass**

Run: `cd server && npx vitest run src/gemini/uiControlTools.test.ts && npx vitest run src/prompt/nicolePrompt.test.ts`
Expected: PASS (existing + the new test).

- [ ] **Step 7: Commit**

```bash
git add server/src/gemini/uiControlTools.ts server/src/prompt/nicolePrompt.ts server/src/gemini/uiControlTools.test.ts
git commit -m "feat(server): open_panel/close_panel UI-control tools + prompt"
```

---

### Task 8: Server returns `needsConnect` for unconnected-provider tool calls

**Files:**
- Modify: `server/src/integrations/toolDispatch.ts`
- Test: `server/src/integrations/toolDispatch.test.ts` (or the nearest existing integrations test)

**Interfaces:**
- Produces: when a provider's tool is dispatched and that provider is NOT connected for the user, the dispatch returns `{ ok: false, summary: <friendly>, needsConnect: '<provider>' }` instead of attempting the call. The existing tool-result echo (already carrying `{ name, ok, summary }`) gains an optional `needsConnect?: string`.

- [ ] **Step 1: Read the current dispatch to find the connection-check point**

Run: `cd server && sed -n '1,80p' src/integrations/toolDispatch.ts` and locate where a provider connection is resolved before running a tool (the point that currently errors or no-ops when unconnected). The new field is added at that branch.

- [ ] **Step 2: Write the failing test**

```ts
// server/src/integrations/toolDispatch.test.ts (new or appended)
// Mock the connection lookup to report Slack as NOT connected, dispatch a
// slack tool, and assert the result carries needsConnect:'slack' and ok:false.
// (Match the mocking style already used in server/src/integrations/*.test.ts —
//  e.g. vi.mock the db/status module the dispatcher imports.)
import { describe, it, expect, vi } from 'vitest';
// ...mock the module that tells the dispatcher whether a provider is connected...
import { dispatchIntegrationTool } from './toolDispatch.js';

describe('dispatchIntegrationTool needsConnect', () => {
  it('returns needsConnect when the provider is not connected', async () => {
    const res = await dispatchIntegrationTool('post_slack', { text: 'hi' }, 'user-1');
    expect(res.ok).toBe(false);
    expect(res.needsConnect).toBe('slack');
    expect(res.summary).toMatch(/connect/i);
  });
});
```

> Note for the implementer: adapt the exported function name (`dispatchIntegrationTool` here is illustrative) and the connection-lookup mock to the ACTUAL exports in `toolDispatch.ts` discovered in Step 1. Keep the assertion (ok:false + needsConnect:'slack' + a friendly summary) exactly.

- [ ] **Step 3: Run it, confirm it fails**

Run: `cd server && npx vitest run src/integrations/toolDispatch.test.ts`
Expected: FAIL — `needsConnect` is `undefined`.

- [ ] **Step 4: Implement**

At the branch where the dispatcher finds a provider tool but no active connection, return (instead of erroring):

```ts
return {
  ok: false,
  summary: `Connect ${providerLabel} first and I'll do it.`,
  needsConnect: providerId,
};
```

Add `needsConnect?: string;` to the dispatch result type. Ensure the relay's tool-result echo forwards `needsConnect` in the `{ type: 'tool-result', name, ok, summary, needsConnect }` message (check `server/src/gemini/relay.ts` where it sends `tool-result`).

- [ ] **Step 5: Run tests, confirm pass**

Run: `cd server && npx vitest run src/integrations/toolDispatch.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/integrations/toolDispatch.ts server/src/integrations/toolDispatch.test.ts server/src/gemini/relay.ts
git commit -m "feat(server): tool dispatch returns needsConnect for unconnected providers"
```

---

### Task 9: Surface `needsConnect` from the session hook

**Files:**
- Modify: `web/src/engine/useNicoleSession.ts`
- Test: `web/src/engine/useNicoleSession.test.ts`

**Interfaces:**
- Consumes: the relay `tool-result` message now carrying `needsConnect?: string` (Task 8).
- Produces: `useNicoleSession(...)` calls `opts.onToolResult?.({ name, ok, summary, needsConnect })` — the existing `onToolResult` callback type gains an optional `needsConnect?: string`.

- [ ] **Step 1: Write the failing test**

```ts
// add to web/src/engine/useNicoleSession.test.ts
it('forwards needsConnect from a tool-result to onToolResult', async () => {
  const onToolResult = vi.fn();
  const view = await startSession({ voiceName: 'Aoede', serverWs: 'ws://test/ai-live', onToolResult });
  FakeWebSocket.last().emit({ type: 'tool-result', name: 'post_slack', ok: false, summary: 'Connect Slack first.', needsConnect: 'slack' });
  expect(onToolResult).toHaveBeenCalledWith(expect.objectContaining({ name: 'post_slack', ok: false, needsConnect: 'slack' }));
});
```

> Note: `startSession` in that test file may need to pass `onToolResult` through to `useNicoleSession`. If the helper doesn't accept options, call `renderHook(() => useNicoleSession({...opts}))` directly as the other tests do.

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd web && npx vitest run src/engine/useNicoleSession.test.ts`
Expected: FAIL — `needsConnect` missing from the forwarded object.

- [ ] **Step 3: Implement**

In `web/src/engine/useNicoleSession.ts`: extend the `RelayMessage` interface with `needsConnect?: string;`, extend the `onToolResult` option type with `needsConnect?: string;`, and in the `case 'tool-result':` handler pass it through:

```ts
onToolResultRef.current?.({ name: msg.name, ok: !!msg.ok, summary: msg.summary ?? '', needsConnect: msg.needsConnect });
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `cd web && npx vitest run src/engine/useNicoleSession.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/engine/useNicoleSession.ts web/src/engine/useNicoleSession.test.ts
git commit -m "feat(session): forward needsConnect from tool results"
```

---

### Task 10: Wire the 3-panel layout + canvas into TalkScreen (desktop)

**Files:**
- Modify: `web/src/screens/TalkScreen.tsx`
- Modify: `web/src/screens/TalkScreen.css`
- Test: `web/src/screens/TalkScreen.test.tsx`

**Interfaces:**
- Consumes: `useCanvas` (Task 1), `CanvasHost` (Task 6), `useIsMobile` (existing), the session's `searchLinks`/`onToolResult`, `open_panel` via `useUiCommands`.
- Behavior:
  - Desktop (`!isMobile`): render a 3-column `.talk-body--workspace` grid: `.talk-presence` (left, existing) | `CanvasHost` (center, idle = existing `HomePanel`) | `.talk-chat` (right, the `ChatTranscript`).
  - Add `open_panel` and `close_panel` to the `useUiCommands` actions object (must be present at first render — the bus registers names once): `open_panel: (a) => canvas.open(a.type, a)`, `close_panel: (a) => a.type ? canvas.close(a.type, a.provider) : canvas.closeAll()`.
  - `onToolResult`: if `r.needsConnect`, `canvas.open('connect', { provider: r.needsConnect })`.
  - `searchLinks` effect: when non-empty, `canvas.open('search_results', { links: searchLinks })`.
  - `get_weather` handler: after fetching, `canvas.open('weather', { ...weather })` instead of the old overlay (keep the spoken line).
  - Mobile (`isMobile`) path unchanged (center-stage avatar, no transcript, no canvas).

- [ ] **Step 1: Write the failing test (desktop workspace)**

```tsx
// add to web/src/screens/TalkScreen.test.tsx
// mockIsMobile is already controllable in this file; CenterAvatar is mocked.
vi.mock('../canvas/CanvasHost', () => ({ CanvasHost: ({ children, panels }: any) =>
  <div data-testid="canvas-host">{panels.length === 0 ? children : panels.map((p: any) => <div key={p.key} data-testid={`panel-${p.type}`} />)}</div> }));

it('DESKTOP renders the 3-panel workspace: presence, canvas, chat', () => {
  mockIsMobile = false;
  (HTMLElement.prototype as any).scrollTo = (HTMLElement.prototype as any).scrollTo ?? (() => {});
  sessionState = { ...sessionState, connected: true, searchLinks: [], transcript: [{ id: 'l1', speaker: 'you', text: 'hi', streaming: false } as any] };
  render(<TalkScreen />);
  expect(screen.getByTestId('canvas-host')).toBeInTheDocument();
  expect(screen.getByText('hi')).toBeInTheDocument(); // transcript still shown (right column)
});

it('DESKTOP opens a connect panel when a tool-result needs one', async () => {
  mockIsMobile = false;
  (HTMLElement.prototype as any).scrollTo = (HTMLElement.prototype as any).scrollTo ?? (() => {});
  let captured: ((r: any) => void) | undefined;
  // capture the onToolResult passed into useNicoleSession
  useNicoleSessionMock.mockImplementation((opts: any) => { captured = opts.onToolResult; return sessionState; });
  sessionState = { ...sessionState, connected: true };
  render(<TalkScreen />);
  act(() => captured?.({ name: 'post_slack', ok: false, summary: '', needsConnect: 'slack' }));
  expect(await screen.findByTestId('panel-connect')).toBeInTheDocument();
});
```

> Note: this file currently mocks `useNicoleSession` with a fixed `sessionState`. To capture `onToolResult`, convert the `vi.mock('../engine/useNicoleSession', …)` factory to expose a `useNicoleSessionMock = vi.fn()` (call it in the factory) so the test can `mockImplementation`. Keep all existing tests working by having the default implementation return `sessionState`.

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd web && npx vitest run src/screens/TalkScreen.test.tsx`
Expected: FAIL — no `canvas-host` / `panel-connect`.

- [ ] **Step 3: Implement the wiring + layout**

- Import `useCanvas`, `CanvasHost`. Call `const canvas = useCanvas();`.
- Add to the `useUiCommands` actions: `open_panel`, `close_panel` (see Interfaces above).
- In `handleToolResult`, after the toast logic, add: `if (r.needsConnect) canvas.open('connect', { provider: r.needsConnect });`.
- Add an effect: `useEffect(() => { if (searchLinks.length) canvas.open('search_results', { links: searchLinks }); }, [searchLinks]);` (canvas.open is stable).
- Change the `get_weather` handler's success branch to `canvas.open('weather', { place: w.place, tempC: w.tempC, feelsC: w.feelsC, condition: w.condition, icon: w.icon, forecast: w.forecast })` in addition to the spoken `sendText`.
- Desktop render: replace the current `.talk-body` inner structure (for `!isMobile`) with three columns — keep `.talk-presence` as-is; put `<CanvasHost panels={canvas.panels} token={token} onClose={canvas.close}><HomePanel …/></CanvasHost>` in the center; move `<ChatTranscript …>` into a `.talk-chat` right column. Keep the existing mobile branch untouched.

- [ ] **Step 4: Add the 3-column CSS**

```css
/* web/src/screens/TalkScreen.css — desktop workspace grid */
@media (min-width: 1025px) {
  .talk-body--workspace { grid-template-columns: 300px 1fr 360px; }
  .talk-chat { border-left: 1px solid var(--border); background: var(--surface); display: flex; flex-direction: column; min-height: 0; }
  .talk-chat__head { padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: .7rem; letter-spacing: .08em; text-transform: uppercase; color: var(--text-3); font-weight: 700; }
  .talk-chat__feed { flex: 1; overflow-y: auto; padding: 16px; }
}
/* 641–1024px keeps the existing 2-column .talk-body (presence + conversation). */
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `cd web && npx vitest run src/screens/TalkScreen.test.tsx`
Expected: PASS (existing + 2 new).

- [ ] **Step 6: Full suite + build**

Run: `cd web && npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc clean; all tests pass; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add web/src/screens/TalkScreen.tsx web/src/screens/TalkScreen.css web/src/screens/TalkScreen.test.tsx
git commit -m "feat(talk): 3-panel workspace — Nicole / canvas / chat + open_panel wiring"
```

---

### Task 11: Short-error pass over existing user-facing strings

**Files:**
- Modify: `web/src/ui/toolToasts.ts` (if any error copy is long/technical)
- Modify: `web/src/weather/WeatherWidget.tsx`, `web/src/components/LinkCards.tsx`, `web/src/integrations/IntegrationsPanel.tsx` (route failure copy through `friendlyError`)
- Test: none new (covered by `friendlyError.test.ts`); ensure the suite stays green.

**Interfaces:**
- Consumes: `friendlyError` (Task 2).

- [ ] **Step 1: Find long/technical user-facing errors**

Run: `cd web && grep -rniE "error [0-9]|failed to|could not [a-z]+ [0-9]|status|\\$\{.*status" src --include=*.tsx --include=*.ts | grep -vi test` and list any string a USER could see (skip console-only logs).

- [ ] **Step 2: Replace each with a `friendlyError(...)` call or a short literal**

For each user-visible one, swap the message for `friendlyError('<kind>')` (or a ≤8-word literal following the same rules). Do NOT touch console.error/log strings.

- [ ] **Step 3: Run the full suite + build**

Run: `cd web && npx tsc --noEmit && npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(ui): short human-friendly copy for user-facing errors"
```

---

### Task 12: Visual verification + final full-suite gate

**Files:** none (verification only).

- [ ] **Step 1: Playwright desktop screenshot of the workspace**

With the app running, log in, start Talk, and screenshot the desktop view (1280×800). Confirm: 3 columns (presence / canvas-with-HomePanel-idle / chat), controls bar spanning the bottom. Then simulate a connect card (via a `post_slack` on an unconnected provider or by opening the integrations panel) and confirm the glassmorphism card renders with the shrinking timer bar.

- [ ] **Step 2: Mobile screenshot (iPhone 13)**

Confirm the mobile Talk view is UNCHANGED (center-stage avatar, no transcript, no canvas, no 3-column layout).

- [ ] **Step 3: Full gate**

Run: `cd web && npx tsc --noEmit && npx vitest run && npm run build` and `cd server && npx tsc --noEmit && npx vitest run && npm run build`
Expected: all green on both.

- [ ] **Step 4: Commit any screenshot-driven tweaks, then push**

```bash
git add -A && git commit -m "chore(talk): visual polish for the 3-panel workspace"
git push origin master:main
```
