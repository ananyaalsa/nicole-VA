import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { NicoleAvatar } from './NicoleAvatar';

afterEach(() => {
  cleanup();
});

describe('NicoleAvatar', () => {
  it('renders an <svg> element', () => {
    const { container } = render(<NicoleAvatar />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 200 240');
  });

  it('exposes an accessible label identifying Nicole', () => {
    const { container } = render(<NicoleAvatar />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toMatch(/nicole/i);
  });

  it('does not throw when speaking with high amplitude', () => {
    expect(() => {
      render(<NicoleAvatar speaking amplitude={0.95} />);
    }).not.toThrow();
  });

  it('does not throw when amplitude exceeds 1', () => {
    expect(() => {
      render(<NicoleAvatar speaking amplitude={5} />);
    }).not.toThrow();
  });

  it('reflects the speaking prop on the svg', () => {
    const { container } = render(<NicoleAvatar speaking amplitude={0.8} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('data-speaking')).toBe('true');
  });

  it('unmounts cleanly without throwing', () => {
    const { unmount } = render(<NicoleAvatar speaking amplitude={0.7} />);
    expect(() => unmount()).not.toThrow();
  });

  it('mounts and unmounts repeatedly without throwing (timer/raf cleanup)', () => {
    expect(() => {
      for (let i = 0; i < 5; i++) {
        const { unmount } = render(<NicoleAvatar speaking amplitude={0.5} />);
        unmount();
      }
    }).not.toThrow();
  });
});
