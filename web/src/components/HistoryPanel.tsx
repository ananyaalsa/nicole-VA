import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { fetchHistory, type TrainingRun } from '../training/trainingApi';
import { useAuth } from '../auth/AuthContext';
import './HistoryPanel.css';

export interface HistoryPanelProps {
  /** Close the history overlay. */
  onClose?: () => void;
}

/** A scorecard row as persisted by a run. Older runs used {dimension,hit,tip};
 *  judge-scored runs persist the richer {label,score,band,rationale,evidenceQuote}.
 *  We read both shapes so any saved report can be reopened. */
interface ScorecardRow {
  dimension?: string;
  label?: string;
  hit?: boolean;
  score?: number;
  band?: string;
  rationale?: string;
  tip?: string;
  evidenceQuote?: string | null;
}

/** Pull the scorecard rows out of a run's loosely-typed `scorecard` field. */
function readScorecard(card: unknown): ScorecardRow[] {
  if (!Array.isArray(card)) return [];
  return card.filter((r): r is ScorecardRow => typeof r === 'object' && r !== null);
}

/** A parsed transcript line for the reopened report's dual-lane view. */
function parseTranscript(text: string | null): { speaker: 'you' | 'rep'; text: string }[] {
  if (!text) return [];
  return text.split('\n').filter(Boolean).map((line) => {
    const m = line.match(/^([^:]+):\s*(.*)$/);
    const who = m?.[1]?.trim().toLowerCase();
    const speaker = who === 'you' ? 'you' : 'rep';
    return { speaker, text: m ? m[2] : line } as { speaker: 'you' | 'rep'; text: string };
  });
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
  const { token } = useAuth();
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The run whose full report is open (null = the list). Reopens a past report.
  const [selected, setSelected] = useState<TrainingRun | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchHistory(token)
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
  }, [token]);

  return (
    <div className="history" data-testid="history-panel" role="dialog" aria-label="Session history">
      <div className="history__scrim" data-testid="history-scrim" onClick={onClose} aria-hidden="true" />
      <section className="history__sheet hud-panel">
        <header className="history__head">
          <div className="history__head-left">
            {selected ? (
              <button type="button" className="history__back" data-testid="history-back" onClick={() => setSelected(null)} aria-label="Back to all sessions">←</button>
            ) : (
              <span className="brand-mark" aria-hidden="true" />
            )}
            <div>
              <span className="hud-label">Artifacts&nbsp;·&nbsp;History</span>
              <h2 className="history__title">{selected ? 'Report' : 'Past sessions'}</h2>
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

        {selected ? (
          <ReportDetail run={selected} />
        ) : (
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
              No sessions yet. Finish a roleplay or training to see it here.
            </p>
          )}

          {!loading && runs.length > 0 && (
            <ul className="history__list" data-testid="history-list">
              {runs.map((run) => {
                const rows = readScorecard(run.scorecard);
                const hits = rows.filter((r) => r.hit).length;
                return (
                  <li key={run.id} data-kind={run.kind}>
                    <button
                      type="button"
                      className="history__row history__row--button"
                      data-testid="history-row"
                      onClick={() => setSelected(run)}
                      aria-label={`Open report: ${run.title}`}
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
                            {hits > 0 ? `${hits}/${rows.length} hit` : `${rows.length} moves scored`}
                          </span>
                        )}
                        <span className="history__row-open" aria-hidden="true">View report →</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        )}
      </section>
    </div>
  );
}

/** The reopened report for a past run: score, per-dimension breakdown, and the
 *  saved conversation in dual lanes. Renders from whatever was persisted. */
function ReportDetail({ run }: { run: TrainingRun }): JSX.Element {
  const rows = readScorecard(run.scorecard);
  const lines = parseTranscript(run.transcript);
  const repName = run.kind === 'roleplay' ? (run.title.split('·')[0]?.trim() || 'Rep') : 'Rep';
  return (
    <div className="history__body" data-testid="history-report">
      <div className="report-detail">
        <div className="report-detail__head">
          <span className={`history__kind history__kind--${run.kind}`}>{run.kind === 'roleplay' ? 'Roleplay' : 'Training'}</span>
          <span className="report-detail__title">{run.title}</span>
          <span className="hud-label">{formatDate(run.createdAt)}</span>
        </div>
        {run.score != null && (
          <div className="report-detail__score">
            <span className="report-detail__score-value">{run.score.toFixed(1)}</span>
            <span className="history__score-max"> / 10</span>
          </div>
        )}

        {rows.length > 0 && (
          <ul className="report-detail__dims">
            {rows.map((r, i) => {
              const label = r.label ?? r.dimension ?? `Move ${i + 1}`;
              const scoreTxt = typeof r.score === 'number' ? `${r.score}/3` : r.hit != null ? (r.hit ? 'hit' : 'missed') : '';
              return (
                <li key={i} className="report-detail__dim">
                  <span className="report-detail__dim-label">{label} {scoreTxt && <em>{scoreTxt}</em>}</span>
                  {(r.rationale || r.tip) && <span className="report-detail__dim-note">{r.rationale || r.tip}</span>}
                  {r.evidenceQuote && <span className="report-detail__dim-quote">"{r.evidenceQuote}"</span>}
                </li>
              );
            })}
          </ul>
        )}

        {lines.length > 0 && (
          <div className="report-detail__transcript">
            <h3 className="report-detail__h">The conversation</h3>
            {lines.map((l, i) => (
              <div key={i} className={`dual-line dual-line--${l.speaker}`} data-speaker={l.speaker}>
                <span className="dual-line__who">{l.speaker === 'you' ? 'You' : repName}</span>
                <p className="dual-line__text">{l.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default HistoryPanel;
