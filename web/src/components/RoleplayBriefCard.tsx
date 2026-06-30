import type { JSX } from 'react';
import type { RoleplayBrief } from '../training/roleplayBrief';
import './RoleplayBriefCard.css';

export interface RoleplayBriefCardProps {
  brief: RoleplayBrief;
  /** Persona's display name (for the "who" headline initial/avatar). */
  onStart: () => void;
}

/**
 * The case-brief screen shown between picking a roleplay and starting the call.
 * Three plain sections — who you're talking to, the situation, your objective — so
 * the call feels like a real, briefed scenario rather than a cold drop-in.
 */
export function RoleplayBriefCard({ brief, onStart }: RoleplayBriefCardProps): JSX.Element {
  return (
    <div className="brief-card" data-testid="roleplay-brief">
      <p className="brief-card__eyebrow">Your case</p>

      <section className="brief-card__section">
        <h2 className="brief-card__h">Who you're talking to</h2>
        <p className="brief-card__who">{brief.who}</p>
      </section>

      <section className="brief-card__section">
        <h2 className="brief-card__h">The situation</h2>
        <p className="brief-card__situation">{brief.situation}</p>
        {brief.context.length > 0 && (
          <ul className="brief-card__context">
            {brief.context.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        )}
      </section>

      <section className="brief-card__section">
        <h2 className="brief-card__h">Your objective</h2>
        <p className="brief-card__objective">{brief.objective}</p>
      </section>

      <button
        type="button"
        className="picker-cta-bar__btn brief-card__start"
        data-testid="start-from-brief-button"
        onClick={onStart}
      >
        Start the call <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

export default RoleplayBriefCard;
