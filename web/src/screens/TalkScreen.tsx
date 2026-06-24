import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { AuraState } from '../components/NicoleAura';
import { Transcript } from '../components/Transcript';
import { CameraPreview } from '../components/CameraPreview';
import { Icon } from '../components/Icon';
import { ProfilePanel } from '../components/ProfilePanel';
import { useNicoleSession } from '../engine/useNicoleSession';
import { useCamera } from '../engine/useCamera';
import { useUiCommands } from '../engine/useUiCommands';
import { useAuth } from '../auth/AuthContext';
import { VOICES, DEFAULT_VOICE } from '../audio/voices';
import './TalkScreen.css';

const SPEAKING_AMP = 0.06;

const WAVE_LAYERS = [
  { color: 'rgba(80,70,229,0.10)',  speed: 0.003, amp: 38, freq: 0.018, offset: 0 },
  { color: 'rgba(236,72,153,0.07)', speed: 0.002, amp: 28, freq: 0.024, offset: 2.1 },
  { color: 'rgba(16,185,129,0.06)', speed: 0.0015, amp: 20, freq: 0.030, offset: 4.3 },
];

function WaveBackdrop({ state }: { state: AuraState }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const tRef = useRef(0);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const resize = () => { canvas.width = canvas.offsetWidth * window.devicePixelRatio; canvas.height = canvas.offsetHeight * window.devicePixelRatio; ctx.scale(window.devicePixelRatio, window.devicePixelRatio); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    const draw = () => {
      const W = canvas.offsetWidth; const H = canvas.offsetHeight;
      ctx.clearRect(0, 0, W, H);
      const t = tRef.current;
      const e = state === 'speaking' ? 1.8 : state === 'listening' ? 1.3 : 1.0;
      for (const layer of WAVE_LAYERS) {
        ctx.beginPath();
        const baseY = H * 0.38; ctx.moveTo(0, baseY);
        for (let x = 0; x <= W; x += 3) {
          const y = baseY + Math.sin(x * layer.freq + t * layer.speed * 60 + layer.offset) * layer.amp * e + Math.sin(x * layer.freq * 0.5 + t * layer.speed * 40 + layer.offset) * layer.amp * 0.4 * e;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
        ctx.fillStyle = layer.color; ctx.fill();
      }
      tRef.current += 0.016;
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [state]);
  return <canvas ref={ref} className="wave-canvas" aria-hidden="true" />;
}

export interface TalkScreenProps {
  onTrain?: () => void;
  onRoleplay?: () => void;
  /** Nicole switches screens by voice (switch_mode tool). */
  onSwitchMode?: (mode: 'talk' | 'training' | 'roleplay') => void;
  defaultVoice?: string;
}

const STARTERS = [
  'Practice a cold open with a tough prospect',
  'Walk me through handling a pricing objection',
  'Ask me anything about real estate sales',
];

export function TalkScreen({ onTrain, onRoleplay, onSwitchMode, defaultVoice }: TalkScreenProps): JSX.Element {
  const { user, token } = useAuth();
  const [voice, setVoice] = useState<string>(defaultVoice ?? DEFAULT_VOICE);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [aiMuted, setAiMuted] = useState(false);
  const [systemOverlay, setSystemOverlay] = useState<string | undefined>(undefined);

  // Load user memory once on mount and build Nicole's system context.
  useEffect(() => {
    if (!token || !user) return;
    fetch('/api/memory', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data: { facts: Array<{ key: string; fact: string }> }) => {
        const get = (k: string) => data.facts?.find((f) => f.key === k)?.fact ?? '';
        const about = get('user_about');
        const phone = get('user_phone');
        const goalsRaw = get('user_goals');
        let goals: string[] = [];
        try { goals = JSON.parse(goalsRaw); } catch { if (goalsRaw) goals = [goalsRaw]; }

        const lines: string[] = [
          `The user's name is ${user.displayName}.`,
          `Their email is ${user.email}.`,
          phone  ? `Their phone number is ${phone}.` : '',
          about  ? `About them: ${about}` : '',
          goals.length ? `Their goals: ${goals.join(', ')}.` : '',
          'Always address them by their first name. Use this context naturally in conversation — never recite it robotically.',
        ].filter(Boolean);

        setSystemOverlay(lines.join(' '));
      })
      .catch(() => {
        // Fallback: at minimum tell Nicole the user's name.
        setSystemOverlay(`The user's name is ${user.displayName}. Their email is ${user.email}.`);
      });
  }, [token, user]);

  const stylePrompt = useMemo(() => VOICES.find((v) => v.name === voice)?.stylePrompt, [voice]);

  // Nicole controls the UI by voice — every command is registered in one place.
  const { onToolCall } = useUiCommands({
    set_camera: (a) => { if (a.on) void camera.start(); else camera.stop(); },
    switch_mode: (a) => { const m = a.mode; if (m === 'talk' || m === 'training' || m === 'roleplay') onSwitchMode?.(m); },
    set_voice: (a) => { if (typeof a.voiceName === 'string') changeVoice(a.voiceName); },
    mute_ai: (a) => setAiMuted(!!a.muted),
    mute_mic: (a) => { if (!!a.muted === micOn) toggleMic(); },
    end_session: () => { camera.stop(); stop(); },
  });

  const session = useNicoleSession({ voiceName: voice, mode: 'talk', stylePrompt, systemOverlay, aiMuted, onToolCall });
  const { connected, micOn, transcript, amplitude, start, stop, toggleMic } = session;

  const camera = useCamera({ onFrame: session.sendVideoFrame });
  const teardownRef = useRef<() => void>(() => {});
  teardownRef.current = () => { camera.stop(); stop(); };
  useEffect(() => () => teardownRef.current(), []);

  const changeVoice = (name: string) => {
    setVoice(name);
    if (connected) session.setVoice(name);
  };

  const speaking = amplitude > SPEAKING_AMP;
  const auraState: AuraState = speaking ? 'speaking' : connected && micOn ? 'listening' : 'idle';

  const activeVoice = VOICES.find((v) => v.name === voice);
  const femaleVoices = VOICES.filter((v) => v.gender === 'female');
  const maleVoices   = VOICES.filter((v) => v.gender === 'male');
  const avatarSrc = activeVoice?.gender === 'male' ? '/nicole-avatar-male.png' : '/nicole-avatar.png';
  const userInitial = user?.displayName?.trim().charAt(0).toUpperCase() ?? '?';

  return (
    <div className="talk-screen" data-testid="talk-screen" data-state={auraState}>

      <header className="talk-topbar">
        <div className="topbar-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="topbar-brand-name">Nicole</span>
        </div>
        <nav className="topbar-nav" aria-label="Mode navigation">
          <button type="button" className="topbar-nav-item is-active" aria-current="page">Talk</button>
          {onTrain    && <button type="button" className="topbar-nav-item" onClick={onTrain}>Training</button>}
          {onRoleplay && <button type="button" className="topbar-nav-item" onClick={onRoleplay}>Roleplay</button>}
        </nav>
        <div className="topbar-right">
          <span className={`status-chip status-${auraState}`}>
            <span className="status-dot" aria-hidden="true" />
            <span className="status-text">{connected ? (speaking ? 'Speaking' : micOn ? 'Listening' : 'Ready') : 'Ready'}</span>
          </span>
          <button type="button" className={`ctrl-btn ctrl-btn--cam${camera.on ? ' is-active' : ''}`} data-testid="camera-button" onClick={() => (camera.on ? camera.stop() : void camera.start())} title="Camera">
            <Icon name="camera" size={16} />
          </button>
          <button type="button" className="topbar-avatar-btn" onClick={() => setProfileOpen(true)} aria-label="Open profile" title={user?.displayName ?? 'Profile'}>
            {userInitial}
          </button>
        </div>
      </header>

      {camera.error && <p className="camera-error" role="alert">{camera.error}</p>}

      <div className="talk-body">
        <aside className="talk-presence">
          <div className={`presence-avatar presence-avatar--state-${auraState}`} data-testid="nicole-aura">
            <img src={avatarSrc} alt={activeVoice?.gender === 'male' ? 'Male voice avatar' : 'Nicole'} className="presence-img" />
          </div>
          <p className="presence-state">{connected ? (auraState === 'idle' ? 'Your Personal VA' : auraState === 'listening' ? 'Listening...' : 'Speaking') : 'Your Personal VA'}</p>

          <div className="voice-selector">
            <button type="button" className="voice-current-btn" data-testid="voice-switcher" onClick={() => setVoiceOpen((o) => !o)} aria-expanded={voiceOpen}>
              <span className="voice-current-name">{voice}</span>
              <span className="voice-current-label">{activeVoice?.label ?? ''}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {voiceOpen && (
              <div className="voice-dropdown" role="listbox" aria-label="Select voice">
                <div className="voice-dropdown-group">
                  <span className="voice-dropdown-gender">Female</span>
                  {femaleVoices.map((v) => (
                    <button key={v.name} role="option" aria-selected={v.name === voice} className={`voice-option${v.name === voice ? ' is-active' : ''}`} data-testid="voice-option" onClick={() => { setVoice(v.name); setVoiceOpen(false); if (connected) session.setVoice(v.name); }} type="button">
                      <span className="voice-option-name">{v.name}</span>
                      <span className="voice-option-label">{v.label}</span>
                    </button>
                  ))}
                </div>
                <div className="voice-dropdown-group">
                  <span className="voice-dropdown-gender">Male</span>
                  {maleVoices.map((v) => (
                    <button key={v.name} role="option" aria-selected={v.name === voice} className={`voice-option${v.name === voice ? ' is-active' : ''}`} data-testid="voice-option" onClick={() => { setVoice(v.name); setVoiceOpen(false); if (connected) session.setVoice(v.name); }} type="button">
                      <span className="voice-option-name">{v.name}</span>
                      <span className="voice-option-label">{v.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        <section className="talk-conversation">
          <WaveBackdrop state={auraState} />
          {transcript.length === 0 ? (
            <div className="talk-empty">
              <h2 className="talk-empty__heading">Ready when you are</h2>
              <p className="talk-empty__sub">Start a session or pick one of these to get going</p>
              <div className="talk-empty__starters">
                {STARTERS.map((s) => (
                  <button key={s} type="button" className="starter-card" onClick={() => void start()}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="conversation-feed">
              <div className="chat-messages">
                {transcript.map((line) => (
                  <div key={line.id} className={`chat-bubble chat-bubble--${line.speaker === 'you' ? 'user' : 'nicole'}`}>
                    <span className="chat-who">{line.speaker === 'you' ? 'You' : 'Nicole'}</span>
                    <p className="chat-text">{line.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="talk-controls">
            {!connected ? (
              <button type="button" className="talk-start-btn" onClick={() => void start()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Start talking
              </button>
            ) : (
              <div className="live-controls">
                <button type="button" className={`ctrl-btn ctrl-btn--mic${!micOn ? ' is-muted' : ''}`} data-testid="mute-mic-button" onClick={toggleMic} aria-pressed={micOn ? false : true} title={micOn ? 'Mute your mic' : 'Unmute your mic'}>
                  <Icon name={micOn ? 'mic' : 'mic-off'} size={18} />
                  <span className="control-btn__label">{micOn ? 'Mute' : 'Unmute'}</span>
                </button>
                <button type="button" className={`ctrl-btn ctrl-btn--cam${camera.on ? ' is-active' : ''}`} data-testid="camera-button" onClick={() => (camera.on ? camera.stop() : void camera.start())} title={camera.on ? 'Turn off camera' : 'Let Nicole see you'}>
                  <Icon name="camera" size={18} />
                  <span className="control-btn__label">{camera.on ? 'Camera on' : 'Camera'}</span>
                </button>
                <button type="button" className={`ctrl-btn ctrl-btn--ai${aiMuted ? ' is-muted' : ''}`} data-testid="mute-ai-button" onClick={() => setAiMuted((m) => !m)} aria-pressed={aiMuted ? true : false} title={aiMuted ? "Unmute Nicole's voice" : "Mute Nicole's voice"}>
                  <Icon name={aiMuted ? 'mic-off' : 'mic'} size={18} />
                  <span className="control-btn__label">{aiMuted ? 'Unmute Nicole' : 'Mute Nicole'}</span>
                </button>
                <button type="button" className="ctrl-btn ctrl-btn--end" onClick={() => { camera.stop(); stop(); }} title="End session">
                  <Icon name="end" size={18} />
                  <span className="control-btn__label">End</span>
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {camera.on && (
        <div className="camera-corner">
          <CameraPreview stream={camera.stream} onClose={camera.stop} />
        </div>
      )}

      <ProfilePanel open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}

export default TalkScreen;
