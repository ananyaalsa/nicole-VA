import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MicControls } from './MicControls';

afterEach(() => cleanup());

describe('MicControls', () => {
  const base = { ready: true, micOn: true, onToggleMic: vi.fn(), aiMuted: false, onToggleAiMute: vi.fn() };

  it('shows "Connecting…" and disables the mic toggle until ready', () => {
    render(<MicControls {...base} ready={false} />);
    expect(screen.getByTestId('mic-status').textContent).toMatch(/connecting/i);
    expect(screen.getByTestId('mic-toggle')).toBeDisabled();
  });

  it('shows "Listening" when ready and mic on', () => {
    render(<MicControls {...base} ready micOn />);
    expect(screen.getByTestId('mic-status').textContent).toMatch(/listening/i);
    expect(screen.getByTestId('mic-toggle')).not.toBeDisabled();
  });

  it('shows "Mic off" when ready but mic muted', () => {
    render(<MicControls {...base} ready micOn={false} />);
    expect(screen.getByTestId('mic-status').textContent).toMatch(/mic off/i);
  });

  it('toggles mic and AI-mute via their buttons', () => {
    const onToggleMic = vi.fn();
    const onToggleAiMute = vi.fn();
    render(<MicControls {...base} onToggleMic={onToggleMic} onToggleAiMute={onToggleAiMute} />);
    fireEvent.click(screen.getByTestId('mic-toggle'));
    fireEvent.click(screen.getByTestId('ai-mute-toggle'));
    expect(onToggleMic).toHaveBeenCalled();
    expect(onToggleAiMute).toHaveBeenCalled();
  });

  it('reflects the AI-muted state on the mute button', () => {
    render(<MicControls {...base} aiMuted />);
    expect(screen.getByTestId('ai-mute-toggle')).toHaveAttribute('aria-pressed', 'true');
  });
});
