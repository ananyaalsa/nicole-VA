// web/src/canvas/CanvasHost.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('./panels/registry', () => ({
  PANELS: {
    integrations: () => <div data-testid="p-integrations">I</div>,
    note: () => { throw new Error('boom'); },
    connect: () => <div>C</div>,
  },
}));
import { CanvasHost } from './CanvasHost';

describe('CanvasHost', () => {
  it('renders idle children when there are no panels', () => {
    render(<CanvasHost panels={[]} token="t" onClose={() => {}}><div data-testid="idle">home</div></CanvasHost>);
    expect(screen.getByTestId('idle')).toBeInTheDocument();
  });
  it('renders open panels alongside — NOT instead of — the children (fix D: deck stays mounted)', () => {
    // The children include the ResultDeck (represented here by data-testid="deck").
    // Opening a panel must NOT unmount them — the deck's overlays/pills persist.
    render(
      <CanvasHost panels={[{ key: 'integrations', type: 'integrations' }]} token="t" onClose={() => {}}>
        <div data-testid="deck" />
      </CanvasHost>,
    );
    expect(screen.getByTestId('p-integrations')).toBeInTheDocument();
    // Deck children are STILL mounted with a panel open (previously they were unmounted).
    expect(screen.getByTestId('deck')).toBeInTheDocument();
  });
  it('a crashing panel is contained by the error boundary', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CanvasHost panels={[{ key: 'note', type: 'note' }]} token="t" onClose={() => {}} />);
    expect(screen.getByText(/didn't load/i)).toBeInTheDocument();
    spy.mockRestore();
  });
});
