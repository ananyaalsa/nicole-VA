# Nicole Talk — 3-Panel Workspace, Canvas & Inline Connect — Design

**Date:** 2026-07-01
**Status:** Approved design, ready for implementation planning
**Scope:** Desktop Talk screen only. Mobile Talk, Training, and Roleplay are unchanged.

## Goal

Turn the desktop Talk screen into a professional 3-panel workspace — **Nicole (left) · Canvas (center) · Chat (right)** — where Nicole opens rich, self-contained "panels" in the center on demand (via a new `open_panel` tool and existing events). The headline capability is an **inline per-integration Connect card** with glassmorphism styling: when Nicole needs a provider that isn't connected, a card appears with a Connect button so the user can authorize it right there, without going to Profile → Integrations.

This replaces a similar but "not smooth enough" mechanism from the earlier chat project. Smoothness comes from a single canvas reducer that every source funnels through, reactive integration state, and pure, isolated panel components.

## Non-goals (v1)

- No canvas on Training or Roleplay screens.
- No draggable/resizable/floating panels; the canvas is a simple ordered stack.
- No persistence of Note content across sessions (in-memory for the session only).
- No changes to the mobile Talk layout (keeps the avatar-only center-stage).

## Layout

Desktop Talk becomes a 3-column grid inside `.talk-body`:

```
┌───────────────┬──────────────────────────┬──────────────────┐
│  NICOLE        │        CANVAS            │      CHAT        │
│  ~300px        │        1fr               │     ~360px       │
│                │                          │                  │
│ Live2D avatar  │  Idle: greeting + brief  │  Transcript      │
│ voice switcher │       + starter chips    │  (you ↔ Nicole)  │
│ weather chip   │  Active: panels Nicole   │  + realtime      │
│                │  opened (connect,        │  bubbles         │
│                │  weather, search, note,  │  + jump-latest   │
│                │  integrations, calendar) │                  │
└───────────────┴──────────────────────────┴──────────────────┘
         controls bar (mic / camera / screen / volume / end)
```

- **Left panel** = the existing `.talk-presence` (moving avatar + voice selector + weather chip), narrower.
- **Center (Canvas)** = new `CanvasHost`. When idle (no open panels), it renders the existing `HomePanel` (greeting, daily brief, starter chips). When Nicole opens panels, they stack here, newest on top; the idle home is hidden while any panel is open.
- **Right (Chat)** = the transcript feed (`ChatTranscript`) moved out of the center into a dedicated column, plus the realtime bubbles and the "jump to latest" affordance.

**Breakpoints**
- `> 1024px`: full 3-column workspace.
- `641px–1024px`: fall back to today's 2-column Talk (presence + conversation), so nothing regresses on medium screens.
- `≤ 640px`: unchanged mobile avatar-only center-stage (no canvas, no transcript).

## The Canvas + `open_panel` tool

### Canvas state — `useCanvas`

A single reducer hook owns the center panels:

```ts
type PanelType = 'connect' | 'weather' | 'search_results' | 'note' | 'integrations';
interface Panel { key: string; type: PanelType; args?: Record<string, unknown>; }

interface UseCanvas {
  panels: Panel[];                 // newest last (rendered newest-on-top)
  open(type: PanelType, args?): void;   // singleton per (type + provider); re-open refreshes
  close(type: PanelType, key?): void;
  closeAll(): void;
}
```

- Singleton rule: opening the same `type` replaces/refreshes the existing one, EXCEPT `connect`, which is keyed by `type + provider` so each integration gets its own card.
- Every source of a panel — Nicole's `open_panel` tool, an auto-event (weather/search/needs-connect), or a Connect retry — calls `open()`. One code path, no scattered state.

### `open_panel` / `close_panel` tools (UI-control, no side effects)

New Gemini tools, declared alongside `set_camera`/`switch_mode` in `uiControlTools.ts`, and dispatched through the existing `extractToolCalls` → `UiCommandBus` → `useUiCommands` path:

```
open_panel({ type: "connect"|"weather"|"search_results"|"note"|"integrations",
             provider?: string,     // for connect
             text?: string })       // for note (Nicole writes into a scratch card)
close_panel({ type?: string })      // omit type → close all
```

- These are pure UI actions (like `set_camera`): the client executes them; the server only declares them and gates them to Talk mode.
- The prompt gains a short section teaching Nicole when to open each panel (e.g. "when you draft a summary the user might want to keep, open a note panel with it").

### Auto-population (no new tool needed for these)

- Weather: the existing `get_weather` tool result → `open('weather', …)` instead of the old overlay.
- Search: existing grounding `searchLinks` → `open('search_results', {links})`.
- Needs-connect: when a server integration tool for an unconnected provider is attempted, surface `open('connect', {provider})` (see next section).

## Panel registry (v1)

A `PANELS` map from `PanelType` → React component. Each panel is pure, typed, isolated, and independently testable.

| Panel | Component | Purpose |
| --- | --- | --- |
| `connect` | `ConnectCard` | Per-integration inline OAuth connect (headline feature). |
| `weather` | `WeatherPanel` | Re-homes the existing weather card into the canvas. |
| `search_results` | `LinkCardsPanel` | Re-homes the existing `LinkCards` (product/flight/hotel links). |
| `integrations` | `IntegrationsGridPanel` | Grid of all providers with connect/disconnect, opened by Nicole or a small canvas button. |
| `note` | `NotePanel` | A scratch text card Nicole writes into (a drafted summary/list); read-only display in v1, with a copy button. |

Adding a panel later = one component + one registry entry (e.g. a future `calendar` panel showing today's brief events).

### The canvas IS the home for old-Nicole "artifacts" (forward-looking)

The earlier Nicole had a popup/artifact system for richer UI elements — "presentation making and all." The `open_panel` canvas is deliberately the modern, smoother home for those: each old artifact becomes a **canvas panel** (e.g. a future `presentation` panel Nicole builds slide-by-slide) rather than a floating popup, so it lives in one consistent place with the same open/close/dismiss model and no window-management jank. This is **not in v1** (don't force it) — but the panel registry + `open_panel` tool are designed so those artifacts drop in later as additional `PanelType`s with zero architectural change.

## Inline Connect card (headline feature)

- **One card per integration**, keyed by provider, glassmorphism styling (frosted translucent bg, subtle border, soft shadow, teal accent).
- **Content:** provider brand icon + name, one contextual line ("Connect Slack so I can post there."), a **Connect** button, and a **✕**.
- **Connect action:** calls the existing `connectIntegration(token, provider)` which opens the OAuth popup and resolves `{ok, provider}`. On success: re-fetch `IntegrationStatus`, flip the card to "Connected ✓" briefly, fire `nicole:integrations-updated`, then auto-close; Nicole can retry the action that needed it.
- **Dismissal rules:**
  - Persists until the user clicks **✕**, OR
  - **auto-dismisses after 10 seconds of no interaction.**
  - Hover or focus on the card **resets/pauses the 10s timer**, so it never vanishes while being read. The timer resumes (fresh 10s) when the pointer/focus leaves.
- **Trigger sources:**
  1. `open_panel({type:"connect", provider})` from Nicole.
  2. **Server signals it (chosen approach).** When Nicole calls a server integration tool for a provider that isn't connected, the tool dispatch returns a structured result with `ok:false` and a `needsConnect: "<provider>"` field (the server already knows `connected` state per provider). The existing tool-result echo (`onToolResult`) is extended to carry `needsConnect`; the client, on seeing it, calls `canvas.open('connect', {provider})`. This is preferred over a client-side pre-check because the server is the source of truth for connection state and already runs on every tool attempt — one authoritative path, no drift.

## Data flow & smoothness

- **Single source of truth:** `useCanvas` reducer. Tool calls, auto-events, and connect retries all call `open/close`.
- **Reactive integration state:** a small `useIntegrations` hook holds `IntegrationStatus[]`, refreshes on mount and on `nicole:integrations-updated`. Connect cards and the integrations grid read from it, so a successful OAuth updates every surface at once.
- **Isolation:** panels take typed props only; no panel reaches into another. The canvas host knows nothing about a panel's internals — just its `type` and `args`.

## Error handling

**Principle — every user-facing error is SHORT and human-friendly.** One plain sentence, no codes, no stack traces, no jargon; it says what happened and what to do next, in Nicole's calm voice. This applies to the new canvas AND is a pass over existing user-facing error strings (toasts, connect/weather/search failures, integration errors) to shorten anything technical. Examples of the tone:

- OAuth popup blocked/cancelled → "Couldn't connect Slack — want to try again?" (Connect button returns to idle; card stays open, timer reset).
- Integration status fetch fails → "Couldn't load your integrations. Retry?" (quiet inline state; never crashes the canvas).
- A tool/integration action fails → "That didn't go through. Try once more?" (not the raw server error).
- Search/weather unavailable → "Couldn't reach that right now." (no error object shown).

Rules for writing them: ≤ ~8 words where possible; active voice; no "Error:", no HTTP status, no provider/tool internal names; offer the next step ("Retry?", "Try again?") when there is one. A short helper (`friendlyError(kind)`) centralizes the strings so tone stays consistent.

**Containment:**

- Unknown `open_panel` type → ignored (logged to console only), never throws, no user-facing message.
- A panel component error is contained by a per-panel error boundary showing a tiny "This didn't load." — one bad panel can't take down the canvas or the session.

## Testing

- **`useCanvas` reducer:** open/close, singleton refresh, per-provider connect keying, `closeAll`.
- **`ConnectCard`:** renders the provider; Connect calls `connectIntegration`; ✕ closes; the 10s auto-dismiss fires (fake timers); hover/focus pauses and resets the timer.
- **`useIntegrations`:** refreshes on the `nicole:integrations-updated` event.
- **`open_panel` tool:** declared and gated to Talk (extend `uiControlTools.test.ts`); the `useUiCommands` mapping routes it to `canvas.open`.
- **`TalkWorkspace` layout:** desktop (>1024) renders the 3 columns (canvas testid present); the ≤640 mobile path still renders the center-stage avatar and no transcript (existing tests keep passing).
- Existing Talk tests must stay green; the mobile behavior is untouched.

## Rollout / sequencing (informs the plan, not binding)

1. Canvas host + `useCanvas` reducer + 3-column layout shell (idle = HomePanel).
2. `open_panel`/`close_panel` tools + `useUiCommands` wiring + prompt guidance.
3. Re-home Weather + Search panels into the canvas (behavior parity).
4. Connect card + `useIntegrations` + inline OAuth + 10s/hover dismissal.
5. Integrations grid + Note + Calendar panels.
6. Needs-connect trigger from a failed integration tool attempt.
