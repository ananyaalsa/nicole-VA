import type { JSX } from 'react';
import type { RoleplayBrief } from '../training/roleplayBrief';
import './RoleplayBriefCard.css';

export interface RoleplayBriefCardProps {
  brief: RoleplayBrief;
  /** Persona's display name (for the avatar initial). */
  personaName?: string;
  onStart: () => void;
  /** Re-roll the case to a fresh, different setup. */
  onReshuffle?: () => void;
}

/** Split "Name — tagline" into its two parts for the header. */
function splitWho(who: string): { name: string; tagline: string } {
  const i = who.indexOf('—');
  if (i < 0) return { name: who.trim(), tagline: '' };
  return { name: who.slice(0, i).trim(), tagline: who.slice(i + 1).trim() };
}

/**
 * The case-brief screen shown between picking a roleplay and starting the call.
 * A briefing card: a hero header (who + their role at a real-feeling company),
 * the situation, your objective, and a few at-a-glance facts — so the call feels
 * like a real, specific, freshly-briefed scenario rather than a cold drop-in.
 */
export function RoleplayBriefCard({ brief, personaName, onStart, onReshuffle }: RoleplayBriefCardProps): JSX.Element {
  const { name, tagline } = splitWho(brief.who);
  const initial = (personaName ?? name).trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="brief-card" data-testid="roleplay-brief">
      {/* Hero: who you're calling + their role/company. */}
      <header className="brief-hero">
        <span className="brief-hero__avatar" aria-hidden="true">{initial}</span>
        <div className="brief-hero__text">
          <p className="brief-hero__eyebrow">Your case</p>
          <h2 className="brief-hero__name">{name}</h2>
          <p className="brief-hero__role">{brief.role}</p>
          {tagline && <p className="brief-hero__tagline">{tagline}</p>}
        </div>
      </header>

      <div className="brief-grid">
        <section className="brief-block brief-block--situation">
          <h3 className="brief-block__h">The situation</h3>
          <p className="brief-block__body">{brief.situation}</p>
        </section>

        <section className="brief-block brief-block--objective">
          <h3 className="brief-block__h">Your objective</h3>
          <p className="brief-block__body brief-block__body--goal">{brief.objective}</p>
        </section>
      </div>

      {brief.context.length > 0 && (
        <ul className="brief-facts" aria-label="What to expect">
          {brief.context.map((c, i) => {
            // Show the part before the first colon as a small label, rest as the value.
            const ci = c.indexOf(':');
            const hasLabel = ci > 0 && ci < 24;
            return (
              <li key={i} className="brief-fact">
                {hasLabel && <span className="brief-fact__label">{c.slice(0, ci)}</span>}
                <span className="brief-fact__val">{hasLabel ? c.slice(ci + 1).trim() : c}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="brief-actions">
        <button
          type="button"
          className="picker-cta-bar__btn brief-card__start"
          data-testid="start-from-brief-button"
          onClick={onStart}
        >
          Start the call <span aria-hidden="true">→</span>
        </button>
        {onReshuffle && (
          <button
            type="button"
            className="brief-reshuffle"
            data-testid="brief-reshuffle"
            onClick={onReshuffle}
          >
            ↻ Different case
          </button>
        )}
      </div>
    </div>
  );
}

export default RoleplayBriefCard;
