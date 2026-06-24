import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { AuroraBackground } from './AuroraBackground';

/**
 * jsdom lacks `matchMedia`, so every test installs a controllable mock.
 * `reduced` toggles the `prefers-reduced-motion: reduce` match result.
 */
function mockMatchMedia(reduced: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated, kept for completeness
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

/**
 * jsdom has no canvas implementation, so `getContext('2d')` throws and returns
 * null — which would make the component bail out of its rAF loop. Stub it with
 * a no-op 2D context so the animation lifecycle can be exercised.
 */
function stubCanvas2dContext(): void {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // Reset any matchMedia stub between tests.
  // @ts-expect-error allow deleting the test-only stub
  delete window.matchMedia;
});

describe('AuroraBackground', () => {
  it('renders without throwing', () => {
    mockMatchMedia(false);
    expect(() => render(<AuroraBackground />)).not.toThrow();
  });

  it('produces a root element with the aurora-bg className and test id', () => {
    mockMatchMedia(false);
    const { getByTestId } = render(<AuroraBackground />);
    const root = getByTestId('aurora-bg');
    expect(root).toBeInTheDocument();
    expect(root).toHaveClass('aurora-bg');
  });

  it('renders the drifting aurora blobs', () => {
    mockMatchMedia(false);
    const { container } = render(<AuroraBackground />);
    const blobs = container.querySelectorAll('.aurora-bg__blob');
    expect(blobs.length).toBeGreaterThanOrEqual(4);
  });

  it('renders a particle canvas when motion is allowed', () => {
    mockMatchMedia(false);
    const { container } = render(<AuroraBackground />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  describe('prefers-reduced-motion: reduce', () => {
    it('still renders the static variant', () => {
      mockMatchMedia(true);
      const { getByTestId } = render(<AuroraBackground />);
      const root = getByTestId('aurora-bg');
      expect(root).toBeInTheDocument();
      expect(root).toHaveAttribute('data-reduced-motion', 'true');
    });

    it('does not render the canvas or start a rAF loop', () => {
      mockMatchMedia(true);
      const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');
      const { container } = render(<AuroraBackground />);
      expect(container.querySelector('canvas')).toBeNull();
      expect(rafSpy).not.toHaveBeenCalled();
    });
  });

  describe('animation loop lifecycle', () => {
    it('starts a rAF loop when motion is allowed', () => {
      mockMatchMedia(false);
      stubCanvas2dContext();
      const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');
      render(<AuroraBackground />);
      expect(rafSpy).toHaveBeenCalled();
    });

    it('cancels the animation frame on unmount', () => {
      mockMatchMedia(false);
      stubCanvas2dContext();
      const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
      const { unmount } = render(<AuroraBackground />);
      unmount();
      expect(cancelSpy).toHaveBeenCalled();
    });

    it('unmounts cleanly without throwing', () => {
      mockMatchMedia(false);
      const { unmount } = render(<AuroraBackground />);
      expect(() => unmount()).not.toThrow();
    });
  });
});
