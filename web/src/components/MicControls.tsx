import type { JSX } from 'react';
import { Icon } from './Icon';
import './MicControls.css';

export interface MicControlsProps {
  /** Whether the session will actually accept mic audio yet (Gemini setupComplete). */
  ready: boolean;
  /** Is the user's mic currently on. */
  micOn: boolean;
  /** Toggle the user's mic. */
  onToggleMic: () => void;
  /** Is the AI's voice muted. */
  aiMuted: boolean;
  /** Toggle muting the AI's voice. */
  onToggleAiMute: () => void;
}

/**
 * Shared live-call controls for Training + Roleplay: a "mic connecting → listening"
 * status pill (so the user knows when their voice is actually being heard and
 * doesn't lose their first words), a manual mic on/off button, and a manual
 * mute-AI button. Both buttons are always available so the user is in control.
 */
export function MicControls({
  ready, micOn, onToggleMic, aiMuted, onToggleAiMute,
}: MicControlsProps): JSX.Element {
  // The mic is "live" (your voice is heard) only when the session is ready AND
  // the mic is on. Until ready, show a connecting state so the user waits.
  const micLive = ready && micOn;
  const micStatus = !ready ? 'connecting' : micOn ? 'live' : 'off';
  const micLabel = !ready ? 'Connecting…' : micOn ? 'Listening' : 'Mic off';

  return (
    <div className="mic-controls" data-testid="mic-controls" data-mic-status={micStatus}>
      <span
        className={`mic-status mic-status--${micStatus}`}
        data-testid="mic-status"
        aria-live="polite"
      >
        <span className={`mic-status__dot${micLive ? ' is-live' : ''}`} aria-hidden="true" />
        {micLabel}
      </span>

      <button
        type="button"
        className={`mic-ctrl-btn${micOn ? '' : ' is-off'}`}
        data-testid="mic-toggle"
        onClick={onToggleMic}
        disabled={!ready}
        aria-pressed={micOn ? 'true' : 'false'}
        aria-label={micOn ? 'Mute your microphone' : 'Unmute your microphone'}
        title={!ready ? 'Mic is connecting…' : micOn ? 'Mute your mic' : 'Unmute your mic'}
      >
        <Icon name={micOn ? 'mic' : 'mic-off'} size={18} />
      </button>

      <button
        type="button"
        className={`mic-ctrl-btn${aiMuted ? ' is-off' : ''}`}
        data-testid="ai-mute-toggle"
        onClick={onToggleAiMute}
        aria-pressed={aiMuted ? 'true' : 'false'}
        aria-label={aiMuted ? 'Unmute the AI voice' : 'Mute the AI voice'}
        title={aiMuted ? 'Unmute the voice' : 'Mute the voice'}
      >
        <Icon name={aiMuted ? 'speaker-off' : 'speaker'} size={18} />
      </button>
    </div>
  );
}

export default MicControls;
