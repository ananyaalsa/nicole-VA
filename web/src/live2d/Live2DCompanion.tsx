import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Live2DStage } from './Live2DStage';
import './Live2DCompanion.css';

/**
 * The bottom-right Live2D companion (Izumi). Lip-syncs + gestures to the live
 * Nicole voice while she speaks; stands still otherwise. Purely an overlay.
 *
 * Visibility is CONTROLLED by the parent (`shown`) so the show/hide button can
 * live wherever it fits best in the layout (we put it in the controls bar) —
 * this avoids a floating toggle colliding with other bottom-corner UI.
 *
 * `amplitude` (React state, ~60Hz) is mirrored into a ref so the render loop
 * reads it without re-mounting the canvas.
 */
export interface Live2DCompanionProps {
  amplitude: number;
  speaking: boolean;
  /** Whether the avatar is visible (controlled by the parent). */
  shown: boolean;
  /** Which avatar (Aria/Noah). */
  avatarId?: 'aria' | 'noah';
  /** Per-element wardrobe colors. */
  colors?: Record<string, string>;
}

export function Live2DCompanion({ amplitude, speaking, shown, avatarId = 'aria', colors }: Live2DCompanionProps): JSX.Element | null {
  // Once shown, keep the heavy canvas mounted (toggling only hides it) so we
  // don't re-load the model on every toggle.
  const [everShown, setEverShown] = useState(shown);
  useEffect(() => { if (shown) setEverShown(true); }, [shown]);

  const amplitudeRef = useRef(amplitude);
  amplitudeRef.current = amplitude;
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;

  if (!everShown) return null;

  // `is-speaking` lets the avatar become prominent on mobile while Nicole talks
  // (per the research: avatar steps back while reading chat, expands during voice).
  return (
    <div className={`l2d-companion${speaking ? ' is-speaking' : ''}`}>
      <div className={`l2d-companion__stage${shown ? '' : ' is-hidden'}`}>
        <Live2DStage
          amplitudeRef={amplitudeRef}
          speakingRef={speakingRef}
          avatarId={avatarId}
          colors={colors}
          className="l2d-companion__canvas"
        />
      </div>
    </div>
  );
}

export default Live2DCompanion;
