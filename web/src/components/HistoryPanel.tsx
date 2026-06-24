import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { fetchHistory, type TrainingRun } from '../training/trainingApi';
import './HistoryPanel.css';

export interface HistoryPanelProps {
  /** Close the history overlay. */
  onClose?: () => void;
}

/** A scorecard row as persisted by a run (best-effort shape). */
interface ScorecardRow {
  dimension?: string;
  hit?: boolean;
  tip?: string;
}

/** Pull the scorecard rows out of a run's loosely-typed `scorecard` field. */
function readScorecard(card: unknown): ScorecardRow[] {
  if (!Array.isArray(card)) return [];
  return card.filter((r): r is ScorecardRow => typeof r === 'object' && r !== null);
}

/** Format an ISO timestamp simply (locale date + short time). */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * History / Artifacts panel.
 *
 * Lists every past run (roleplay + training), newest first, with its title,
 * engagement/score, date, and a compact scorecard summary. Rendered as an
 * overlay on top of whatever screen is active.
 */
export function HistoryPanel({ onClose }: HistoryPanelProps): JSX.Element {
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchHistory()
      .then((r) => {
        if (!alive) return;
        setRuns(r);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Failed to load history');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="history" data-testid="history-panel" role="dialog" aria-label="Session history">
      <div className="history__scrim" data-testid="history-scrim" onClick={onClose} aria-hidden="true" />
      <section className="history__sheet hud-panel">
        <header className="history__head">
          <div className="history__head-left">
            <span className="brand-mark" aria-hidden="true" />
            <div>
              <span className="hud-label">Artifacts&nbsp;·&nbsp;History</span>
              <h2 className="history__title">Past sessions</h2>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              className="history__close"
              data-testid="history-close-button"
              onClick={onClose}
              aria-label="Close history"
            >
              ✕
            </button>
          )}
        </header>

        <div className="history__body">
          {loading && (
            <p className="history__status hud-label" data-testid="history-loading">
              Loading…
            </p>
          )}
          {error && (
            <p className="history__status history__status--bad" data-testid="history-error">
              {error}
            </p>
          )}
          {!loading && !error && runs.length === 0 && (
            <p className="history__empty" data-testid="history-empty">
              No sessions yet — finish a roleplay or training to see it here.
            </p>
          )}

          {!loading && runs.length > 0 && (
            <ul className="history__list" data-testid="history-list">
              {runs.map((run) => {
                const rows = readScorecard(run.scorecard);
                const hits = rows.filter((r) => r.hit).length;
                return (
                  <li
                    key={run.id}
                    className="history__row"
                    data-testid="history-row"
                    data-kind={run.kind}
                  >
                    <div className="history__row-head">
                      <span className={`history__kind history__kind--${run.kind}`}>
                        {run.kind === 'roleplay' ? 'Roleplay' : 'Training'}
                      </span>
                      <span className="history__row-title">{run.title}</span>
                      {run.score != null && (
                        <span className="history__score" data-testid="history-score">
                          {run.score.toFixed(1)}
                          <span className="history__score-max"> / 10</span>
                        </span>
                      )}
                    </div>
                    <div className="history__row-meta">
                      <span className="hud-label">{formatDate(run.createdAt)}</span>
                      {rows.length > 0 && (
                        <span className="hud-label history__row-summary" data-testid="history-summary">
                          {hits}/{rows.length} dimensions hit
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export default HistoryPanel;
