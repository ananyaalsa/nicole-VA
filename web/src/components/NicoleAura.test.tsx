import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NicoleAura } from './NicoleAura';

describe('NicoleAura', () => {
  it('renders its children inside the aura', () => {
    render(
      <NicoleAura amplitude={0} state="idle">
        <div data-testid="child">x</div>
      </NicoleAura>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('reflects the conversational state on the root', () => {
    render(<NicoleAura state="listening" />);
    expect(screen.getByTestId('nicole-aura')).toHaveAttribute('data-state', 'listening');
  });

  it('does not throw on a loud amplitude spike', () => {
    expect(() => render(<NicoleAura amplitude={5} state="speaking" />)).not.toThrow();
  });
});
