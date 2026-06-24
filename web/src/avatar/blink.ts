/**
 * Blink timing logic for the Nicole avatar.
 *
 * Pure module: no DOM, no React. Easy to unit test deterministically by
 * injecting a `rand` function.
 */

/** How long the eyes stay closed during a single blink, in milliseconds. */
export const BLINK_DURATION_MS = 120;

/**
 * Returns a natural, randomized delay (in milliseconds) to wait before the
 * next blink. The result lies in the range [2000, 6000].
 *
 * Formula: `2000 + rand() * 4000`, where `rand()` is expected to return a
 * value in [0, 1) (the contract of `Math.random`). Passing the bounds
 * 0 and 1 yields exactly 2000 and 6000 respectively.
 *
 * @param rand A random source returning a number in [0, 1]. Defaults to Math.random.
 */
export function nextBlinkDelay(rand: () => number = Math.random): number {
  return 2000 + rand() * 4000;
}
