import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Live2DStage } from './Live2DStage';
import './CenterAvatar.css';

/**
 * A big, CENTERED lip-syncing Live2D avatar — the hero of the mobile voice view
 * (Talk, Training coach, Roleplay/Training prospect). Same engine as the corner
 * companion (Live2DStage: lip-sync from amplitude, blink, gesture-while-speaking)
 * but framed large and centered. The screens render this in the middle of the
 * stage on mobile, with the transcript hidden, so it's "just a big avatar talking".
 *
 * Heavy canvas: once mounted it stays mounted (toggling `shown` only hides it) so
 * we never re-load the model on a visibility flip.
 */
export interface CenterAvatarProps {
  amplitude: number;
  speaking: boolean;
  /** Aria/Noah = Nicole; chitose/natori = the prospect (roleplay / live-rep). */
  avatarId: 'aria' | 'noah' | 'natori' | 'chitose';
  /** Per-element wardrobe colors (companion avatars only; natori has none). */
  colors?: Record<string, string>;
  /** Whether the avatar should be visible. */
  shown?: boolean;
  className?: string;
}

export function CenterAvatar({ amplitude, speaking, avatarId, colors, shown = true, className }: CenterAvatarProps): JSX.Element | null {
  const [everShown, setEverShown] = useState(shown);
  useEffect(() => { if (shown) setEverShown(true); }, [shown]);

  const amplitudeRef = useRef(amplitude);
  amplitudeRef.current = amplitude;
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;

  if (!everShown) return null;

  return (
    <div
      className={`center-avatar${speaking ? ' is-speaking' : ''}${shown ? '' : ' is-hidden'}${className ? ` ${className}` : ''}`}
      data-testid="center-avatar"
    >
      <Live2DStage
        amplitudeRef={amplitudeRef}
        speakingRef={speakingRef}
        avatarId={avatarId}
        colors={colors}
        className="center-avatar__canvas"
      />
    </div>
  );
}

export default CenterAvatar;
