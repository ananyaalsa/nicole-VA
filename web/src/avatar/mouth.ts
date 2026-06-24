/**
 * Mouth / lip-sync logic for the Nicole avatar.
 *
 * Pure module: maps a raw audio amplitude to a smoothed "mouth openness"
 * value and a coarse viseme bucket. No DOM, no React.
 */

/** Gain applied to amplitude so quieter speech still opens the mouth. */
const MOUTH_GAIN = 1.4;

/** Smoothing factor toward the target openness (0..1). Higher = snappier. */
const SMOOTHING = 0.5;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Maps an audio amplitude (nominally 0..1, but may exceed 1) to a smoothed
 * mouth-openness value in [0, 1].
 *
 * Steps:
 *  1. Clamp the incoming amplitude to [0, 1].
 *  2. Apply gain and re-clamp to [0, 1] to get the target openness.
 *  3. Smooth from `prev` toward the target so the mouth doesn't jitter:
 *     `prev + (target - prev) * SMOOTHING`.
 *
 * With amplitude 0 the target is 0, so the value trends toward 0 over time.
 * With high amplitude the target is 1, so it trends toward 1.
 *
 * @param amplitude Raw audio amplitude (0..~1, may exceed).
 * @param prev      Previous openness value, for smoothing. Defaults to 0.
 */
export function mouthOpenness(amplitude: number, prev = 0): number {
  const clampedAmplitude = clamp01(amplitude);
  const target = clamp01(clampedAmplitude * MOUTH_GAIN);
  const next = prev + (target - prev) * SMOOTHING;
  return clamp01(next);
}

/**
 * Buckets a mouth-openness value into a coarse viseme used to pick a mouth
 * shape.
 *
 *  - openness < 0.15        -> 'closed'
 *  - 0.15 <= openness < 0.55 -> 'mid'
 *  - openness >= 0.55       -> 'open'
 */
export function visemeFromOpenness(openness: number): 'closed' | 'mid' | 'open' {
  if (openness < 0.15) return 'closed';
  if (openness < 0.55) return 'mid';
  return 'open';
}
