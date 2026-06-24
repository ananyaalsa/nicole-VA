import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { nextBlinkDelay, BLINK_DURATION_MS } from './blink';
import { mouthOpenness } from './mouth';

export interface NicoleAvatarProps {
  /** Current audio amplitude (0..~1). Drives lip-sync. */
  amplitude?: number;
  /** Whether Nicole is currently speaking. When false the mouth rests. */
  speaking?: boolean;
}

/** Eye open-state geometry. */
const EYE_RY_OPEN = 9;
/** Mouth resting (closed-ish) half-height and fully-open half-height. */
const MOUTH_RY_MIN = 3;
const MOUTH_RY_MAX = 17;

/**
 * Nicole — a friendly 2D virtual-assistant avatar.
 *
 * Features:
 *  - Natural randomized blinking (setTimeout scheduling via nextBlinkDelay).
 *  - Amplitude-driven, smoothed lip-sync (mouthOpenness).
 *  - Subtle "breathing" idle motion via requestAnimationFrame.
 *
 * All timers and animation frames are cleaned up on unmount.
 */
export function NicoleAvatar({
  amplitude = 0,
  speaking = false,
}: NicoleAvatarProps): JSX.Element {
  const [blinking, setBlinking] = useState(false);
  // Smoothed mouth openness, driven by rAF so it reacts to live amplitude.
  const [openness, setOpenness] = useState(0);
  // Breathing phase 0..1 used to drive a gentle translate/scale.
  const [breath, setBreath] = useState(0);

  // Refs that the rAF / timer callbacks read without re-subscribing effects.
  const prevOpennessRef = useRef(0);
  const amplitudeRef = useRef(amplitude);
  const speakingRef = useRef(speaking);

  // Keep live values in refs for the animation loop.
  amplitudeRef.current = amplitude;
  speakingRef.current = speaking;

  // --- Blink scheduling -----------------------------------------------------
  useEffect(() => {
    let mounted = true;
    let openTimer: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleNextBlink = () => {
      openTimer = setTimeout(() => {
        if (!mounted) return;
        setBlinking(true);
        closeTimer = setTimeout(() => {
          if (!mounted) return;
          setBlinking(false);
          scheduleNextBlink();
        }, BLINK_DURATION_MS);
      }, nextBlinkDelay());
    };

    scheduleNextBlink();

    return () => {
      mounted = false;
      if (openTimer) clearTimeout(openTimer);
      if (closeTimer) clearTimeout(closeTimer);
    };
  }, []);

  // --- Lip-sync + breathing via requestAnimationFrame -----------------------
  useEffect(() => {
    let rafId = 0;
    const start =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    const tick = (now: number) => {
      // Lip-sync: target amplitude only when speaking, else trend to silence.
      const liveAmp = speakingRef.current ? amplitudeRef.current : 0;
      const next = mouthOpenness(liveAmp, prevOpennessRef.current);
      prevOpennessRef.current = next;
      setOpenness(next);

      // Breathing: slow sine, ~4s period, normalized to 0..1.
      const elapsed = now - start;
      const phase = (Math.sin((elapsed / 4000) * Math.PI * 2) + 1) / 2;
      setBreath(phase);

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // Derived geometry -------------------------------------------------------
  const eyeRy = blinking ? EYE_RY_OPEN * 0.1 : EYE_RY_OPEN;
  const mouthRy = MOUTH_RY_MIN + (MOUTH_RY_MAX - MOUTH_RY_MIN) * openness;
  // Gentle breathing: up to ~3px vertical drift and a hair of scale.
  const breathY = (breath - 0.5) * 3;
  const breathScale = 1 + (breath - 0.5) * 0.012;

  return (
    <svg
      viewBox="0 0 200 240"
      width="100%"
      height="100%"
      role="img"
      aria-label="Nicole, a friendly virtual assistant"
      xmlns="http://www.w3.org/2000/svg"
      data-speaking={speaking ? 'true' : 'false'}
      data-blinking={blinking ? 'true' : 'false'}
    >
      <defs>
        <linearGradient id="nicole-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eef3ff" />
          <stop offset="100%" stopColor="#dfe7fb" />
        </linearGradient>
        <radialGradient id="nicole-skin" cx="50%" cy="42%" r="65%">
          <stop offset="0%" stopColor="#ffe2cf" />
          <stop offset="100%" stopColor="#f4c3a3" />
        </radialGradient>
        <linearGradient id="nicole-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6b4226" />
          <stop offset="100%" stopColor="#4a2c17" />
        </linearGradient>
        <radialGradient id="nicole-cheek" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffb6a0" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#ffb6a0" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft background disc */}
      <circle cx="100" cy="120" r="118" fill="url(#nicole-bg)" />

      {/* Everything that breathes lives in this group */}
      <g transform={`translate(0 ${breathY}) scale(${breathScale})`} style={{ transformOrigin: '100px 130px' }}>
        {/* Hair back layer */}
        <path
          d="M44 118 C40 56 76 26 100 26 C124 26 160 56 156 118 C158 150 150 186 138 206 L62 206 C50 186 42 150 44 118 Z"
          fill="url(#nicole-hair)"
        />

        {/* Neck */}
        <path d="M86 168 L86 196 Q100 206 114 196 L114 168 Z" fill="url(#nicole-skin)" />
        <path d="M86 168 L86 182 Q100 192 114 182 L114 168 Z" fill="#e0a584" opacity="0.5" />

        {/* Face */}
        <ellipse cx="100" cy="118" rx="52" ry="60" fill="url(#nicole-skin)" />

        {/* Ears */}
        <ellipse cx="50" cy="122" rx="8" ry="12" fill="url(#nicole-skin)" />
        <ellipse cx="150" cy="122" rx="8" ry="12" fill="url(#nicole-skin)" />

        {/* Hair front: fringe / bangs framing the face */}
        <path
          d="M48 112 C46 64 78 30 100 30 C122 30 154 64 152 112 C146 92 132 78 132 78 C132 78 130 94 120 96 C124 80 118 70 118 70 C112 84 86 86 76 74 C76 86 70 96 70 96 C62 88 56 96 52 108 Z"
          fill="url(#nicole-hair)"
        />

        {/* Cheeks blush */}
        <ellipse cx="72" cy="138" rx="11" ry="8" fill="url(#nicole-cheek)" />
        <ellipse cx="128" cy="138" rx="11" ry="8" fill="url(#nicole-cheek)" />

        {/* Eyebrows */}
        <path d="M64 100 Q78 92 92 99" stroke="#5a3a22" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d="M108 99 Q122 92 136 100" stroke="#5a3a22" strokeWidth="3.5" fill="none" strokeLinecap="round" />

        {/* Eyes — whites, iris, pupil, highlight. ry collapses when blinking. */}
        <g>
          {/* Left eye */}
          <ellipse cx="78" cy="116" rx="13" ry={eyeRy} fill="#ffffff" stroke="#caa98f" strokeWidth="0.75" />
          {!blinking && (
            <>
              <circle cx="78" cy="116" r="6" fill="#5a8bd6" />
              <circle cx="78" cy="116" r="3" fill="#23344d" />
              <circle cx="80" cy="113.5" r="1.6" fill="#ffffff" />
            </>
          )}
          {/* Right eye */}
          <ellipse cx="122" cy="116" rx="13" ry={eyeRy} fill="#ffffff" stroke="#caa98f" strokeWidth="0.75" />
          {!blinking && (
            <>
              <circle cx="122" cy="116" r="6" fill="#5a8bd6" />
              <circle cx="122" cy="116" r="3" fill="#23344d" />
              <circle cx="124" cy="113.5" r="1.6" fill="#ffffff" />
            </>
          )}
          {/* Lash lines for definition */}
          <path d="M65 113 Q78 108 91 113" stroke="#3a2517" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M109 113 Q122 108 135 113" stroke="#3a2517" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </g>

        {/* Nose hint */}
        <path d="M100 124 L96 142 Q100 146 104 142" stroke="#d99e7c" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {/* Mouth — height scales with openness; lips give it form */}
        <g>
          <ellipse cx="100" cy="160" rx="18" ry={mouthRy} fill="#a14a52" />
          {/* Inner mouth / teeth hint visible when fairly open */}
          {openness > 0.35 && (
            <ellipse cx="100" cy={160 - mouthRy * 0.3} rx="13" ry={Math.max(1.5, mouthRy * 0.45)} fill="#fff4f2" />
          )}
          {/* Upper lip line */}
          <path
            d={`M82 160 Q100 ${160 - mouthRy} 118 160`}
            stroke="#7e3540"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      </g>
    </svg>
  );
}

export default NicoleAvatar;
