// web/src/canvas/resultDeck/ResultDeck.test.tsx
import { render, screen } from '@testing-library/react';
import { ResultDeck } from './ResultDeck';
import type { ResultItem } from './resultTypes';

vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ token: 't' }) }));

const wxItem: ResultItem = { id: 'r1', kind: 'weather', label: 'Weather · Chicago', icon: '☀️', state: 'overlay',
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
