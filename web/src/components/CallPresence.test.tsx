import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallPresence } from './CallPresence';

describe('CallPresence', () => {
  it('shows the name + status and a speaking cue when speaking', () => {
    const { rerender } = render(<CallPresence name="Marcus" status="Cold call" live />);
    expect(screen.getByText('Marcus')).toBeInTheDocument();
    expect(screen.getByText('Cold call')).toBeInTheDocument();
    expect(screen.getByTestId('call-presence').className).not.toContain('is-speaking');

    rerender(<CallPresence name="Marcus" status="Cold call" live speaking />);
    expect(screen.getByTestId('call-presence').className).toContain('is-speaking');
    expect(screen.getByText('Marcus is speaking…')).toBeInTheDocument();
  });

  it('falls back to the initial when no avatar image is given', () => {
    render(<CallPresence name="Nicole" status="Coaching" avatarSrc="/nicole-avatar.png" />);
    // image path used
    expect(screen.getByTestId('call-presence').querySelector('img')?.getAttribute('src')).toBe('/nicole-avatar.png');
  });
});
