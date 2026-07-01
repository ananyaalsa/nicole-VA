// web/src/canvas/resultDeck/OverlayFrame.test.tsx
import { render, screen, act } from '@testing-library/react';
import { OverlayFrame } from './OverlayFrame';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it('collapses after 10s', () => {
  const onCollapse = vi.fn();
  render(<OverlayFrame label="Top news" icon="📰" onCollapse={onCollapse} onDismiss={() => {}}><p>body</p></OverlayFrame>);
  expect(screen.getByText('body')).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(10000); });
  expect(onCollapse).toHaveBeenCalledTimes(1);
});

it('✕ dismisses', () => {
  const onDismiss = vi.fn();
  render(<OverlayFrame label="Top news" icon="📰" onCollapse={() => {}} onDismiss={onDismiss}><p>body</p></OverlayFrame>);
  screen.getByLabelText('Dismiss Top news').click();
  expect(onDismiss).toHaveBeenCalledTimes(1);
});
