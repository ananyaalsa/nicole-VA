import type { JSX } from 'react';

/**
 * Lightweight inline-SVG charts for the results report — no charting dependency.
 * Two pieces: a per-dimension score-bar list, and a score-over-time sparkline.
 */

export interface DimBar {
  label: string;
  /** 0..max. */
  score: number;
  max?: number;
  band?: string;
}

/** Horizontal bars, one per framework move/dimension, score out of `max` (3). */
export function DimensionBars({ items }: { items: DimBar[] }): JSX.Element {
  return (
    <ul className="dimbars" data-testid="dimension-bars">
      {items.map((d, i) => {
        const max = d.max ?? 3;
        const pct = Math.max(0, Math.min(100, (d.score / max) * 100));
        return (
          <li key={i} className={`dimbar dimbar--${d.band ?? 'none'}`}>
            <span className="dimbar__label">{d.label}</span>
            <span className="dimbar__track" aria-hidden="true">
              <span className="dimbar__fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="dimbar__val">{d.score}/{max}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A score-over-time sparkline (0–10). `points` is oldest→newest; the last point
 * is the current run and is highlighted. Renders nothing meaningful with <2 points
 * (shows a single dot) — the caller decides whether to show it.
 */
export function ScoreTrend({ points }: { points: number[] }): JSX.Element {
  const W = 240;
  const H = 72;
  const pad = 8;
  const max = 10;
  const n = points.length;
  const xs = (i: number) => (n <= 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1));
  const ys = (v: number) => H - pad - (Math.max(0, Math.min(max, v)) / max) * (H - 2 * pad);
  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`).join(' ');
  const last = n > 0 ? points[n - 1] : null;

  return (
    <svg className="score-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Score over your recent sessions" data-testid="score-trend">
      {/* baseline + mid gridlines */}
      <line x1={pad} y1={ys(0)} x2={W - pad} y2={ys(0)} className="trend-grid" />
      <line x1={pad} y1={ys(5)} x2={W - pad} y2={ys(5)} className="trend-grid trend-grid--mid" />
      {n >= 2 && <path d={path} className="trend-line" fill="none" />}
      {points.map((v, i) => (
        <circle key={i} cx={xs(i)} cy={ys(v)} r={i === n - 1 ? 4 : 2.5} className={`trend-dot${i === n - 1 ? ' trend-dot--last' : ''}`} />
      ))}
      {last != null && (
        <text x={n <= 1 ? W / 2 : W - pad} y={ys(last) - 8} className="trend-label" textAnchor={n <= 1 ? 'middle' : 'end'}>
          {last.toFixed(1)}
        </text>
      )}
    </svg>
  );
}
