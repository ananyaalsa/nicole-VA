import type { JSX } from 'react';
import './NicoleAura.css';

export type AuraState = 'idle' | 'listening' | 'speaking';

export interface NicoleAuraProps {
  /** Live speech amplitude 0..1 (drives the pulse size/brightness). */
  amplitude?: number;
  /** Conversational state — sets the aura's hue. */
  state?: AuraState;
  /** The avatar (and anything centered) rendered inside the glow. */
  children?: React.ReactNode;
}

/**
 * Nicole's living aura — the signature element. A soft radial glow behind the
 * avatar that breathes when idle, cools to cyan while listening, and flares
 * violet in time with her actual speech amplitude while speaking. It binds the
 * avatar, the audio, and her emotional state into one presence.
 */
export function NicoleAura({
  amplitude = 0,
  state = 'idle',
  children,
}: NicoleAuraProps): JSX.Element {
  // Map amplitude to a glow scale + opacity. Clamp so a loud spike never blows
  // out the layout. Idle uses a gentle baseline so she's never fully dark.
  const a = Math.min(1, Math.max(0, amplitude));
  const scale = 1 + a * 0.35;
  const glow = 0.45 + a * 0.55;

  return (
    <div
      className={`nicole-aura is-${state}`}
      data-testid="nicole-aura"
      data-state={state}
    >
      <div
        className="aura-glow"
        style={{ transform: `translate(-50%, -50%) scale(${scale})`, opacity: glow }}
        aria-hidden="true"
      />
      <div className="aura-ring aura-ring-1" aria-hidden="true" />
      <div className="aura-ring aura-ring-2" aria-hidden="true" />
      <div className="aura-content">{children}</div>
    </div>
  );
}

export default NicoleAura;
