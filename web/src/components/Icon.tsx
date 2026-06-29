import type { JSX } from 'react';

export type IconName =
  | 'training'
  | 'roleplay'
  | 'history'
  | 'mic'
  | 'mic-off'
  | 'speaker'
  | 'speaker-off'
  | 'volume'
  | 'volume-low'
  | 'volume-off'
  | 'camera'
  | 'end'
  | 'back'
  | 'play';

/**
 * Crisp inline-SVG icons drawn with `currentColor` so each button controls the
 * tint and glow. Stroked, 1.6px, sharp/edgy line style to match the console.
 */
const PATHS: Record<IconName, JSX.Element> = {
  training: (
    <>
      <path d="M3 13l9-7 9 7" />
      <path d="M7 11.5V18a5 5 0 0 0 10 0v-6.5" />
    </>
  ),
  roleplay: (
    <>
      <path d="M4 5h11v8H8l-4 3z" />
      <path d="M9 16v1h7l3 2v-9h-3" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </>
  ),
  'mic-off': (
    <>
      <path d="M9 9V6a3 3 0 0 1 6 0v3" />
      <path d="M5 11a7 7 0 0 0 11 5.3" />
      <path d="M12 18v3" />
      <path d="M4 4l16 16" />
    </>
  ),
  /* "speaker" = mute/unmute NICOLE'S VOICE. Drawn as a SPEECH BUBBLE (her
     talking), distinct from the loudness "volume" speaker icon below. */
  speaker: (
    <>
      <path d="M4 5h16v11H9l-4 3v-3H4z" />
      <path d="M8.5 10.5h7" />
    </>
  ),
  'speaker-off': (
    <>
      <path d="M4 5h16v11H9l-4 3v-3H4z" />
      <path d="M4 4l16 15" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16 9a3.5 3.5 0 0 1 0 6" />
      <path d="M18.5 7a7 7 0 0 1 0 10" />
    </>
  ),
  'volume-low': (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16 9a3.5 3.5 0 0 1 0 6" />
    </>
  ),
  'volume-off': (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M22 9l-5 6M17 9l5 6" />
    </>
  ),
  camera: (
    <>
      <path d="M3 7h4l2-2h6l2 2h4v12H3z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  end: (
    <>
      <path d="M5 5l14 14" />
      <path d="M19 5L5 19" />
    </>
  ),
  back: (
    <>
      <path d="M11 5l-7 7 7 7" />
      <path d="M4 12h16" />
    </>
  ),
  play: (
    <>
      <path d="M7 5l12 7-12 7z" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 18, className }: IconProps): JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

export default Icon;
