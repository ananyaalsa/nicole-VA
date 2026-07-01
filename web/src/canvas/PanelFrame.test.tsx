// web/src/canvas/PanelFrame.test.tsx
import { describe, it, expect, vi } from 'vitest';
import type { JSX } from 'react';
import { render, screen } from '@testing-library/react';
import { PanelFrame } from './PanelFrame';

/** A child that throws on the first render for a given nonce, then renders fine.
 *  Simulates a panel that crashed once (bad data) then reopens with good data. */
function FlakyChild({ shouldThrow }: { shouldThrow: boolean }): JSX.Element {
  if (shouldThrow) throw new Error('boom');
  return <div data-testid="ok">loaded</div>;
}

describe('PanelFrame', () => {
  it('shows the error state when a child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <PanelFrame resetKey={1}>
        <FlakyChild shouldThrow />
      </PanelFrame>,
    );
    expect(screen.getByText(/didn't load/i)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('RECOVERS on reopen — a new resetKey clears the crashed state', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <PanelFrame resetKey={1}>
        <FlakyChild shouldThrow />
      </PanelFrame>,
    );
    expect(screen.getByText(/didn't load/i)).toBeInTheDocument();
    // Reopen (new nonce) with good data — the boundary must reset and render it.
    rerender(
      <PanelFrame resetKey={2}>
        <FlakyChild shouldThrow={false} />
      </PanelFrame>,
    );
    expect(screen.getByTestId('ok')).toBeInTheDocument();
    expect(screen.queryByText(/didn't load/i)).toBeNull();
    spy.mockRestore();
  });
});
