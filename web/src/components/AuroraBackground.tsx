import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import './AuroraBackground.css';

/** Number of drifting particles. Kept small so the rAF loop stays cheap. */
const PARTICLE_COUNT = 34;

/** A single floating dust mote. */
interface Particle {
  x: number;
  y: number;
  /** Radius in CSS pixels. */
  r: number;
  /** Velocity in CSS pixels per second. */
  vx: number;
  vy: number;
  /** Base alpha; modulated by a slow sine twinkle. */
  alpha: number;
  /** Twinkle phase offset. */
  phase: number;
}

/**
 * Detect a user preference for reduced motion. Guards against environments
 * (older jsdom, SSR) where `matchMedia` is missing.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function makeParticle(width: number, height: number): Particle {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    r: 0.6 + Math.random() * 1.8,
    vx: (Math.random() - 0.5) * 8,
    vy: -4 - Math.random() * 10, // gentle upward drift
    alpha: 0.15 + Math.random() * 0.35,
    phase: Math.random() * Math.PI * 2,
  };
}

/**
 * AuroraBackground — a full-viewport, fixed, behind-content animated backdrop
 * for the Nicole assistant. Soft drifting aurora blobs (CSS keyframes) layered
 * with faint floating particles (canvas + rAF).
 *
 * Performance / safety:
 *  - The rAF loop is cancelled on unmount and paused while the tab is hidden
 *    (visibilitychange), so it cannot leak or burn cycles over long sessions.
 *  - When the user prefers reduced motion, the particle loop never starts and
 *    the CSS animations are disabled, leaving a calm static gradient.
 */
export function AuroraBackground(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Resolved once on mount so the static markup matches the runtime behaviour.
  const [reducedMotion] = useState<boolean>(() => prefersReducedMotion());

  useEffect(() => {
    if (reducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let lastTime =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // (Re)seed particles to fill the new viewport.
      particles = Array.from({ length: PARTICLE_COUNT }, () =>
        makeParticle(width, height),
      );
    };

    const tick = (now: number) => {
      // Clamp dt so a backgrounded-then-foregrounded tab doesn't teleport motes.
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.phase += dt;

        // Wrap around edges for an endless field.
        if (p.y < -5) {
          p.y = height + 5;
          p.x = Math.random() * width;
        }
        if (p.x < -5) p.x = width + 5;
        else if (p.x > width + 5) p.x = -5;

        const twinkle = 0.6 + 0.4 * Math.sin(p.phase * 1.6);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(214, 222, 255, ${p.alpha * twinkle})`;
        ctx.fill();
      }

      rafId = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (rafId === 0) {
        lastTime =
          typeof performance !== 'undefined' ? performance.now() : Date.now();
        rafId = requestAnimationFrame(tick);
      }
    };

    const stopLoop = () => {
      if (rafId !== 0) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const onVisibility = () => {
      if (document.hidden) stopLoop();
      else startLoop();
    };

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);

    // Only run while visible (covers the case of mounting in a hidden tab).
    if (!document.hidden) startLoop();

    return () => {
      stopLoop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reducedMotion]);

  return (
    <div
      className="aurora-bg"
      data-testid="aurora-bg"
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      aria-hidden="true"
    >
      <div className="aurora-bg__blobs">
        <div className="aurora-bg__blob aurora-bg__blob--indigo" />
        <div className="aurora-bg__blob aurora-bg__blob--violet" />
        <div className="aurora-bg__blob aurora-bg__blob--teal" />
        <div className="aurora-bg__blob aurora-bg__blob--magenta" />
        <div className="aurora-bg__blob aurora-bg__blob--glow" />
      </div>
      {!reducedMotion && (
        <canvas
          ref={canvasRef}
          className="aurora-bg__particles"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export default AuroraBackground;
