// web/src/canvas/resultDeck/ResultDeck.test.tsx
import { render, screen } from '@testing-library/react';
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
