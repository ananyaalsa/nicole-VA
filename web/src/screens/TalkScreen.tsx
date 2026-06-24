import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import AuroraBackground from '../components/AuroraBackground';
import { NicoleAura, type AuraState } from '../components/NicoleAura';
import { NicolePresence } from '../components/NicolePresence';

// The 3D avatar pulls in three.js / r3f — load it lazily so the WebGL bundle
// is split out and the still can show instantly while it streams in.
const SophiaAvatar = lazy(() => import('../avatar3d/SophiaAvatar'));
import { Transcript } from '../components/Transcript';
import { VoiceSwitcher } from '../components/VoiceSwitcher';
import { CameraPreview } from '../components/CameraPreview';
import { useNicoleSession } from '../engine/useNicoleSession';
import { useCamera } from '../engine/useCamera';
import { VOICES, DEFAULT_VOICE } from '../audio/voices';
import './TalkScreen.css';

/** Amplitude above which we treat Nicole as actively speaking (for the aura). */
const SPEAKING_AMP = 0.06;

export interface TalkScreenProps {
  /** Switch to training mode. */
  onTrain?: () => void;
  /** Switch to roleplay mode. */
  onRoleplay?: () => void;
}

/** Status copy + glyph for each console state. */
const STATUS_META: Record<AuraState, { label: string; code: string }> = {
  idle: { label: 'Standby', code: 'STBY' },
  listening: { label: 'Listening', code: 'LSTN' },
  speaking: { label: 'Speaking', code: 'SPKG' },
};

/**
 * The main talk experience, staged as a mission console on the wireframe
 * terrain. The live transcript runs down a fixed-height console rail on the
 * LEFT (so its scrolling is contained), Nicole's living aura + avatar hold the
 * center stage, and voice selection + the connection state sit on the right.
 * Everything reacts to her real voice amplitude.
 */
export function TalkScreen({ onTrain, onRoleplay }: TalkScreenProps): JSX.Element {
  const [voice, setVoice] = useState<string>(DEFAULT_VOICE);
  const stylePrompt = useMemo(
    () => VOICES.find((v) => v.name === voice)?.stylePrompt,
    [voice],
  );

  const session = useNicoleSession({ voiceName: voice, mode: 'talk', stylePrompt });
  const { connected, micOn, transcript, amplitude, start, stop, toggleMic } = session;

  // Camera / vision: while on, stream ~1 frame/sec to Nicole so she can see.
  const sendVideoFrame = session.sendVideoFrame;
  const camera = useCamera({ onFrame: sendVideoFrame });

  // Clean teardown on unmount so leaving the screen never leaks audio/sockets.
  useEffect(
    () => () => {
      camera.stop();
      stop();
    },
    [stop, camera],
  );

  const speaking = amplitude > SPEAKING_AMP;
  const auraState: AuraState = speaking ? 'speaking' : connected && micOn ? 'listening' : 'idle';
  const status = STATUS_META[auraState];

  const handleVoiceChange = (name: string) => {
    setVoice(name);
    if (connected) session.setVoice(name);
  };

  return (
    <div className="talk-screen" data-testid="talk-screen" data-state={auraState}>
      <AuroraBackground />

      <header className="talk-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Nicole</span>
          <span className="brand-sub hud-label">Voice&nbsp;Console</span>
        </div>
        <div className="talk-header-actions">
          <span className={`status-chip status-${auraState}`}>
            <span className="status-dot" aria-hidden="true" />
            <span className="status-code">{status.code}</span>
            <span className="status-text">{status.label}</span>
          </span>
          {onTrain && (
            <button type="button" className="ghost-btn" onClick={onTrain}>
              Training
              <span className="ghost-btn-arrow" aria-hidden="true">→</span>
            </button>
          )}
          {onRoleplay && (
            <button type="button" className="ghost-btn" onClick={onRoleplay}>
              Roleplay
              <span className="ghost-btn-arrow" aria-hidden="true">→</span>
            </button>
          )}
          <button
            type="button"
            className={`ghost-btn${camera.on ? ' is-active' : ''}`}
            data-testid="camera-button"
            onClick={() => (camera.on ? camera.stop() : void camera.start())}
            disabled={!connected}
            title={connected ? 'Let Nicole see through your camera' : 'Start talking first'}
          >
            {camera.on ? 'Camera on' : 'Camera'}
          </button>
        </div>
      </header>

      {camera.on && <CameraPreview stream={camera.stream} onFlip={() => void camera.flip()} onClose={camera.stop} />}
      {camera.error && <p className="camera-error" role="alert">{camera.error}</p>}

      <main className="talk-stage">
        {/* LEFT — contained transcript console. */}
        <aside className="stage-rail hud-panel">
          <div className="rail-head">
            <span className="hud-label">Transcript</span>
            <span className="rail-count hud-label">{transcript.length} lines</span>
          </div>
          <div className="rail-body">
            <Transcript lines={transcript} maxRendered={120} />
          </div>
        </aside>

        {/* CENTER — Nicole's living presence. */}
        <section className="stage-avatar">
          <div className="stage-corner stage-corner--tl" aria-hidden="true" />
          <div className="stage-corner stage-corner--tr" aria-hidden="true" />
          <div className="stage-corner stage-corner--bl" aria-hidden="true" />
          <div className="stage-corner stage-corner--br" aria-hidden="true" />
          <NicoleAura amplitude={amplitude} state={auraState}>
            <Suspense fallback={<NicolePresence amplitude={amplitude} speaking={speaking} />}>
              <SophiaAvatar amplitude={amplitude} speaking={speaking} />
            </Suspense>
          </NicoleAura>
          <p className="stage-readout hud-label" aria-live="polite">
            {connected ? status.label : 'Console offline'}
          </p>
        </section>

        {/* RIGHT — voice instrument. */}
        <aside className="stage-side hud-panel">
          <div className="rail-head">
            <span className="hud-label">Voice</span>
          </div>
          <div className="side-body">
            <VoiceSwitcher value={voice} onChange={handleVoiceChange} />
          </div>
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
