// web/src/canvas/panels/ConnectPanel.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const connectIntegration = vi.fn();
vi.mock('../../integrations/integrationsApi', () => ({ connectIntegration: (t: string, p: string) => connectIntegration(t, p) }));

import { ConnectPanel } from './ConnectPanel';

beforeEach(() => { vi.useFakeTimers(); connectIntegration.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe('ConnectPanel', () => {
  it('shows the provider name and reason', () => {
    render(<ConnectPanel provider="slack" reason="post to your team" token="t" onClose={() => {}} />);
    expect(screen.getByTestId('connect-panel')).toBeInTheDocument();
    expect(screen.getByText(/connect slack/i)).toBeInTheDocument();
    expect(screen.getByText(/post to your team/i)).toBeInTheDocument();
  });

  it('Connect calls connectIntegration and, on success, signals + closes', async () => {
    connectIntegration.mockResolvedValue({ ok: true, provider: 'slack' });
    const onClose = vi.fn();
    const evt = vi.fn();
    window.addEventListener('nicole:integrations-updated', evt);
    render(<ConnectPanel provider="slack" token="t" onClose={onClose} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /connect slack/i })); });
    expect(connectIntegration).toHaveBeenCalledWith('t', 'slack');
    expect(evt).toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(onClose).toHaveBeenCalled();
    window.removeEventListener('nicole:integrations-updated', evt);
  });

  it('the ✕ closes immediately', () => {
    const onClose = vi.fn();
    render(<ConnectPanel provider="slack" token="t" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/dismiss/i));
    expect(onClose).toHaveBeenCalled();
  });

  it('auto-dismisses after 10s of no interaction', () => {
    const onClose = vi.fn();
    render(<ConnectPanel provider="slack" token="t" onClose={onClose} />);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(onClose).toHaveBeenCalled();
  });

  it('hover pauses the 10s timer (does not close while hovered)', () => {
    const onClose = vi.fn();
    render(<ConnectPanel provider="slack" token="t" onClose={onClose} />);
    const card = screen.getByTestId('connect-panel');
    act(() => { vi.advanceTimersByTime(6000); });
    fireEvent.mouseEnter(card);
    act(() => { vi.advanceTimersByTime(30000); });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseLeave(card);            // resets to a fresh 10s
    act(() => { vi.advanceTimersByTime(9000); });
    expect(onClose).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(onClose).toHaveBeenCalled();
  });
});
