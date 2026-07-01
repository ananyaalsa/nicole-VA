# Canvas Results System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify weather / news / web-search / Amazon-product results into one glassmorphism overlay→pill "result deck" on the Talk canvas, restore the old weather card, add a real Amazon product scraper with graceful fallback, and harden Nicole against hallucination.

**Architecture:** A client `useResultDeck` reducer holds timed result items (kind + payload + overlay|pill state); a `ResultDeck` host renders each item as a glassmorphism overlay (auto-collapse ~10s, hover-paused) or a canvas pill (tap to re-expand). Weather reroutes into the deck; two new **server** tools (`web_search`, `search_products`) return structured data carried on an extended `tool-result` message; the Amazon scraper runs headless (Playwright) with a block/empty fallback. Prompt rules + code guardrails prevent fabricated results.

**Tech Stack:** React 19 + Vite + TypeScript (`web/`), Node `node:http` + `ws` + TypeScript (`server/`), Playwright (already a dependency), Vitest.

## Global Constraints

- Overlay auto-collapses to a pill after **10000ms**, **paused on hover/focus**, resumes on leave. Pills **persist and stack**; tapping a pill re-expands that item.
- Glassmorphism over the terrain: translucent dark card, `backdrop-filter: blur(...) saturate(...)`, border + shadow, a shrinking timer bar. Honor `prefers-reduced-motion` (no animation; timer hidden).
- Mobile keeps center-stage layout; overlay adapts to a full-width/bottom card. Desktop workspace unchanged.
- All user-facing error/empty copy: ≤~8 words, active voice, no codes/jargon. Use `friendlyError` on the client where a kind fits.
- **Product cards render ONLY from real scraper data — never model text. A results overlay only exists when a tool returned real data (never open an empty overlay).**
- `server/src/prompt/nicolePrompt.ts` is a TEMPLATE LITERAL — never introduce a stray backtick.
- New voice tools gated to **Talk mode**, dispatched through the existing pipeline.
- Scraper runs under a hard timeout; on block/empty returns `{ blocked: true, results: [] }` — never a fabricated product.
- **NEVER `git add -A`** — the repo carries unrelated WIP; `git add` only the task's own files by explicit path.
- Verify per task: `cd web && npx tsc --noEmit` (IGNORE false-positive `aria-pressed/selected/busy/expanded` lint) `&& npx vitest run <path>`; `cd server && npx tsc --noEmit && npx vitest run <path>`. Full gate + build at the end.

---

## File Structure

**Client (`web/src/`):**
- `canvas/resultDeck/resultTypes.ts` — payload + item types (NEW)
- `canvas/resultDeck/useResultDeck.ts` — the reducer hook (NEW)
- `canvas/resultDeck/useResultDeck.test.ts` — reducer tests (NEW)
- `canvas/resultDeck/OverlayFrame.tsx` — glass chrome + ~10s hover-paused timer wrapper (NEW)
- `canvas/resultDeck/ResultDeck.tsx` — host: renders overlays + pill tray (NEW)
- `canvas/resultDeck/ResultDeck.css` — glass + pill styling (NEW)
- `canvas/resultDeck/presenters/WeatherCard.tsx` — old glass weather UI (NEW)
- `canvas/resultDeck/presenters/NewsCard.tsx` — headline list (NEW)
- `canvas/resultDeck/presenters/SearchCard.tsx` — link cards (wraps LinkCards) (NEW)
- `canvas/resultDeck/presenters/ProductGrid.tsx` — Amazon product cards (NEW)
- `canvas/resultDeck/presenters/presenters.css` — presenter styles (NEW)
- `screens/TalkScreen.tsx` — wire the deck; reroute get_weather; consume tool-result `data` (MODIFY)
- `engine/useNicoleSession.ts` — carry `data` on tool-result → onToolResult (MODIFY)

**Server (`server/src/`):**
- `products/amazonScraper.ts` — Playwright Amazon search scraper + parse + block detection (NEW)
- `products/amazonScraper.test.ts` — parse fixtures (NEW)
- `products/productSearch.ts` — `ProductSearchProvider` interface + `searchProducts()` with timeout + cache (NEW)
- `products/productSearch.test.ts` — timeout/cache/fallback tests (NEW)
- `products/fixtures/amazon-headsets.html` — saved Amazon results HTML (NEW)
- `products/fixtures/amazon-blocked.html` — saved robot/CAPTCHA page (NEW)
- `gemini/resultTools.ts` — `web_search` + `search_products` ToolDecls + name set (NEW)
- `gemini/relay.ts` — dispatch the two result tools; extend `tool-result` with `data` (MODIFY)
- `prompt/nicolePrompt.ts` — anti-hallucination rules + result-tool guidance (MODIFY)

---

## Task 1: Result deck types + reducer

**Files:**
- Create: `web/src/canvas/resultDeck/resultTypes.ts`, `web/src/canvas/resultDeck/useResultDeck.ts`
- Test: `web/src/canvas/resultDeck/useResultDeck.test.ts`

**Interfaces:**
- Produces:
  - `type ResultKind = 'weather' | 'news' | 'search' | 'products'`
  - `interface WeatherPayload { place: string; tempC: number; feelsC: number; condition: string; icon: string; forecast: { date: string; hiC: number; loC: number; icon: string }[] }`
  - `interface NewsItem { title: string; url: string; source: string }` ; `interface NewsPayload { items: NewsItem[] }`
  - `interface SearchResult { url: string; title: string }` ; `interface SearchPayload { results: SearchResult[] }`
  - `interface Product { title: string; price: string; image: string | null; rating: number | null; reviews: number | null; prime: boolean; url: string }` ; `interface ProductsPayload { query: string; products: Product[] }`
  - `type ResultPayload = WeatherPayload | NewsPayload | SearchPayload | ProductsPayload`
  - `interface ResultItem { id: string; kind: ResultKind; payload: ResultPayload; label: string; icon: string; state: 'overlay' | 'pill' }`
  - `useResultDeck(): { items: ResultItem[]; push(kind, payload, meta): string; collapse(id): void; expand(id): void; dismiss(id): void }` where `meta = { label: string; icon: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/canvas/resultDeck/useResultDeck.test.ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/canvas/resultDeck/useResultDeck.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement types**

```ts
// web/src/canvas/resultDeck/resultTypes.ts
export type ResultKind = 'weather' | 'news' | 'search' | 'products';

export interface WeatherPayload {
  place: string; tempC: number; feelsC: number; condition: string; icon: string;
  forecast: { date: string; hiC: number; loC: number; icon: string }[];
}
export interface NewsItem { title: string; url: string; source: string; }
export interface NewsPayload { items: NewsItem[]; }
export interface SearchResult { url: string; title: string; }
export interface SearchPayload { results: SearchResult[]; }
export interface Product {
  title: string; price: string; image: string | null;
  rating: number | null; reviews: number | null; prime: boolean; url: string;
}
export interface ProductsPayload { query: string; products: Product[]; }

export type ResultPayload = WeatherPayload | NewsPayload | SearchPayload | ProductsPayload;

export interface ResultItem {
  id: string; kind: ResultKind; payload: ResultPayload;
  label: string; icon: string; state: 'overlay' | 'pill';
}
export interface ResultMeta { label: string; icon: string; }
```

- [ ] **Step 4: Implement the reducer hook**

```ts
// web/src/canvas/resultDeck/useResultDeck.ts
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
```

- [ ] **Step 5: Run to verify pass**

Run: `cd web && npx vitest run src/canvas/resultDeck/useResultDeck.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add web/src/canvas/resultDeck/resultTypes.ts web/src/canvas/resultDeck/useResultDeck.ts web/src/canvas/resultDeck/useResultDeck.test.ts
git commit -m "feat(deck): result deck types + reducer (overlay/pill, weather singleton)"
```

---

## Task 2: OverlayFrame (glass chrome + ~10s hover-paused timer)

**Files:**
- Create: `web/src/canvas/resultDeck/OverlayFrame.tsx`, `web/src/canvas/resultDeck/ResultDeck.css`
- Test: `web/src/canvas/resultDeck/OverlayFrame.test.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `OverlayFrame({ label, icon, onCollapse, onDismiss, children }): JSX.Element` — renders the glass card with a ✕ (calls `onDismiss`), a title row (`icon label`), the `children` (a presenter), and a timer bar that fires `onCollapse` after 10000ms, paused on hover/focus. Uses `AUTO_COLLAPSE_MS = 10000`.

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/canvas/resultDeck/OverlayFrame.test.tsx
import { render, screen, act } from '@testing-library/react';
import { OverlayFrame } from './OverlayFrame';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it('collapses after 10s', () => {
  const onCollapse = vi.fn();
  render(<OverlayFrame label="Top news" icon="📰" onCollapse={onCollapse} onDismiss={() => {}}><p>body</p></OverlayFrame>);
  expect(screen.getByText('body')).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(10000); });
  expect(onCollapse).toHaveBeenCalledTimes(1);
});

it('✕ dismisses', () => {
  const onDismiss = vi.fn();
  render(<OverlayFrame label="Top news" icon="📰" onCollapse={() => {}} onDismiss={onDismiss}><p>body</p></OverlayFrame>);
  screen.getByLabelText('Dismiss Top news').click();
  expect(onDismiss).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/canvas/resultDeck/OverlayFrame.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement OverlayFrame (mirror ConnectPanel's timer pattern)**

```tsx
// web/src/canvas/resultDeck/OverlayFrame.tsx
import { useCallback, useEffect, useRef } from 'react';
import type { JSX, ReactNode } from 'react';
import './ResultDeck.css';

const AUTO_COLLAPSE_MS = 10000;

export interface OverlayFrameProps {
  label: string; icon: string;
  onCollapse(): void; onDismiss(): void;
  children: ReactNode;
}

/** Glassmorphism overlay chrome with a ~10s auto-collapse timer (paused on hover/focus). */
export function OverlayFrame({ label, icon, onCollapse, onDismiss, children }: OverlayFrameProps): JSX.Element {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCollapseRef = useRef(onCollapse);
  onCollapseRef.current = onCollapse;

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);
  const armTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => onCollapseRef.current(), AUTO_COLLAPSE_MS);
  }, [clearTimer]);

  useEffect(() => { armTimer(); return clearTimer; }, [armTimer, clearTimer]);

  return (
    <div
      className="result-overlay"
      data-testid="result-overlay"
      onMouseEnter={clearTimer} onMouseLeave={armTimer}
      onFocus={clearTimer} onBlur={armTimer}
    >
      <button type="button" className="result-overlay__x" onClick={onDismiss} aria-label={`Dismiss ${label}`}>✕</button>
      <div className="result-overlay__head"><span aria-hidden="true">{icon}</span> {label}</div>
      <div className="result-overlay__body">{children}</div>
      <span className="result-overlay__timer" aria-hidden="true" />
    </div>
  );
}

export default OverlayFrame;
```

- [ ] **Step 4: Implement ResultDeck.css (glass + timer + pills)**

```css
/* web/src/canvas/resultDeck/ResultDeck.css */
.result-deck { position: relative; height: 100%; display: flex; flex-direction: column; gap: 12px; padding: 14px; overflow-y: auto; }
.result-deck__pills { display: flex; gap: 8px; flex-wrap: wrap; }
.result-pill { display: inline-flex; align-items: center; gap: 7px; padding: 7px 13px; border-radius: 999px;
  background: rgba(20,45,42,.5); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,.16); color: var(--text-1, #eafaf4); font-size: .82rem; font-weight: 600; cursor: pointer; }

.result-overlay { position: relative; border-radius: 16px; padding: 14px 16px; overflow: hidden;
  background: rgba(16,40,37,.52); -webkit-backdrop-filter: blur(16px) saturate(140%); backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid rgba(255,255,255,.14); box-shadow: 0 16px 46px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.1);
  color: var(--text-1, #eafaf4); }
.result-overlay__x { position: absolute; top: 10px; right: 12px; border: 0; background: transparent; color: inherit; font-size: 1rem; line-height: 1; cursor: pointer; opacity: .8; }
.result-overlay__head { font-size: .72rem; letter-spacing: .12em; text-transform: uppercase; color: #9fe8d5; font-weight: 700; margin-bottom: 10px; }
.result-overlay__timer { position: absolute; left: 0; bottom: 0; height: 3px; width: 100%; transform-origin: left;
  background: linear-gradient(90deg, #37b39f, #7fe3d3); animation: result-timer 10s linear forwards; }
.result-overlay:hover .result-overlay__timer, .result-overlay:focus-within .result-overlay__timer { animation-play-state: paused; }
@keyframes result-timer { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@media (prefers-reduced-motion: reduce) { .result-overlay__timer { animation: none; display: none; } }
```

- [ ] **Step 5: Run to verify pass**

Run: `cd web && npx vitest run src/canvas/resultDeck/OverlayFrame.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add web/src/canvas/resultDeck/OverlayFrame.tsx web/src/canvas/resultDeck/ResultDeck.css web/src/canvas/resultDeck/OverlayFrame.test.tsx
git commit -m "feat(deck): OverlayFrame glass chrome + 10s hover-paused timer"
```

---

## Task 3: Presenters — WeatherCard, NewsCard, SearchCard, ProductGrid

**Files:**
- Create: `web/src/canvas/resultDeck/presenters/WeatherCard.tsx`, `NewsCard.tsx`, `SearchCard.tsx`, `ProductGrid.tsx`, `presenters.css`
- Test: `web/src/canvas/resultDeck/presenters/presenters.test.tsx`

**Interfaces:**
- Consumes: payload types from Task 1 (`WeatherPayload`, `NewsPayload`, `SearchPayload`, `ProductsPayload`), `LinkCards` from `web/src/components/LinkCards.tsx` (props `{ links: {url,title}[]; onClose? }`).
- Produces: `WeatherCard({ payload }: { payload: WeatherPayload })`, `NewsCard({ payload }: { payload: NewsPayload })`, `SearchCard({ payload }: { payload: SearchPayload })`, `ProductGrid({ payload }: { payload: ProductsPayload })` — each returns `JSX.Element`. `ProductGrid` shows a friendly empty state when `products` is empty.

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/canvas/resultDeck/presenters/presenters.test.tsx
import { render, screen } from '@testing-library/react';
import { WeatherCard } from './WeatherCard';
import { NewsCard } from './NewsCard';
import { ProductGrid } from './ProductGrid';

vi.mock('../../../auth/AuthContext', () => ({ useAuth: () => ({ token: 't' }) }));

it('WeatherCard shows temp, place, feels-like', () => {
  render(<WeatherCard payload={{ place: 'Chicago', tempC: 26, feelsC: 30, condition: 'Clear sky', icon: '☀️',
    forecast: [{ date: '2026-07-02', hiC: 37, loC: 25, icon: '⛈️' }] }} />);
  expect(screen.getByText(/26/)).toBeInTheDocument();
  expect(screen.getByText('Chicago')).toBeInTheDocument();
  expect(screen.getByText(/Clear sky/)).toBeInTheDocument();
});

it('NewsCard lists headlines', () => {
  render(<NewsCard payload={{ items: [{ title: 'Big headline', url: 'https://x.com', source: 'x.com' }] }} />);
  expect(screen.getByText('Big headline')).toBeInTheDocument();
});

it('ProductGrid renders a real product card', () => {
  render(<ProductGrid payload={{ query: 'headset', products: [
    { title: 'Sony XM5', price: '$328.00', image: null, rating: 4.6, reviews: 1200, prime: true, url: 'https://a.com/1' }] }} />);
  expect(screen.getByText('Sony XM5')).toBeInTheDocument();
  expect(screen.getByText('$328.00')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /view on amazon/i })).toHaveAttribute('href', 'https://a.com/1');
});

it('ProductGrid shows friendly empty state with no products', () => {
  render(<ProductGrid payload={{ query: 'headset', products: [] }} />);
  expect(screen.getByText(/no products/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/canvas/resultDeck/presenters/presenters.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement WeatherCard**

```tsx
// web/src/canvas/resultDeck/presenters/WeatherCard.tsx
import type { JSX } from 'react';
import type { WeatherPayload } from '../resultTypes';
import './presenters.css';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function weekday(iso: string): string { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : WD[d.getDay()]; }

export function WeatherCard({ payload }: { payload: WeatherPayload }): JSX.Element {
  const p = payload;
  return (
    <div className="wx-card" data-testid="wx-card">
      <div className="wx-top">
        <span className="wx-icon" aria-hidden="true">{p.icon}</span>
        <span className="wx-temp">{Math.round(p.tempC)}°</span>
        <span className="wx-meta">
          <span className="wx-place">{p.place}</span>
          <span className="wx-cond">{p.condition}</span>
          <span className="wx-feels">Feels {Math.round(p.feelsC)}°</span>
        </span>
      </div>
      {p.forecast.length > 0 && (
        <div className="wx-days">
          {p.forecast.slice(0, 4).map((d) => (
            <div className="wx-day" key={d.date}>
              <span className="wx-day__d">{weekday(d.date)}</span>
              <span className="wx-day__i" aria-hidden="true">{d.icon}</span>
              <span className="wx-day__t">{Math.round(d.hiC)}°<small>/{Math.round(d.loC)}°</small></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export default WeatherCard;
```

- [ ] **Step 4: Implement NewsCard**

```tsx
// web/src/canvas/resultDeck/presenters/NewsCard.tsx
import type { JSX } from 'react';
import type { NewsPayload } from '../resultTypes';
import './presenters.css';

export function NewsCard({ payload }: { payload: NewsPayload }): JSX.Element {
  if (!payload.items.length) return <p className="deck-empty">Nothing to show yet.</p>;
  return (
    <ul className="news-list" data-testid="news-list">
      {payload.items.map((n) => (
        <li className="news-item" key={n.url}>
          <a href={n.url} target="_blank" rel="noopener noreferrer">
            <span className="news-item__title">{n.title}</span>
            <span className="news-item__src">{n.source}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
export default NewsCard;
```

- [ ] **Step 5: Implement SearchCard**

```tsx
// web/src/canvas/resultDeck/presenters/SearchCard.tsx
import type { JSX } from 'react';
import type { SearchPayload } from '../resultTypes';
import { LinkCards } from '../../../components/LinkCards';

export function SearchCard({ payload }: { payload: SearchPayload }): JSX.Element {
  return <LinkCards links={payload.results} />;
}
export default SearchCard;
```

- [ ] **Step 6: Implement ProductGrid**

```tsx
// web/src/canvas/resultDeck/presenters/ProductGrid.tsx
import type { JSX } from 'react';
import type { ProductsPayload } from '../resultTypes';
import './presenters.css';

function stars(rating: number | null): string {
  if (rating == null) return '';
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
}

export function ProductGrid({ payload }: { payload: ProductsPayload }): JSX.Element {
  if (!payload.products.length) {
    return <p className="deck-empty" data-testid="products-empty">No products found — want me to try again?</p>;
  }
  return (
    <div className="product-grid" data-testid="product-grid">
      {payload.products.map((p) => (
        <a className="pcard" key={p.url} href={p.url} target="_blank" rel="noopener noreferrer">
          <div className="pcard__img">
            {p.image
              ? <img src={p.image} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
              : <span aria-hidden="true">🛒</span>}
          </div>
          <div className="pcard__body">
            <span className="pcard__title">{p.title}</span>
            {p.rating != null && (
              <span className="pcard__rating">{stars(p.rating)} {p.reviews != null && <small>({p.reviews.toLocaleString()})</small>}</span>
            )}
            <span className="pcard__price">{p.price}{p.prime && <span className="pcard__prime">✓prime</span>}</span>
            <span className="pcard__buy" role="link" aria-label="View on Amazon">View on Amazon</span>
          </div>
        </a>
      ))}
    </div>
  );
}
export default ProductGrid;
```

Note: the whole card is the anchor; the inner "View on Amazon" is a styled span with `role="link"`/`aria-label` so the test's `getByRole('link', { name: /view on amazon/i })` matches an element whose nearest link `href` is the product url. If the testing-library role lookup resolves the span rather than the anchor, change the assertion target: make "View on Amazon" the accessible name of the anchor via `aria-label={`View on Amazon: ${p.title}`}` on the `<a>` and drop the inner role. Implement it as: put `aria-label={`View ${p.title} on Amazon`}` on the `<a>` and render plain text "View on Amazon" inside; then the test selector `getByRole('link', { name: /view.*on amazon/i })` returns the anchor with the correct href.

- [ ] **Step 7: Implement presenters.css**

```css
/* web/src/canvas/resultDeck/presenters/presenters.css */
.deck-empty { color: #a9e6d7; font-size: .86rem; margin: 6px 0; }

/* Weather */
.wx-card .wx-top { display: flex; align-items: center; gap: 14px; }
.wx-icon { font-size: 3rem; line-height: 1; }
.wx-temp { font-size: 2.8rem; font-weight: 800; letter-spacing: -.02em; }
.wx-meta { margin-left: auto; text-align: right; display: flex; flex-direction: column; }
.wx-place { font-size: .9rem; font-weight: 700; }
.wx-cond { font-size: .8rem; color: #a9e6d7; }
.wx-feels { font-size: .74rem; color: #8fd3c4; }
.wx-days { display: flex; gap: 8px; margin-top: 14px; }
.wx-day { flex: 1; text-align: center; padding: 9px 4px; border-radius: 11px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08); display: flex; flex-direction: column; gap: 2px; }
.wx-day__d { font-size: .68rem; color: #9fe8d5; font-weight: 700; letter-spacing: .05em; }
.wx-day__i { font-size: 1.2rem; }
.wx-day__t { font-size: .74rem; font-weight: 600; }
.wx-day__t small { color: #7fb8ac; }

/* News */
.news-list { list-style: none; margin: 0; padding: 0; }
.news-item a { display: flex; flex-direction: column; gap: 2px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.08); text-decoration: none; color: inherit; }
.news-item:last-child a { border-bottom: 0; }
.news-item__title { font-size: .88rem; line-height: 1.25; }
.news-item__src { font-size: .72rem; color: #9fe8d5; }

/* Products */
.product-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
@media (max-width: 820px) { .product-grid { grid-template-columns: repeat(2, 1fr); } }
.pcard { background: rgba(255,255,255,.95); border-radius: 12px; overflow: hidden; color: #16201d; display: flex; flex-direction: column; text-decoration: none; box-shadow: 0 8px 22px rgba(0,0,0,.2); }
.pcard__img { height: 100px; display: flex; align-items: center; justify-content: center; background: #fff; font-size: 2.4rem; }
.pcard__img img { max-height: 100%; max-width: 100%; object-fit: contain; }
.pcard__body { padding: 9px 10px 11px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
.pcard__title { font-size: .78rem; font-weight: 600; line-height: 1.2; color: #1a1a1a; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pcard__rating { font-size: .7rem; color: #b8860b; }
.pcard__rating small { color: #777; }
.pcard__price { font-size: 1rem; font-weight: 800; color: #0b7a3b; margin-top: auto; display: flex; align-items: center; gap: 6px; }
.pcard__prime { font-size: .62rem; color: #146eb4; font-weight: 700; }
.pcard__buy { margin-top: 6px; text-align: center; font-size: .74rem; font-weight: 700; color: #fff; background: linear-gradient(90deg, #0f766e, #12a594); border-radius: 8px; padding: 6px 8px; }
```

- [ ] **Step 8: Run to verify pass**

Run: `cd web && npx vitest run src/canvas/resultDeck/presenters/presenters.test.tsx`
Expected: PASS (4 tests). If the ProductGrid link-role assertion fails, apply the anchor-aria-label variant described in Step 6 and re-run.

- [ ] **Step 9: Commit**

```bash
git add web/src/canvas/resultDeck/presenters/
git commit -m "feat(deck): weather/news/search/product presenters + styles"
```

---

## Task 4: ResultDeck host (overlays + pill tray + error boundary)

**Files:**
- Create: `web/src/canvas/resultDeck/ResultDeck.tsx`
- Test: `web/src/canvas/resultDeck/ResultDeck.test.tsx`

**Interfaces:**
- Consumes: `ResultItem` (Task 1), `OverlayFrame` (Task 2), the four presenters (Task 3).
- Produces: `ResultDeck({ items, onCollapse, onExpand, onDismiss }: { items: ResultItem[]; onCollapse(id): void; onExpand(id): void; onDismiss(id): void }): JSX.Element`. Renders each `overlay` item in an `OverlayFrame` (with the right presenter) and each `pill` item in the pill tray. A presenter throw is caught by a local error boundary showing `friendlyError('generic')`; the item stays dismissable.

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/canvas/resultDeck/ResultDeck.test.tsx
import { render, screen } from '@testing-library/react';
import { ResultDeck } from './ResultDeck';
import type { ResultItem } from './resultTypes';

vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ token: 't' }) }));

const wxItem: ResultItem = { id: 'r1', kind: 'weather', label: 'Weather · Chicago', icon: '☀️', state: 'overlay',
  payload: { place: 'Chicago', tempC: 26, feelsC: 30, condition: 'Clear sky', icon: '☀️', forecast: [] } };

it('renders an overlay for an overlay-state item', () => {
  render(<ResultDeck items={[wxItem]} onCollapse={() => {}} onExpand={() => {}} onDismiss={() => {}} />);
  expect(screen.getByTestId('result-overlay')).toBeInTheDocument();
  expect(screen.getByText('Chicago')).toBeInTheDocument();
});

it('renders a pill for a pill-state item and expands on click', () => {
  const onExpand = vi.fn();
  render(<ResultDeck items={[{ ...wxItem, state: 'pill' }]} onCollapse={() => {}} onExpand={onExpand} onDismiss={() => {}} />);
  const pill = screen.getByRole('button', { name: /Weather · Chicago/ });
  pill.click();
  expect(onExpand).toHaveBeenCalledWith('r1');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/canvas/resultDeck/ResultDeck.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement ResultDeck + a small error boundary**

```tsx
// web/src/canvas/resultDeck/ResultDeck.tsx
import { Component, type JSX, type ReactNode } from 'react';
import type { ResultItem } from './resultTypes';
import { OverlayFrame } from './OverlayFrame';
import { WeatherCard } from './presenters/WeatherCard';
import { NewsCard } from './presenters/NewsCard';
import { SearchCard } from './presenters/SearchCard';
import { ProductGrid } from './presenters/ProductGrid';
import { friendlyError } from '../../ui/friendlyError';
import './ResultDeck.css';

class PresenterBoundary extends Component<{ resetKey: string; children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.crashed) this.setState({ crashed: false }); }
  render() { return this.state.crashed ? <p className="deck-empty">{friendlyError('generic')}</p> : this.props.children; }
}

function presenterFor(item: ResultItem): JSX.Element {
  switch (item.kind) {
    case 'weather': return <WeatherCard payload={item.payload as never} />;
    case 'news': return <NewsCard payload={item.payload as never} />;
    case 'search': return <SearchCard payload={item.payload as never} />;
    case 'products': return <ProductGrid payload={item.payload as never} />;
  }
}

export interface ResultDeckProps {
  items: ResultItem[];
  onCollapse(id: string): void;
  onExpand(id: string): void;
  onDismiss(id: string): void;
}

export function ResultDeck({ items, onCollapse, onExpand, onDismiss }: ResultDeckProps): JSX.Element {
  const overlays = items.filter((i) => i.state === 'overlay');
  const pills = items.filter((i) => i.state === 'pill');
  return (
    <div className="result-deck" data-testid="result-deck">
      {overlays.map((item) => (
        <OverlayFrame key={item.id} label={item.label} icon={item.icon}
          onCollapse={() => onCollapse(item.id)} onDismiss={() => onDismiss(item.id)}>
          <PresenterBoundary resetKey={item.id}>{presenterFor(item)}</PresenterBoundary>
        </OverlayFrame>
      ))}
      {pills.length > 0 && (
        <div className="result-deck__pills">
          {pills.map((item) => (
            <button type="button" key={item.id} className="result-pill" onClick={() => onExpand(item.id)}>
              <span aria-hidden="true">{item.icon}</span> {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export default ResultDeck;
```

- [ ] **Step 4: Run to verify pass**

Run: `cd web && npx vitest run src/canvas/resultDeck/ResultDeck.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/canvas/resultDeck/ResultDeck.tsx web/src/canvas/resultDeck/ResultDeck.test.tsx
git commit -m "feat(deck): ResultDeck host — overlays + pill tray + presenter boundary"
```

---

## Task 5: Amazon scraper (parse + block detection) against fixtures

**Files:**
- Create: `server/src/products/amazonScraper.ts`, `server/src/products/amazonScraper.test.ts`, `server/src/products/fixtures/amazon-headsets.html`, `server/src/products/fixtures/amazon-blocked.html`
- Test: `server/src/products/amazonScraper.test.ts`

**Interfaces:**
- Produces:
  - `interface ScrapedProduct { title: string; price: string; image: string | null; rating: number | null; reviews: number | null; prime: boolean; url: string }`
  - `parseAmazonHtml(html: string): { blocked: boolean; products: ScrapedProduct[] }` — pure HTML→products parser (no network). Detects a robot/CAPTCHA page → `{ blocked: true, products: [] }`.
  - `scrapeAmazon(query: string, limit: number): Promise<{ blocked: boolean; products: ScrapedProduct[] }>` — Playwright-driven fetch that calls `parseAmazonHtml`. (Tested only indirectly; unit tests target `parseAmazonHtml` with fixtures.)

- [ ] **Step 1: Create fixtures**

Create `server/src/products/fixtures/amazon-headsets.html` — a MINIMAL but realistic Amazon search results fragment with 2 product tiles matching Amazon's structure the parser targets. Use this exact content so the parser + test agree:

```html
<div class="s-main-slot">
  <div data-component-type="s-search-result" data-asin="A1">
    <img class="s-image" src="https://m.media-amazon.com/img/A1.jpg" alt="Sony">
    <h2 aria-label="Sony WH-1000XM5 Wireless Headphones"><a class="a-link-normal" href="/dp/A1"><span>Sony WH-1000XM5 Wireless Headphones</span></a></h2>
    <span class="a-icon-alt">4.6 out of 5 stars</span>
    <span class="a-size-base s-underline-text">12,431</span>
    <span class="a-price"><span class="a-offscreen">$328.00</span></span>
    <i class="a-icon-prime" aria-label="Amazon Prime"></i>
  </div>
  <div data-component-type="s-search-result" data-asin="A2">
    <img class="s-image" src="https://m.media-amazon.com/img/A2.jpg" alt="Anker">
    <h2 aria-label="Anker Soundcore Space One"><a class="a-link-normal" href="/dp/A2"><span>Anker Soundcore Space One</span></a></h2>
    <span class="a-icon-alt">4.4 out of 5 stars</span>
    <span class="a-size-base s-underline-text">21,067</span>
    <span class="a-price"><span class="a-offscreen">$79.99</span></span>
  </div>
</div>
```

Create `server/src/products/fixtures/amazon-blocked.html`:

```html
<!doctype html><html><head><title>Robot Check</title></head>
<body><h4>Enter the characters you see below</h4>
<p>Sorry, we just need to make sure you're not a robot.</p>
<form action="/errors/validateCaptcha"></form></body></html>
```

- [ ] **Step 2: Write the failing test**

```ts
// server/src/products/amazonScraper.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseAmazonHtml } from './amazonScraper.js';

const dir = dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => readFileSync(join(dir, 'fixtures', n), 'utf8');

describe('parseAmazonHtml', () => {
  it('parses product tiles into structured products', () => {
    const { blocked, products } = parseAmazonHtml(fx('amazon-headsets.html'));
    expect(blocked).toBe(false);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      title: 'Sony WH-1000XM5 Wireless Headphones',
      price: '$328.00', rating: 4.6, reviews: 12431, prime: true,
      image: 'https://m.media-amazon.com/img/A1.jpg',
    });
    expect(products[0].url).toContain('/dp/A1');
    expect(products[1]).toMatchObject({ price: '$79.99', prime: false, rating: 4.4, reviews: 21067 });
  });

  it('detects a robot/CAPTCHA page as blocked', () => {
    const { blocked, products } = parseAmazonHtml(fx('amazon-blocked.html'));
    expect(blocked).toBe(true);
    expect(products).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd server && npx vitest run src/products/amazonScraper.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement the parser + scraper**

Use a lightweight regex/string parse (no new HTML-parser dependency — the server has none and we must not add one gratuitously). Absolute Amazon URLs are formed by prefixing `https://www.amazon.com`.

```ts
// server/src/products/amazonScraper.ts
import { chromium } from 'playwright';

export interface ScrapedProduct {
  title: string; price: string; image: string | null;
  rating: number | null; reviews: number | null; prime: boolean; url: string;
}

const BASE = 'https://www.amazon.com';

/** Pure HTML → products. Detects robot/CAPTCHA pages. No network. */
export function parseAmazonHtml(html: string): { blocked: boolean; products: ScrapedProduct[] } {
  if (/validateCaptcha|not a robot|Robot Check|Enter the characters you see/i.test(html)) {
    return { blocked: true, products: [] };
  }
  const products: ScrapedProduct[] = [];
  // Split on search-result tiles.
  const tiles = html.split(/data-component-type="s-search-result"/).slice(1);
  for (const tile of tiles) {
    const title = match(tile, /aria-label="([^"]+)"/) ?? match(tile, /<span>([^<]{6,})<\/span>/);
    const href = match(tile, /class="a-link-normal"[^>]*href="([^"]+)"/) ?? match(tile, /href="(\/dp\/[^"]+)"/);
    const price = match(tile, /class="a-offscreen">([^<]+)</);
    const image = match(tile, /class="s-image"[^>]*src="([^"]+)"/);
    const ratingRaw = match(tile, /class="a-icon-alt">([\d.]+) out of/);
    const reviewsRaw = match(tile, /s-underline-text">([\d,]+)</);
    const prime = /a-icon-prime/.test(tile);
    if (!title || !href || !price) continue; // require the essentials — no fabricated cards
    products.push({
      title: decode(title), price: decode(price),
      image: image ?? null,
      rating: ratingRaw ? Number(ratingRaw) : null,
      reviews: reviewsRaw ? Number(reviewsRaw.replace(/,/g, '')) : null,
      prime,
      url: href.startsWith('http') ? href : BASE + href,
    });
  }
  return { blocked: false, products };
}

function match(s: string, re: RegExp): string | null { const m = s.match(re); return m ? m[1] : null; }
function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

/** Fetch Amazon search via a headless browser, then parse. Caller wraps in a timeout. */
export async function scrapeAmazon(query: string, limit: number): Promise<{ blocked: boolean; products: ScrapedProduct[] }> {
  const url = `${BASE}/s?k=${encodeURIComponent(query)}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      locale: 'en-US',
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const html = await page.content();
    const { blocked, products } = parseAmazonHtml(html);
    return { blocked, products: products.slice(0, limit) };
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd server && npx vitest run src/products/amazonScraper.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/products/amazonScraper.ts server/src/products/amazonScraper.test.ts server/src/products/fixtures/
git commit -m "feat(products): Amazon scraper — parse tiles + block detection (fixtures)"
```

---

## Task 6: productSearch provider — timeout, cache, fallback signal

**Files:**
- Create: `server/src/products/productSearch.ts`, `server/src/products/productSearch.test.ts`
- Test: `server/src/products/productSearch.test.ts`

**Interfaces:**
- Consumes: `scrapeAmazon` (Task 5).
- Produces:
  - `interface ProductSearchResult { blocked: boolean; products: ScrapedProduct[] }`
  - `type ProductSearchProvider = (query: string, limit: number) => Promise<ProductSearchResult>`
  - `searchProducts(query: string, opts?: { limit?: number; timeoutMs?: number; provider?: ProductSearchProvider }): Promise<ProductSearchResult>` — runs the provider under a timeout (default 16000ms), returns `{ blocked: true, products: [] }` on timeout OR provider throw, caches successful non-empty results per normalized query for 60s. `provider` defaults to `scrapeAmazon` (injectable for tests).

- [ ] **Step 1: Write the failing test**

```ts
// server/src/products/productSearch.test.ts
import { describe, it, expect, vi } from 'vitest';
import { searchProducts } from './productSearch.js';

const P = (title: string) => ({ title, price: '$1', image: null, rating: null, reviews: null, prime: false, url: 'u' });

describe('searchProducts', () => {
  it('returns provider results and caches them per query', async () => {
    const provider = vi.fn().mockResolvedValue({ blocked: false, products: [P('a')] });
    const r1 = await searchProducts('Headset ', { provider, limit: 5 });
    const r2 = await searchProducts('headset', { provider, limit: 5 }); // normalized → cache hit
    expect(r1.products).toHaveLength(1);
    expect(r2.products).toHaveLength(1);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('falls back to blocked on provider throw', async () => {
    const provider = vi.fn().mockRejectedValue(new Error('boom'));
    const r = await searchProducts('xyz-throw', { provider });
    expect(r).toEqual({ blocked: true, products: [] });
  });

  it('falls back to blocked on timeout', async () => {
    const provider = vi.fn(() => new Promise<never>(() => { /* never resolves */ }));
    const r = await searchProducts('xyz-timeout', { provider, timeoutMs: 20 });
    expect(r).toEqual({ blocked: true, products: [] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run src/products/productSearch.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// server/src/products/productSearch.ts
import { scrapeAmazon, type ScrapedProduct } from './amazonScraper.js';

export interface ProductSearchResult { blocked: boolean; products: ScrapedProduct[]; }
export type ProductSearchProvider = (query: string, limit: number) => Promise<ProductSearchResult>;

interface SearchOpts { limit?: number; timeoutMs?: number; provider?: ProductSearchProvider; }

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; result: ProductSearchResult }>();
const norm = (q: string) => q.trim().toLowerCase();

const FALLBACK: ProductSearchResult = { blocked: true, products: [] };

export async function searchProducts(query: string, opts: SearchOpts = {}): Promise<ProductSearchResult> {
  const limit = opts.limit ?? 5;
  const timeoutMs = opts.timeoutMs ?? 16_000;
  const provider = opts.provider ?? scrapeAmazon;
  const key = norm(query);

  // Note: no Date.now() ban here — this is server code (unlike workflow scripts).
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ProductSearchResult>((resolve) => { timer = setTimeout(() => resolve(FALLBACK), timeoutMs); });
  try {
    const result = await Promise.race([provider(key, limit), timeout]);
    if (!result.blocked && result.products.length) cache.set(key, { at: Date.now(), result });
    return result;
  } catch {
    return FALLBACK;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd server && npx vitest run src/products/productSearch.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/products/productSearch.ts server/src/products/productSearch.test.ts
git commit -m "feat(products): searchProducts — timeout + 60s cache + blocked fallback"
```

---

## Task 7: Result tool declarations (web_search + search_products)

**Files:**
- Create: `server/src/gemini/resultTools.ts`
- Test: `server/src/gemini/resultTools.test.ts`

**Interfaces:**
- Produces:
  - `RESULT_TOOL_NAMES: Set<string>` = `{ 'web_search', 'search_products' }`
  - `RESULT_TOOL_DECLS: ToolDecl[]` — two declarations. `web_search({ query: string(req), presentation?: 'news'|'links' })`; `search_products({ query: string(req), limit?: number })`. (Reuse the same `ToolDecl`/`ToolParams` shape as `uiControlTools.ts`.)

- [ ] **Step 1: Write the failing test**

```ts
// server/src/gemini/resultTools.test.ts
import { describe, it, expect } from 'vitest';
import { RESULT_TOOL_NAMES, RESULT_TOOL_DECLS } from './resultTools.js';

describe('result tools', () => {
  it('exposes exactly web_search and search_products', () => {
    expect([...RESULT_TOOL_NAMES].sort()).toEqual(['search_products', 'web_search']);
  });
  it('search_products requires query, web_search requires query', () => {
    const byName = Object.fromEntries(RESULT_TOOL_DECLS.map((d) => [d.name, d]));
    expect(byName.search_products.parameters.required).toContain('query');
    expect(byName.web_search.parameters.required).toContain('query');
    expect(byName.web_search.parameters.properties.presentation.enum).toEqual(['news', 'links']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run src/gemini/resultTools.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// server/src/gemini/resultTools.ts
interface ToolParams {
  type: 'object';
  properties: Record<string, { type: string; description?: string; enum?: string[] }>;
  required: string[];
}
interface ToolDecl { name: string; description: string; parameters: ToolParams; }

export const RESULT_TOOL_NAMES = new Set(['web_search', 'search_products']);

export const RESULT_TOOL_DECLS: ToolDecl[] = [
  {
    name: 'web_search',
    description:
      'Search the web and SHOW the result on the user\'s canvas as a rich card (news headlines or link cards). ' +
      'Use for news, current events, and "show me / pull up / find links about X". Set presentation to "news" for ' +
      'headline-style results, "links" for general result cards. Then speak a short summary; never read the card aloud.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for.' },
        presentation: { type: 'string', enum: ['news', 'links'], description: 'How to show it.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_products',
    description:
      'Search Amazon for real products and SHOW them on the user\'s canvas as product cards (image, price, rating, ' +
      'buy link). Use for "find me / show me / search for <product>". Speak 2-3 highlights; never invent products, ' +
      'prices, or ratings — only what the tool returns. If it comes back empty, say so and offer to try again.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The product to search for, e.g. "wireless headphones".' },
        limit: { type: 'number', description: 'Max products (default 5).' },
      },
      required: ['query'],
    },
  },
];
```

- [ ] **Step 4: Run to verify pass**

Run: `cd server && npx vitest run src/gemini/resultTools.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/gemini/resultTools.ts server/src/gemini/resultTools.test.ts
git commit -m "feat(server): web_search + search_products tool declarations"
```

---

## Task 8: Relay dispatch for result tools + tool-result `data` payload

**Files:**
- Modify: `server/src/gemini/relay.ts` (register the decls where UI/other tool decls are combined; add a dispatch branch; extend the `tool-result` client message with `data`)
- Test: `server/src/gemini/relay.test.ts` (add a case)

**Interfaces:**
- Consumes: `RESULT_TOOL_NAMES`, `RESULT_TOOL_DECLS` (Task 7), `searchProducts` (Task 6).
- Produces: when Nicole calls `search_products`, the relay runs `searchProducts(query, {limit})`, acks Gemini with a short spoken summary, and sends the browser a `tool-result` message: `{ type:'tool-result', name:'search_products', ok:true, summary, data: { kind:'products', payload:{ query, products } } }`. For `web_search`, it sends `{ ...name:'web_search', ok:true, summary, data: { kind: presentation==='news'?'news':'search', payload } }` where payload is derived from the grounded result (see note). `data` is optional on the message; existing integration tool-results omit it.

**Note on `web_search` data source:** The existing code already captures grounding chunks CLIENT-side (`useNicoleSession.ts` ~line 563) into `searchLinks`. To keep `web_search` honest and simple, the relay's `web_search` handler does NOT itself fetch — it returns `{ ok:true, summary, data:{ kind, payload:{ items:[] | results:[] } } }` as a SIGNAL with the chosen `presentation`, and the CLIENT fills the payload from the grounding chunks it already receives for that turn (Task 9 wires this: on a `web_search` tool-result, the client reads the latest captured `searchLinks` and pushes a `news`/`search` deck item). This avoids a second search and reuses the working grounding path. `search_products` DOES carry real `data.payload.products` from the server scraper.

- [ ] **Step 1: Add a failing test** (search_products path emits a data-carrying tool-result)

FIRST read `server/src/gemini/relay.test.ts` in full to learn its existing harness: how it constructs the relay/tool-call handler, how it fakes a Gemini tool-call, and how it captures `client.send(...)` messages (there is already at least one integration `tool-result` assertion — find it and copy its exact setup). THEN, using that same harness verbatim, add a test that:
- injects/stubs `searchProducts` so it resolves `{ blocked: false, products: [{ title: 'Sony XM5', price: '$328.00', image: null, rating: 4.6, reviews: 12, prime: true, url: 'https://a.com/1' }] }` (use whatever injection seam the relay exposes; if `searchProducts` is imported directly and not injectable, add a minimal injection seam in Task 8 Step 3 — e.g. an optional dependency on `this.deps` — rather than mocking the module, and note it in the report),
- drives the tool-call handler with a `search_products` call (`args: { query: 'headset' }`),
- asserts the captured browser `tool-result` message has `name === 'search_products'`, `ok === true`, and `data.kind === 'products'` with `data.payload.products[0].title === 'Sony XM5'`.

Do NOT invent a harness — if the existing test file's structure doesn't support stubbing cleanly, prefer adding a small injection seam in the relay (Task 8 Step 3) over fabricating test scaffolding. Write the assertions as real code once you've read the file.

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run src/gemini/relay.test.ts`
Expected: FAIL on the new assertion.

- [ ] **Step 3: Implement the relay changes**

1. Where UI control tool declarations are added to the Gemini `tools` config, also spread in `RESULT_TOOL_DECLS`. Import `RESULT_TOOL_NAMES`, `RESULT_TOOL_DECLS` from `./resultTools.js` and `searchProducts` from `../products/productSearch.js`.

2. In the tool-call handler (the block that currently has `if (UI control) … else if (isIntegrationTool(name)) …`), add BEFORE the integration branch:

```ts
else if (RESULT_TOOL_NAMES.has(name)) {
  if ((this.sessionConfig?.mode ?? 'talk') !== 'talk') {
    responses.push({ id: call?.id, name, response: { result: 'error', summary: 'Not available during a practice session.' } });
    continue;
  }
  if (name === 'search_products') {
    const query = typeof args.query === 'string' ? args.query : '';
    const limit = typeof args.limit === 'number' ? Math.min(8, Math.max(1, args.limit)) : 5;
    const { blocked, products } = await searchProducts(query, { limit });
    const summary = blocked
      ? `I couldn't load products just now — try again?`
      : products.length ? `Found ${products.length} on your screen.` : `No products found — want me to try again?`;
    responses.push({ id: call?.id, name, response: { result: 'ok', summary } });
    if (this.deps.client.isOpen()) {
      this.deps.client.send({
        type: 'tool-result', name, ok: !blocked && products.length > 0, summary,
        data: blocked ? undefined : { kind: 'products', payload: { query, products } },
      });
    }
  } else { // web_search
    const presentation = args.presentation === 'news' ? 'news' : 'links';
    const summary = `Here's what I found — it's on your screen.`;
    responses.push({ id: call?.id, name, response: { result: 'ok', summary } });
    if (this.deps.client.isOpen()) {
      this.deps.client.send({ type: 'tool-result', name, ok: true, summary, data: { kind: presentation, payload: {} } });
    }
  }
}
```

3. The integration-tool `tool-result` send stays as-is (no `data`). `data` is an optional field on the message.

- [ ] **Step 4: Run to verify pass**

Run: `cd server && npx vitest run src/gemini/relay.test.ts`
Expected: PASS (all, including the new case).

- [ ] **Step 5: Commit**

```bash
git add server/src/gemini/relay.ts server/src/gemini/relay.test.ts
git commit -m "feat(server): dispatch web_search/search_products + tool-result data payload"
```

---

## Task 9: Client session forwards `data`; TalkScreen drives the deck

**Files:**
- Modify: `web/src/engine/useNicoleSession.ts` (add `data?` to the tool-result type, `RelayMessage`, and the tool-result handler → `onToolResult`)
- Modify: `web/src/screens/TalkScreen.tsx` (instantiate `useResultDeck`; render `<ResultDeck>` in the canvas center on workspace; reroute `get_weather` into the deck; on `web_search`/`search_products` tool-results push deck items; remove the old `search_results`/`weather` canvas panel usage)
- Test: `web/src/screens/TalkScreen.test.tsx` (add: a product tool-result renders a product overlay)

**Interfaces:**
- Consumes: `useResultDeck`, `ResultDeck` (Tasks 1/4); the tool-result `data` shape from Task 8: `data?: { kind: 'weather'|'news'|'search'|'products'; payload: unknown }`.
- Produces: TalkScreen renders the deck in the workspace canvas center; results appear as overlays→pills.

- [ ] **Step 1: Write the failing test** (product tool-result → product overlay on desktop)

Add to `web/src/screens/TalkScreen.test.tsx` (which already mocks `useNicoleSession` and captures `onToolResult`; mirror the existing "connect panel on needsConnect" test):

```tsx
it('DESKTOP shows a product overlay when a tool-result carries product data', async () => {
  mockWidth = 1280; // desktop workspace
  render(<TalkScreen {...baseProps} />);
  act(() => {
    capturedOnToolResult({
      name: 'search_products', ok: true, summary: 'Found 1 on your screen.',
      data: { kind: 'products', payload: { query: 'headset', products: [
        { title: 'Sony XM5', price: '$328.00', image: null, rating: 4.6, reviews: 12, prime: true, url: 'https://a.com/1' }] } },
    });
  });
  expect(await screen.findByText('Sony XM5')).toBeInTheDocument();
});
```

(Use the same `capturedOnToolResult`/width-mock mechanism the file already has from the previous feature. If the deck is mocked in other tests, ensure this test uses the real ResultDeck or a mock that renders the product title.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/screens/TalkScreen.test.tsx`
Expected: FAIL (no product text; deck not wired).

- [ ] **Step 3: Extend `useNicoleSession.ts`**

- Add `data?: { kind: string; payload: unknown }` to the `onToolResult` param type (the object passed to `onToolResult`), to the `RelayMessage` `tool-result` variant, and forward it in the tool-result handler:
  `onToolResultRef.current?.({ name: msg.name, ok: !!msg.ok, summary: msg.summary ?? '', needsConnect: msg.needsConnect, data: msg.data });`
  (Mirror exactly how `needsConnect` was threaded through these three spots.)

- [ ] **Step 4: Wire TalkScreen**

1. `const deck = useResultDeck();` placed with the other hooks (top level, unconditional), after `useCanvas` is fine.
2. In `handleToolResult`, after the existing toast/needsConnect logic, add:

```ts
if (r.data && isWorkspaceRef.current) {
  const d = r.data as { kind: 'weather'|'news'|'search'|'products'; payload: any };
  if (d.kind === 'products') {
    const query = d.payload?.query ?? '';
    deck.push('products', { query, products: d.payload?.products ?? [] }, { label: `${query || 'Products'}`, icon: '🛒' });
  } else if (d.kind === 'news') {
    // Fill from the grounding links captured this turn (see Task 8 note).
    const items = searchLinks.map((l) => ({ title: l.title, url: l.url, source: hostOf(l.url) }));
    if (items.length) deck.push('news', { items }, { label: 'Top news', icon: '📰' });
  } else if (d.kind === 'search') {
    if (searchLinks.length) deck.push('search', { results: searchLinks }, { label: 'Results', icon: '🔎' });
  }
}
```
   Add a small `hostOf(url)` helper (copy the one in LinkCards) or import it. `deck` must be in `handleToolResult`'s dependency array.
3. Reroute `get_weather`: in the `if (workspace)` branch, replace `canvas.open('weather', {...})` with:
   `deck.push('weather', { place: w.place, tempC: w.tempC, feelsC: w.feelsC, condition: w.condition, icon: w.icon, forecast: w.forecast }, { label: `Weather · ${w.place}`, icon: w.icon || '☀️' });`
4. Remove the `useEffect` that does `canvas.open('search_results', { links: searchLinks })` (the deck now owns search results via web_search; passive grounding still populates the mobile `.talk-links` LinkCards which stay).
5. In the desktop workspace center (where `<CanvasHost>` renders the idle HomePanel / canvas), render the deck ABOVE/around the canvas idle content:
   `<ResultDeck items={deck.items} onCollapse={deck.collapse} onExpand={deck.expand} onDismiss={deck.dismiss} />`
   Place it so overlays sit in the canvas center column. When `deck.items` is empty it renders an empty container (harmless); keep the existing idle HomePanel as the canvas default beneath/beside it.
6. Remove `'weather'` and `'search_results'` from the canvas `PanelType` usage in this screen (they're deck-driven now). (The registry/type cleanup is Task 10.)

- [ ] **Step 5: Run to verify pass**

Run: `cd web && npx vitest run src/screens/TalkScreen.test.tsx`
Expected: PASS (all, including the new product-overlay test).

- [ ] **Step 6: Commit**

```bash
git add web/src/engine/useNicoleSession.ts web/src/engine/useNicoleSession.test.ts web/src/screens/TalkScreen.tsx web/src/screens/TalkScreen.test.tsx
git commit -m "feat(talk): drive result deck from tool-results; reroute weather into deck"
```

---

## Task 10: Retire the old weather/search_results canvas panels + register result tool names client-side

**Files:**
- Modify: `web/src/canvas/canvasTypes.ts` (drop `'weather'` and `'search_results'` from `PanelType`)
- Modify: `web/src/canvas/panels/registry.ts` (remove `weather` + `search_results` entries)
- Delete: `web/src/canvas/panels/WeatherPanel.tsx`, `web/src/canvas/panels/SearchResultsPanel.tsx` (and their references/tests)
- Modify: `web/src/canvas/panels/registry.test.tsx` (registry now has `connect`, `note`, `integrations` only)
- Modify: `server/src/gemini/uiControlTools.ts` (drop `weather`, `search_results` from `open_panel`'s `type` enum; its enum becomes `['connect','note','integrations']`)
- Modify: `server/src/gemini/uiControlTools.test.ts` (update the enum assertion)

**Interfaces:**
- Consumes: nothing new.
- Produces: `PanelType = 'connect' | 'note' | 'integrations'`. `open_panel.type` enum = `['connect','note','integrations']`.

- [ ] **Step 1: Update the failing tests first**

Update `registry.test.tsx` to expect `['connect','integrations','note']` and remove the `search_results`/`weather` panel tests. Update `uiControlTools.test.ts` enum assertion to `['connect','integrations','note']` (sorted or in declared order — match the file's existing assertion style).

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run src/canvas/panels/registry.test.tsx` and `cd server && npx vitest run src/gemini/uiControlTools.test.ts`
Expected: FAIL (old entries still present).

- [ ] **Step 3: Make the changes**

- `canvasTypes.ts`: `export type PanelType = 'connect' | 'note' | 'integrations';`
- `registry.ts`: remove the `weather` and `search_results` imports + entries; keep `connect`, `note`, `integrations`.
- Delete `WeatherPanel.tsx`, `SearchResultsPanel.tsx`. Grep for any remaining imports (`rg "WeatherPanel|SearchResultsPanel|'weather'|'search_results'" web/src`) and remove/adjust (e.g. any leftover panels.css rules, the registry's rendered tests).
- `uiControlTools.ts`: in the `open_panel` decl, set `type.enum = ['connect', 'note', 'integrations']` and update its description to drop weather/search.

- [ ] **Step 4: Run to verify pass + full web/server type-check**

Run: `cd web && npx vitest run src/canvas/ && npx tsc --noEmit` (ignore aria false-positives) and `cd server && npx vitest run src/gemini/ && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/canvas/canvasTypes.ts web/src/canvas/panels/registry.ts web/src/canvas/panels/registry.test.tsx server/src/gemini/uiControlTools.ts server/src/gemini/uiControlTools.test.ts
git rm web/src/canvas/panels/WeatherPanel.tsx web/src/canvas/panels/SearchResultsPanel.tsx
git commit -m "refactor(canvas): retire weather/search_results panels — deck owns them now"
```

---

## Task 11: Anti-hallucination prompt rules + result-tool guidance

**Files:**
- Modify: `server/src/prompt/nicolePrompt.ts` (add rules; NO stray backticks — it's a template literal)
- Test: `server/src/prompt/nicolePrompt.test.ts` if one exists (assert the new phrases are present); otherwise add a tiny test file asserting the prompt string contains the key rule phrases.

**Interfaces:** none (prompt content only).

- [ ] **Step 1: Write the failing test**

```ts
// server/src/prompt/nicolePrompt.test.ts  (create if missing; otherwise append)
import { describe, it, expect } from 'vitest';
import { buildNicolePrompt } from './nicolePrompt.js'; // use the actual export name; if it's a const string, import that

describe('nicolePrompt anti-hallucination', () => {
  it('contains the screen-share and no-fabrication rules', () => {
    const p = typeof buildNicolePrompt === 'function' ? buildNicolePrompt({} as never) : String(buildNicolePrompt);
    expect(p).toMatch(/only what you can (actually )?see/i);
    expect(p).toMatch(/can't read that clearly/i);
    expect(p).toMatch(/never (invent|make up|add) (products|prices|headlines|data)/i);
    expect(p).toMatch(/search_products|web_search/);
  });
});
```

(First open `nicolePrompt.ts` to learn the real export — a function or a const — and adjust the import/first line accordingly.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run src/prompt/nicolePrompt.test.ts`
Expected: FAIL (phrases absent).

- [ ] **Step 3: Add the rules** (insert as new bullet lines within the existing template literal — use `-` bullets consistent with the file; DO NOT add backticks)

Add an anti-hallucination block near the vision/search sections:

```
## STAY TRUTHFUL — NEVER MAKE THINGS UP
- When you describe something on the user's screen or camera, say ONLY what you can actually see. If text is small or blurry, say "I can't read that clearly — can you zoom in?" Never invent labels, numbers, names, or data that aren't visible.
- If you are not certain of a fact, use web_search first — don't guess. When you're unsure, say so plainly ("it looks like about $40, but I can't read it exactly").
- Report ONLY what a tool actually returned. Never add products, prices, ratings, or headlines that weren't in the result.

## SHOWING RESULTS ON THE CANVAS
- To show products, call search_products({ query }) — real Amazon results appear on their screen as cards. Speak 2-3 highlights; never read the cards aloud, and never invent a product or price. If it returns nothing, say so and offer to try again.
- To show news or web results, call web_search({ query, presentation }) — use "news" for headlines, "links" otherwise. Say one short line that it's on their screen; never read the whole card list aloud.
- Only these tools put results on screen. Do NOT claim something is "on your screen" unless you called the matching tool and it returned results.
```

- [ ] **Step 4: Run to verify pass + server build (catches any backtick breakage)**

Run: `cd server && npx vitest run src/prompt/nicolePrompt.test.ts && npx tsc --noEmit && npm run build`
Expected: PASS + clean build.

- [ ] **Step 5: Commit**

```bash
git add server/src/prompt/nicolePrompt.ts server/src/prompt/nicolePrompt.test.ts
git commit -m "feat(prompt): anti-hallucination rules + canvas result-tool guidance"
```

---

## Task 12: Full gate + visual verification

**Files:** none (verification only).

- [ ] **Step 1: Full gate**

Run: `cd web && npx tsc --noEmit && npx vitest run && npm run build` (ignore aria false-positives) and `cd server && npx tsc --noEmit && npx vitest run && npm run build`.
Expected: all green on both.

- [ ] **Step 2: Visual verification (Playwright vs the live dev app)**

With the dev app running (Vite on its configured port + relay on :4000; a throwaway onboarded account token in localStorage), at desktop width (1280): trigger a `search_products` and a `web_search` tool-result path (or mount `ResultDeck` with sample items via a temporary harness like the last feature's) and screenshot:
- a product overlay (real card grid), then its collapsed "🛒 …" pill,
- a news overlay (headline list) → pill,
- the weather overlay (glass card) → pill.
Confirm glassmorphism + the shrinking timer + collapse-to-pill + tap-to-expand. Remove any temp harness files (never commit them).
Also confirm mobile (≤640) shows the overlay as a full-width card and the mobile Talk layout is otherwise unchanged.

- [ ] **Step 3: Commit any visual tweaks** (only if screenshots reveal a fix; `git add` only changed files — never `-A`).

---

## Notes for the executor

- Scraper reality: Amazon frequently blocks headless browsers. The design's value is the **graceful fallback** (blocked → speak + a web-search pill, never a broken/fake panel) and the swappable `ProductSearchProvider`. Do not over-invest in beating Amazon's bot defenses in this plan — land the pipeline + fallback correctly.
- The `web_search` payload is filled CLIENT-side from the already-captured grounding chunks (Task 8 note + Task 9 step 4). If grounding returns nothing that turn, no deck item is pushed and Nicole (per prompt) says what she found — no empty overlay.
- Keep every commit to only its task's files. Never `git add -A`.
