// web/src/components/SessionResults.tsx
import type { JSX } from 'react';
import type { Scorecard, ResultLine } from '../training/scoreApi';
import { DualTranscript } from './DualTranscript';
import { DimensionBars, ScoreTrend } from './ResultCharts';
import './SessionResults.css';

const BAND_WORD: Record<Scorecard['band'], string> = {
  needs_work: 'Needs work', developing: 'Developing', proficient: 'Proficient', strong: 'Strong',
};

export interface SessionResultsProps {
  scorecard: Scorecard;
  transcript: ResultLine[];
  repLabel?: string;
  saving?: boolean;
  onAgain: () => void;
  onDone: () => void;
  /** Past overall scores for THIS skill/persona, oldest→newest, EXCLUDING this run
   *  (this run's score is appended for the trend line). Empty/undefined hides it. */
  pastScores?: number[];
}

/**
 * The scored debrief. Two columns make use of the full width: the LEFT is the
 * verdict + per-move bar chart + the one fix; the RIGHT is your score trend across
 * recent sessions + the call signals. The annotated transcript spans full width
 * below. A STICKY action bar keeps Done / Run-again always reachable (the old
 * single-column report buried them off-screen).
 */
export function SessionResults({ scorecard, transcript, repLabel, saving, onAgain, onDone, pastScores }: SessionResultsProps): JSX.Element {
  const sc = scorecard;
  const trend = [...(pastScores ?? []), sc.overallScore];
  const bars = sc.scores.map((d) => ({ label: d.label, score: d.score, max: 3, band: d.band }));

  return (
    <div className="session-results session-results--v2" data-testid="session-results">
      <div className="results-grid">
        {/* LEFT — verdict, moves, the one fix */}
        <div className="results-col results-col--main">
          <section className={`results-verdict results-verdict--${sc.band}`}>
            <div className="results-score">
              <span className="results-score__value" data-testid="results-overall">{sc.overallScore.toFixed(1)}</span>
              <span className="results-score__max">/ 10</span>
              <span className="results-score__band">{BAND_WORD[sc.band]}</span>
            </div>
            <p className="results-headline">{sc.headline}</p>
          </section>

          <section className="results-card">
            <h3 className="results-h">How each move went</h3>
            <DimensionBars items={bars} />
          </section>

          <section className="results-card results-fix-card">
            <span className="results-fix__label">Your one fix</span>
            <p className="results-fix__note">{sc.fix.note}</p>
            {sc.nextTime && <p className="results-fix__next">Next time: {sc.nextTime}</p>}
          </section>
        </div>

        {/* RIGHT — progress over time + signals (uses the previously-empty space) */}
        <div className="results-col results-col--side">
          <section className="results-card">
            <h3 className="results-h">Your progress</h3>
            <ScoreTrend points={trend} />
            <p className="results-trend-caption">
              {trend.length >= 2
                ? `${trend.length} recent sessions${trend[trend.length - 1] >= trend[trend.length - 2] ? ' — trending up' : ' — keep at it'}`
                : 'Your first scored session — run more to see your trend.'}
            </p>
          </section>

          <section className="results-card">
            <h3 className="results-h">Call signals</h3>
            <ul className="results-signals-list">
              <li><span>Talk ratio</span><strong>{sc.signals.talkRatioPct}%</strong><em>ideal ~45–57%</em></li>
              <li><span>Questions asked</span><strong>{sc.signals.questionCount}</strong></li>
              <li><span>Longest monologue</span><strong>{sc.signals.longestMonologueWords}w</strong></li>
            </ul>
          </section>

          {sc.worked.note && (
            <section className="results-card results-worked">
              <span className="results-fix__label">What worked</span>
              <p className="results-worked__note">{sc.worked.note}</p>
            </section>
          )}
        </div>
      </div>

      {/* Full-width annotated transcript */}
      <section className="results-card results-transcript">
        <h3 className="results-h">The conversation</h3>
        <DualTranscript lines={transcript} repLabel={repLabel} />
      </section>

      {/* Sticky actions — always reachable, never buried below the fold. */}
      <div className="results-actions results-actions--sticky">
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
