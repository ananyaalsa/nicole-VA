import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import AuroraBackground from '../components/AuroraBackground';
import { NicoleAura, type AuraState } from '../components/NicoleAura';
import { NicoleAvatar } from '../avatar/NicoleAvatar';
import { Transcript } from '../components/Transcript';
import { VoiceSwitcher } from '../components/VoiceSwitcher';
import { useNicoleSession } from '../engine/useNicoleSession';
import { VOICES, DEFAULT_VOICE } from '../audio/voices';
import './TalkScreen.css';

/** Amplitude above which we treat Nicole as actively speaking (for the aura). */
const SPEAKING_AMP = 0.06;

export interface TalkScreenProps {
  /** Switch to training mode. */
  onTrain?: () => void;
}

/**
 * The main talk experience: Nicole's living aura + avatar centered in an
 * atmospheric space, with a live transcript, voice switcher, and a single
 * talk/mute control. Everything reacts to her real voice amplitude.
 */
export function TalkScreen({ onTrain }: TalkScreenProps): JSX.Element {
  const [voice, setVoice] = useState<string>(DEFAULT_VOICE);
  const stylePrompt = useMemo(
    () => VOICES.find((v) => v.name === voice)?.stylePrompt,
    [voice],
  );

  const session = useNicoleSession({ voiceName: voice, mode: 'talk', stylePrompt });
  const { connected, micOn, transcript, amplitude, start, stop, toggleMic } = session;

  // Clean teardown on unmount so leaving the screen never leaks audio/sockets.
  useEffect(() => () => stop(), [stop]);

  const speaking = amplitude > SPEAKING_AMP;
  const auraState: AuraState = speaking ? 'speaking' : connected && micOn ? 'listening' : 'idle';

  const handleVoiceChange = (name: string) => {
    setVoice(name);
    if (connected) session.setVoice(name);
  };

  return (
    <div className="talk-screen" data-testid="talk-screen">
      <AuroraBackground />

      <header className="talk-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Nicole</span>
        </div>
        <div className="talk-header-actions">
          <span className={`status-dot status-${auraState}`} aria-hidden="true" />
          <span className="status-text">
            {auraState === 'speaking' ? 'Speaking' : auraState === 'listening' ? 'Listening' : connected ? 'Ready' : 'Offline'}
          </span>
          {onTrain && (
            <button type="button" className="ghost-btn" onClick={onTrain}>
              Training
            </button>
          )}
        </div>
      </header>

      <main className="talk-stage">
        <div className="stage-avatar">
          <NicoleAura amplitude={amplitude} state={auraState}>
            <NicoleAvatar amplitude={amplitude} speaking={speaking} />
          </NicoleAura>
        </div>

        <aside className="stage-side">
          <Transcript lines={transcript} maxRendered={120} />
          <VoiceSwitcher value={voice} onChange={handleVoiceChange} />
        </aside>
      </main>

      <footer className="talk-controls">
        {!connected ? (
          <button type="button" className="primary-btn talk-btn" onClick={() => void start()}>
            <span className="talk-btn-dot" aria-hidden="true" />
            Start talking
          </button>
        ) : (
          <>
            <button
              type="button"
              className={`control-btn${micOn ? ' is-on' : ' is-off'}`}
              onClick={toggleMic}
              aria-pressed={micOn}
            >
              {micOn ? 'Mute' : 'Unmute'}
            </button>
            <button type="button" className="control-btn is-end" onClick={stop}>
              End
            </button>
          </>
        )}
      </footer>
    </div>
  );
}

export default TalkScreen;
