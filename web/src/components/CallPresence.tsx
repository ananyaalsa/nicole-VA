import type { JSX } from 'react';

export interface CallPresenceProps {
  /** Display name of who you're with (the rep alias, or "Nicole" for the coach). */
  name: string;
  /** One-line status under the name (e.g. the scenario, or the phase goal). */
  status: string;
  /** Optional avatar image; falls back to the name's initial. */
  avatarSrc?: string;
  /** True while the other party is actively speaking — drives the pulse/wave. */
  speaking?: boolean;
  /** True once the call is connected/live. */
  live?: boolean;
}

/**
 * The "you're on a live call" panel at the top of a live room. The avatar pulses
 * and a little waveform animates while the other party speaks, so the room reads
 * as a real call even before any transcript appears.
 */
export function CallPresence({ name, status, avatarSrc, speaking, live }: CallPresenceProps): JSX.Element {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const stateClass = speaking ? 'call-presence--speaking' : live ? 'call-presence--live' : '';
  return (
    <div className={`call-presence ${stateClass}${speaking ? ' is-speaking' : ''}`} data-testid="call-presence">
      <div className="call-presence__avatar" aria-hidden="true">
        {avatarSrc ? <img src={avatarSrc} alt="" /> : initial}
      </div>
      <div className="call-presence__body">
        <span className="call-presence__name">{name}</span>
        <span className="call-presence__status">
          {speaking ? (
            <span className="call-presence__wave" aria-hidden="true">
              <span /><span /><span /><span />
            </span>
          ) : (
            <span className="call-presence__dot" aria-hidden="true" />
          )}
          {speaking ? `${name} is speaking…` : status}
        </span>
      </div>
    </div>
  );
}

export default CallPresence;
