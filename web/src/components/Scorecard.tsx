import type { JSX } from 'react';
import type { ScoreEntry } from '../training/useCoachingSession';
import './Scorecard.css';

export interface ScorecardProps {
  /** Silent scoring entries produced during practice / roleplay. */
  entries: ScoreEntry[];
}

/**
 * Live coaching scorecard. Each entry shows the framework move (dimension), a
 * hit/miss indicator, and a short performance tip. These come from Nicole's
 * silent `training_mark_progress` scoring — they are shown, never spoken.
 */
export function Scorecard({ entries }: ScorecardProps): JSX.Element {
  return (
    <div className="scorecard" data-testid="scorecard">
      <div className="scorecard__header">Scorecard</div>
      {entries.length === 0 ? (
        <div className="scorecard__empty" data-testid="scorecard-empty">
          Your moves will be scored here as you practice.
        </div>
      ) : (
        <ul className="scorecard__list">
          {entries.map((entry, i) => (
            <li
              key={`${entry.dimension}-${i}`}
              className={`scorecard__entry scorecard__entry--${entry.hit ? 'hit' : 'miss'}`}
              data-testid="scorecard-entry"
              data-hit={entry.hit ? 'true' : 'false'}
              data-dimension={entry.dimension}
            >
              <span
                className="scorecard__indicator"
                aria-hidden="true"
                title={entry.hit ? 'Hit' : 'Miss'}
              >
                {entry.hit ? '✓' : '✕'}
              </span>
              <span className="scorecard__body">
                <span className="scorecard__dimension">{entry.dimension}</span>
                <span className="scorecard__tip">{entry.tip}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Scorecard;
