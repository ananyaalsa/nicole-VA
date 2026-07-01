# Nicole Canvas Results System — Design Spec

**Date:** 2026-07-01
**Status:** Approved (visual + architecture sections confirmed)

## Goal

Any web/tool result Nicole produces — weather, news, general web search, or Amazon
products — appears as a rich **glassmorphism overlay** on the canvas while she talks,
auto-collapses into a small **canvas pill** after ~10s, and pills persist and stack so
the user can tap any to re-expand it. This replaces the current flat weather panel and the
broken empty `search_results` panel with one unified, honest results system, adds real
Amazon product cards, restores the earlier glassmorphism weather UI, and hardens Nicole
against hallucination.

## Motivation (what's broken today)

From a live Talk session:
1. **Empty-search loop.** Nicole says "I'll pull up the results / give you all the links,"
   opens the `search_results` panel, but it shows "No results to show yet." and she loops
   apologizing. Root cause: she can open the panel on demand, but it's only ever populated
   by the internal Google-Search **grounding-chunks** path — never by a product/shopping
   query, which she answers from memory. So the panel opens empty.
2. **No product search.** "Find me a headset on Amazon" produces model-recalled product
   names, not real products with live prices/images/links.
3. **Weak weather UI.** The current flat `WeatherPanel` replaced an earlier, better dark
   glassmorphism weather card that showed while talking and faded after ~10s.
4. **Hallucination.** During screen-share, Nicole invented on-screen data that wasn't there.

## Global Constraints

- Overlay auto-collapses to a pill after **~10s** (10000ms), **paused on hover/focus**,
  resuming on leave. Pills **persist and stack**; tapping a pill re-expands that item's overlay.
- Glassmorphism aesthetic over the terrain background: translucent dark card,
  `backdrop-filter: blur(...) saturate(...)`, subtle border + shadow, a shrinking timer bar.
- Mobile keeps its center-stage layout; the overlay adapts to a bottom-sheet / full-width card.
- All user-facing error/empty copy: short (≤~8 words), active voice, no codes/jargon.
  Use `friendlyError` on the client where a kind fits.
- **Product cards render ONLY from real scraper data — never from model-emitted text.**
  A results overlay only exists when a tool returned real data (no opening an empty overlay).
- `nicolePrompt.ts` is a template literal — never introduce a stray backtick.
- New voice tools are gated to **Talk mode** and dispatched through the existing tool pipeline
  (`extractToolCalls` → dispatch → `tool-result` message → client).
- Scraper never blocks a session: it runs under a timeout; on block/empty it returns a
  fallback signal, never a fabricated product.

## Architecture

### The shared spine: `useResultDeck` (client)

A single reducer holds an ordered list of **result items**:

```
ResultItem {
  id: string
  kind: 'weather' | 'news' | 'search' | 'products'
  payload: WeatherPayload | NewsPayload | SearchPayload | ProductsPayload
  state: 'overlay' | 'pill'
}
```

Reducer actions:
- `push(kind, payload)` → append a new item in `state: 'overlay'` (id generated from a
  monotonic counter; no `Date.now()`/random needed). If an item of the same singleton kind
  (`weather`) already exists, replace its payload and re-open it as an overlay.
- `collapse(id)` → set `state: 'pill'`.
- `expand(id)` → set `state: 'overlay'` and re-arm its timer.
- `dismiss(id)` → remove the item entirely (✕ on a pill/overlay).

The **timer** (~10s, hover-paused) lives in the overlay presenter (mirrors the existing
`ConnectPanel` pattern: `armTimer` on mount, pause on hover/focus via refs, `onCloseRef`).
On fire it calls `collapse(id)`. This keeps the reducer pure and testable.

### Presenters (one per kind)

- `WeatherCard` — big temp + icon, place, feels-like, 4-day strip. (Restores the old UI.)
- `NewsCard` — "📰 Top news today" + a headline list (`{title, source, url}[]`).
- `SearchCard` — link cards for general web results (reuses/extends `LinkCards`).
- `ProductGrid` — 3-up grid of product cards: real image, title (2-line clamp), star rating +
  review count, live price, ✓prime, "View on Amazon" buy link. Empty/blocked → fallback copy.

The **ResultOverlay** host renders, for each item: if `state==='overlay'`, the presenter inside
the glass chrome + timer bar; if `state==='pill'`, a pill (`icon + short label`, e.g.
"🛒 Headsets · 5") in the canvas pill tray. Pills wrap; clicking a pill → `expand(id)`.

### Relationship to existing `useCanvas`

`useCanvas` (connect / note / integrations — non-timed, on-demand panels) **stays as-is**.
The deck handles the **timed result kinds** (weather/news/search/products). The current flat
`WeatherPanel` and `search_results` `PanelType` are **removed** from the canvas registry and
replaced by the deck. `open_panel`'s `type` enum drops `weather` and `search_results`
(they're deck-driven now, not model-opened); `open_panel` keeps `connect | note | integrations`.

## Data sources & server tools

All three are new/rerouted server tools, Talk-gated, returning a typed payload the relay
forwards in the `tool-result` message; the client maps each to `deck.push(kind, payload)`.

### 1. Weather — reroute existing `get_weather`
Already returns current + forecast. Change: the client pushes a `weather` deck item (glass card)
instead of opening the old overlay / flat panel. No new server data. The spoken one-line reading
is preserved.

### 2. `web_search({ query })` — news & general web
Uses the existing Gemini Google-Search grounding. Returns **structured**
`{ results: {title, url, source, snippet}[] }` extracted from grounding chunks. The client
pushes a `news` item (headline list) for news-y queries or a `search` item (link cards) otherwise
— the tool includes a `presentation: 'news' | 'links'` hint chosen by Nicole via the tool args.
Empty grounding → `{ results: [] }` → Nicole says what she found + offers to dig further; no
empty overlay is pushed (client only pushes when `results.length > 0`).

### 3. `search_products({ query, limit? })` — Amazon
A **headless-browser scraper** (Playwright, already a repo dependency) loads Amazon search for
`query`, parses product tiles → `{ title, price, image, rating, reviews, prime, url }[]`,
returns up to `limit` (default 5). Wrapped in a **timeout**. Results **cached briefly per
normalized query** to avoid re-scraping within a short window.
**Graceful fallback:** on block (CAPTCHA / robot page / empty parse) it returns
`{ blocked: true, results: [] }`. The client does NOT push a product overlay; instead Nicole
(per prompt) speaks 2–3 recommendations aloud and pushes a `search` link pill (a plain
web-search for the query). **Never a fabricated product card.**
The scraper lives behind a small interface (`ProductSearchProvider`) so a hosted API can
replace it later without touching tools or UI.

## Anti-hallucination

**Prompt rules** (`nicolePrompt.ts`, strengthened):
- *Screen-share/vision:* describe ONLY what is actually visible; if text is small/blurry, say
  "I can't read that clearly — can you zoom in?"; never invent labels/numbers/data.
- *Facts:* if not certain, search first — don't guess; when unsure, mark confidence
  ("it looks like ~$40, but I can't read it exactly").
- *Results:* report only what a tool actually returned; never add products/prices/headlines
  that weren't in the result.

**Code guardrails** (make the failed paths incapable of fabricating):
- `ProductGrid` renders only from real `search_products` data; there is no path for model text
  to become a product card.
- The empty-`search_results`-panel loop is removed: no results overlay exists without real data.
- Tool-result reporting reflects the actual returned payload.

## Error handling

- `search_products` blocked/timeout → speak + web-search link pill fallback; no broken panel.
- `web_search` empty → spoken "what I found" + offer to dig; no empty overlay.
- A presenter throws → the deck's error boundary shows a short friendly line; the pill stays
  dismissable.
- Scraper hard-capped by timeout so a hung browser never stalls a voice session.
- All copy short + human.

## Testing

- `useResultDeck` reducer (unit): push→overlay; timer→collapse to pill; hover pauses; tap
  `expand` re-opens + re-arms; pills stack; `weather` is singleton-replace; `dismiss` removes.
- Presenters (unit): each renders its payload; `ProductGrid` renders real cards; empty/blocked
  → fallback copy (no fabricated card).
- Server `web_search` (unit): maps a grounding-chunks fixture → structured results; empty → `[]`.
- Server `search_products` (unit): parses a **saved Amazon HTML fixture** → product objects;
  a **blocked/robot HTML fixture** → `{ blocked: true }`. No live network in tests.
- Deck error boundary (unit): a throwing presenter is caught; pill remains dismissable.

## Mobile

The overlay renders as a bottom-sheet / full-width glass card (like the old mobile weather
overlay); the pill tray wraps. The mobile center-stage Talk layout is otherwise unchanged.

## Out of scope (explicitly)

- Affiliate/monetized Amazon links, multi-retailer product search, price-history/compare.
- Verified live prices beyond what the scraper returns at query time.
- Persisting pills across sessions (deck is per-session).
