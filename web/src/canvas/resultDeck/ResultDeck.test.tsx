// web/src/canvas/resultDeck/ResultDeck.test.tsx
import { render, screen, act } from '@testing-library/react';
import { ResultDeck, PresenterBoundary } from './ResultDeck';
import type { ResultItem } from './resultTypes';

vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ token: 't' }) }));

const wxItem: ResultItem = { id: 'r1', kind: 'weather', label: 'Weather · Chicago', icon: '☀️', state: 'overlay', version: 1,
  payload: { place: 'Chicago', tempC: 26, feelsC: 30, condition: 'Clear sky', icon: '☀️', forecast: [] } };

it('renders an overlay for an overlay-state item', () => {
  render(<ResultDeck items={[wxItem]} onCollapse={() => {}} onExpand={() => {}} onDismiss={() => {}} />);
  expect(screen.getByTestId('result-overlay')).toBeInTheDocument();
  expect(screen.getByText('Chicago')).toBeInTheDocument();
});

it('renders a pill for a pill-state item and expands on click', () => {
  const onExpand = vi.fn();
  render(<ResultDeck items={[{ ...wxItem, state: 'pill' }]} onCollapse={() => {}} onExpand={onExpand} onDismiss={() => {}} />);
  const pill = screen.getByRole('button', { name: /Weather · Chicago/ });
  pill.click();
  expect(onExpand).toHaveBeenCalledWith('r1');
});

function Thrower(): never { throw new Error('boom'); }
function Fine() { return <p>ok</p>; }

it('PresenterBoundary recovers once resetKey (item.version) changes, even with the same item id', () => {
  const { rerender } = render(
    <PresenterBoundary resetKey="1"><Thrower /></PresenterBoundary>,
  );
  expect(screen.getByText(/something went wrong|try again|error/i)).toBeInTheDocument();

  // same resetKey (version unchanged) — a crashed singleton must NOT recover yet.
  rerender(<PresenterBoundary resetKey="1"><Fine /></PresenterBoundary>);
  expect(screen.queryByText('ok')).not.toBeInTheDocument();

  // resetKey bumps (item.version bumped by a fresh push) — boundary must recover.
  rerender(<PresenterBoundary resetKey="2"><Fine /></PresenterBoundary>);
  expect(screen.getByText('ok')).toBeInTheDocument();
});

it('re-arms the auto-collapse timer when a re-push bumps item.version (fix F)', () => {
  vi.useFakeTimers();
  try {
    const onCollapse = vi.fn();
    // Same id, version 1 → overlay mounts, timer armed.
    const { rerender } = render(
      <ResultDeck items={[wxItem]} onCollapse={onCollapse} onExpand={() => {}} onDismiss={() => {}} />,
    );
    // Advance 6s (not yet collapsed).
    act(() => { vi.advanceTimersByTime(6000); });
    expect(onCollapse).not.toHaveBeenCalled();
    // A re-push arrives: SAME id, bumped version → OverlayFrame remounts (key is
    // `id:version`) and the timer is re-armed from zero.
    rerender(
      <ResultDeck items={[{ ...wxItem, version: 2 }]} onCollapse={onCollapse} onExpand={() => {}} onDismiss={() => {}} />,
    );
    // 6s more (total 12s from first mount, but only 6s since re-arm) → still open.
    act(() => { vi.advanceTimersByTime(6000); });
    expect(onCollapse).not.toHaveBeenCalled();
    // 4s more (10s since the re-arm) → the re-armed timer fires.
    act(() => { vi.advanceTimersByTime(4000); });
    expect(onCollapse).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
