// web/src/components/SessionResults.tsx
import type { JSX } from 'react';
import type { Scorecard, ResultLine } from '../training/scoreApi';
import { DualTranscript } from './DualTranscript';
import './SessionResults.css';

const BAND_WORD: Record<Scorecard['band'], string> = {
  needs_work: 'Needs work', developing: 'Developing', proficient: 'Proficient', strong: 'Strong',
};
const DIM_ICON: Record<string, string> = { missing: '✕', emerging: '↑', proficient: '✓', strong: '★' };

export interface SessionResultsProps {
  scorecard: Scorecard;
  transcript: ResultLine[];
  repLabel?: string;
  saving?: boolean;
  onAgain: () => void;
  onDone: () => void;
}

export function SessionResults({ scorecard, transcript, repLabel, saving, onAgain, onDone }: SessionResultsProps): JSX.Element {
  const sc = scorecard;
  return (
    <div className="session-results" data-testid="session-results">
      {/* Altitude 1 — verdict */}
      <section className={`results-verdict results-verdict--${sc.band}`}>
        <div className="results-score">
          <span className="results-score__value">{sc.overallScore.toFixed(1)}</span>
          <span className="results-score__max">/ 10</span>
          <span className="results-score__band">{BAND_WORD[sc.band]}</span>
        </div>
        <p className="results-headline">{sc.headline}</p>
        <div className="results-fix">
          <span className="results-fix__label">Your one fix</span>
          <p className="results-fix__note">{sc.fix.note}</p>
          <p className="results-fix__next">Try next time: {sc.nextTime}</p>
        </div>
      </section>

      {/* Altitude 2 — scorecard */}
      <section className="results-scorecard">
        <h3 className="results-h">How each move went</h3>
        <ul className="results-dims">
          {sc.scores.map((d) => (
            <li key={d.dimensionId} className={`results-dim results-dim--${d.band}`}>
              <span className="results-dim__icon" aria-hidden="true">{DIM_ICON[d.band]}</span>
              <span className="results-dim__body">
                <span className="results-dim__label">{d.label} <em>{d.score}/3</em></span>
                <span className="results-dim__rationale">{d.rationale}</span>
                {d.evidenceQuote && <span className="results-dim__quote">"{d.evidenceQuote}"</span>}
              </span>
            </li>
          ))}
        </ul>
        <div className="results-signals">
          <span>Talk ratio {sc.signals.talkRatioPct}% <em>(ideal ~45-57%)</em></span>
          <span>Questions {sc.signals.questionCount}</span>
          <span>Longest streak {sc.signals.longestMonologueWords}w</span>
        </div>
      </section>

      {/* Altitude 3 — annotated dual transcript */}
      <section className="results-transcript">
        <h3 className="results-h">The conversation</h3>
        <DualTranscript lines={transcript} repLabel={repLabel} />
      </section>

      <div className="results-actions">
        <button type="button" className="results-secondary" data-testid="results-done" onClick={onDone}>
          {saving ? 'Saving…' : 'Done'}
        </button>
        <button type="button" className="picker-cta-bar__btn" data-testid="results-again" onClick={onAgain}>
          Run it again <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}

export default SessionResults;
