import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { JSX } from 'react';
import type { AuraState } from '../components/NicoleAura';
import { Transcript } from '../components/Transcript';
import { ChatTranscript } from '../components/ChatTranscript';
import { CameraPreview } from '../components/CameraPreview';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { HomePanel } from '../home/HomePanel';
import { ProfilePanel } from '../components/ProfilePanel';
import { MemoryPanel } from '../components/MemoryPanel';
import { useToast } from '../ui/toast';
import { TOOL_TOASTS } from '../ui/toolToasts';
import { WeatherWidget, type WeatherWidgetHandle } from '../weather/WeatherWidget';
import { speakWeather } from '../weather/weatherApi';
import { Live2DCompanion } from '../live2d/Live2DCompanion';
import { loadAvatarPrefs, type AvatarPrefs } from '../live2d/avatars';
import { useNicoleSession } from '../engine/useNicoleSession';
import { useDebouncedSpeaking } from '../engine/useDebouncedSpeaking';
import { useCamera } from '../engine/useCamera';
import { useUiCommands } from '../engine/useUiCommands';
import { makeProfileActions } from '../engine/profileActions';
import { useAuth } from '../auth/AuthContext';
import { fetchLiveStatus } from '../training/scoreApi';
import { VOICES, DEFAULT_VOICE } from '../audio/voices';
import './TalkScreen.css';

const SPEAKING_AMP = 0.06;

// Canvas fillStyle can't read CSS vars — use literal teal-family colors that
// match the Deep Teal theme (deep teal, soft teal, sage).
const WAVE_LAYERS = [
  { color: 'rgba(15,118,110,0.10)',  speed: 0.003, amp: 38, freq: 0.018, offset: 0 },
  { color: 'rgba(94,234,212,0.08)',  speed: 0.002, amp: 28, freq: 0.024, offset: 2.1 },
  { color: 'rgba(132,169,140,0.07)', speed: 0.0015, amp: 20, freq: 0.030, offset: 4.3 },
];

/**
 * Wave backdrop. The animation loop is set up ONCE and reads the live "energy"
 * target from a ref — it is NEVER torn down on state changes. Earlier this took
 * `state` as a prop with `[state]` deps, so every ~60Hz amplitude update
 * rebuilt the whole rAF loop while Nicole spoke → the glitch. Now the parent
 * writes the target into `stateRef`, and an envelope follower eases the actual
 * energy toward it each frame so the wave swells smoothly instead of jumping.
 */
function WaveBackdrop({ stateRef }: { stateRef: React.MutableRefObject<AuraState> }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const tRef = useRef(0);
  const energyRef = useRef(1.0); // smoothed energy, eased toward the target
  useEffect(() => {
    // Respect reduced-motion: skip the animation loop entirely (WCAG).
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const resize = () => { canvas.width = canvas.offsetWidth * window.devicePixelRatio; canvas.height = canvas.offsetHeight * window.devicePixelRatio; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(window.devicePixelRatio, window.devicePixelRatio); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    const draw = () => {
      const W = canvas.offsetWidth; const H = canvas.offsetHeight;
      ctx.clearRect(0, 0, W, H);
      const t = tRef.current;
      // Target energy from the live state ref; ease toward it (envelope follower)
      // so transitions are a gentle swell, never a jump/glitch.
      const target = stateRef.current === 'speaking' ? 1.8 : stateRef.current === 'listening' ? 1.3 : 1.0;
      energyRef.current += (target - energyRef.current) * 0.06;
      const e = energyRef.current;
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
    // Set up ONCE — the loop reads stateRef live; it must not depend on state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <canvas ref={ref} className="wave-canvas" aria-hidden="true" />;
}

export interface TalkScreenProps {
  onTrain?: () => void;
  onRoleplay?: () => void;
  /** Nicole switches screens by voice (switch_mode tool). */
  onSwitchMode?: (mode: 'talk' | 'training' | 'roleplay') => void;
  defaultVoice?: string;
  /** True while another mode (Training/Roleplay) is active and Talk is hidden.
   *  The session stays alive (her sentence finishes); we just pause the mic. */
  backgrounded?: boolean;
}


export function TalkScreen({ onTrain, onRoleplay, onSwitchMode, defaultVoice, backgrounded }: TalkScreenProps): JSX.Element {
  const { user, token, updateUser } = useAuth();
  const [voice, setVoice] = useState<string>(defaultVoice ?? DEFAULT_VOICE);
  const [voiceOpen, setVoiceOpen] = useState(false);
  // Which gender's chips are shown in the compact voice picker.
  const [voiceGender, setVoiceGender] = useState<'female' | 'male'>(
    VOICES.find((v) => v.name === (defaultVoice ?? DEFAULT_VOICE))?.gender === 'male' ? 'male' : 'female',
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [aiMuted, setAiMuted] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  // Live2D companion visibility (persisted), controlled here so the toggle can
  // live inside the controls bar rather than as a floating button.
  const [companionShown, setCompanionShown] = useState<boolean>(() => {
    try { return localStorage.getItem('nicole_companion') !== 'off'; } catch { return true; }
  });
  const toggleCompanion = useCallback(() => {
    setCompanionShown((s) => {
      const next = !s;
      try { localStorage.setItem('nicole_companion', next ? 'on' : 'off'); } catch { /* ignore */ }
      return next;
    });
  }, []);
  // Which avatar (Aria/Noah/Off) + its wardrobe colors, from the user's prefs.
  // Re-read on the 'nicole:avatar-updated' event the Profile panel fires so
  // changes apply live without a reload.
  const [avatarPrefs, setAvatarPrefs] = useState<AvatarPrefs>(() => loadAvatarPrefs());
  useEffect(() => {
    const reload = () => setAvatarPrefs(loadAvatarPrefs());
    window.addEventListener('nicole:avatar-updated', reload);
    return () => window.removeEventListener('nicole:avatar-updated', reload);
  }, []);
  const [systemOverlay, setSystemOverlay] = useState<string | undefined>(undefined);

  // Glass toasts: fire an in-progress toast when Nicole calls an action tool,
  // then resolve it to success/error when the server echoes the tool-result.
  const toast = useToast();
  const toastIdsRef = useRef<Record<string, string>>({});
  // Imperative handle to the weather widget so get_weather can open the dialog.
  const weatherRef = useRef<WeatherWidgetHandle | null>(null);

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
          'Always address them by their first name. Use this context naturally in conversation, never recite it robotically.',
        ].filter(Boolean);

        setSystemOverlay(lines.join(' '));
      })
      .catch(() => {
        // Fallback: at minimum tell Nicole the user's name.
        setSystemOverlay(`The user's name is ${user.displayName}. Their email is ${user.email}.`);
      });
  }, [token, user]);

  const stylePrompt = useMemo(() => VOICES.find((v) => v.name === voice)?.stylePrompt, [voice]);

  // Profile actions Nicole can perform by voice (About / Goals / display name).
  const profile = useMemo(() => makeProfileActions(token, updateUser), [token, updateUser]);

  // Nicole controls the UI by voice — every command is registered in one place.
  const { onToolCall } = useUiCommands({
    set_camera: (a) => { if (a.on) void camera.start(); else camera.stop(); },
    switch_mode: (a) => { const m = a.mode; if (m === 'talk' || m === 'training' || m === 'roleplay') onSwitchMode?.(m); },
    set_voice: (a) => { if (typeof a.voiceName === 'string') changeVoice(a.voiceName); },
    mute_ai: (a) => setAiMuted(!!a.muted),
    mute_mic: (a) => { if (!!a.muted === micOn) toggleMic(); },
    set_volume: (a) => { if (typeof a.level === 'number') session.setVolume(a.level); },
    adjust_volume: (a) => { const amt = typeof a.amount === 'number' ? a.amount : 10; session.adjustVolume(a.direction === 'down' ? -amt : amt); },
    set_mute: (a) => session.setMuted(!!a.muted),
    get_weather: (a) => {
      const loc = typeof a.location === 'string' ? a.location : undefined;
      void weatherRef.current?.open(loc).then((w) => {
        // Feed Nicole the actual reading so she speaks accurate numbers, not a guess.
        if (w) session.sendText(`[WEATHER DATA — read this to the user warmly in one sentence] ${speakWeather(w)} High ${w.forecast[0]?.hiC}, low ${w.forecast[0]?.loC}.`);
        else session.sendText('[WEATHER unavailable — tell the user you could not get their location or the weather right now.]');
      });
    },
    end_session: () => { camera.stop(); stop(); session.clearTranscript(); },
    set_about: (a) => { if (typeof a.text === 'string') void profile.setAbout(a.text); },
    set_goal: (a) => { if ((a.action === 'add' || a.action === 'remove') && typeof a.goal === 'string') void profile.setGoal(a.action, a.goal); },
    set_display_name: (a) => { if (typeof a.name === 'string') void profile.setDisplayName(a.name); },
  });

  // Wrap onToolCall so integration tool calls also raise an in-progress toast,
  // then delegate to the UI-command dispatcher.
  const handleToolCall = useCallback(
    (calls: { name: string; args: Record<string, unknown> }[]) => {
      for (const c of calls) {
        const tt = TOOL_TOASTS[c.name];
        if (tt && !toastIdsRef.current[c.name]) {
          toastIdsRef.current[c.name] = toast.show({ kind: 'progress', text: tt.progress, icon: tt.icon });
        }
      }
      onToolCall?.(calls);
    },
    [onToolCall, toast],
  );

  const handleToolResult = useCallback(
    (r: { name: string; ok: boolean; summary: string }) => {
      const id = toastIdsRef.current[r.name];
      delete toastIdsRef.current[r.name];
      if (id) {
        toast.resolve(id, { kind: r.ok ? 'success' : 'error', text: r.summary, icon: undefined });
      } else {
        toast.show({ kind: r.ok ? 'success' : 'error', text: r.summary });
      }
    },
    [toast],
  );

  const session = useNicoleSession({ voiceName: voice, mode: 'talk', stylePrompt, systemOverlay, aiMuted, onToolCall: handleToolCall, onToolResult: handleToolResult, authToken: token });
  const { connected, micOn, transcript, realtime, amplitude, start, stop, clearTranscript, toggleMic, setMic, volume, muted, setVolume, setMuted } = session;

  // "Connecting" guard so the Start button can't be spam-clicked between the tap
  // and the session going live (each extra click would open another session).
  const [starting, setStarting] = useState(false);
  const beginSession = useCallback(() => {
    if (starting || connected) return;
    setStarting(true);
    void start();
  }, [starting, connected, start]);
  // Once we're live, the guard is no longer needed.
  useEffect(() => { if (connected) setStarting(false); }, [connected]);

  // Mirror sendText in a ref so the [STATUS] effect below never re-fires due to
  // sendText changing reference — the effect deps stay primitive.
  const sendTextRef = useRef(session.sendText);
  sendTextRef.current = session.sendText;

  // When Talk returns to the foreground after Training/Roleplay, send Nicole a
  // silent [STATUS] directive so she knows what the user just did.
  const wasBg = useRef(backgrounded);
  useEffect(() => {
    const cameBack = wasBg.current && !backgrounded;
    wasBg.current = backgrounded;
    if (!cameBack || !connected) return;
    void (async () => {
      const st = await fetchLiveStatus(token ?? undefined);
      if (!st) return;
      const skill = st.skill ? ` (${st.skill})` : '';
      // SILENT context only. The user came back without re-engaging (mic is
      // muted), so Nicole must NOT speak on her own. This tells her what just
      // happened so she has it ready IF the user brings it up — she does not
      // volunteer it. (Previously this made her talk unprompted on return.)
      const facts = st.state === 'finished'
        ? `the user just COMPLETED a ${st.mode}${skill}${typeof st.score === 'number' ? `, scored ${st.score}/10` : ''}`
        : st.state === 'left'
          ? `the user opened a ${st.mode}${skill} and LEFT WITHOUT completing it (do NOT congratulate them on finishing — they did not finish)`
          : st.state === 'active'
            ? `the user is mid-${st.mode}${skill}`
            : `the user opened ${st.mode} but did not start`;
      sendTextRef.current(
        `[STATUS — SILENT CONTEXT, DO NOT RESPOND] For your awareness only: ${facts}. Do NOT say anything now. Stay silent until the user speaks. If they ask about it later, you'll know.`,
      );
    })();
  }, [backgrounded, connected, token]);

  // End a session: stop the live connection AND wipe the transcript so the idle
  // home screen never shows stale chat. Durable facts persist in memory.
  const endSession = useCallback(() => { camera.stop(); stop(); clearTranscript(); }, [stop, clearTranscript]);

  const camera = useCamera({ onFrame: session.sendVideoFrame });
  const teardownRef = useRef<() => void>(() => {});
  teardownRef.current = () => { camera.stop(); stop(); };
  useEffect(() => () => teardownRef.current(), []);

  // Pause Talk in the background by ENDING its live session entirely. When the
  // user switches to Training or Roleplay (each of which opens its OWN paid Gemini
  // session), keeping the Talk session connected too would burn Gemini credits for
  // a session nobody is using — and run two paid sessions at once. So we stop it.
  //
  // Nothing important is lost: the transcript stays in React state, durable facts
  // were already saved to memory, and returning shows the normal "Start talking"
  // entry so Nicole never resumes listening/speaking on her own (matching "I never
  // clicked, so why is she talking?"). One tap reconnects.
  const wasBgRef = useRef(backgrounded);
  useEffect(() => {
    const enteringBg = !wasBgRef.current && backgrounded;
    wasBgRef.current = backgrounded;
    // teardownRef wraps camera.stop()+stop() and is kept current each render, so
    // this effect depends only on the primitives that define the edge.
    if (enteringBg && connected) teardownRef.current();
  }, [backgrounded, connected]);

  // One-tap-to-send: when a home starter is tapped we stash its prompt and call
  // start(); once the session connects, seed that prompt as the first turn.
  const pendingPromptRef = useRef<string | null>(null);
  const promptSentRef = useRef(false);
  useEffect(() => {
    if (connected && pendingPromptRef.current && !promptSentRef.current) {
      const text = pendingPromptRef.current;
      // Mark sent BEFORE the async send so React StrictMode's double-invoke (which
      // cancels the first effect's timeout) can't drop it — and don't clear the
      // ref via cleanup. The server also queues text until the session is ready.
      promptSentRef.current = true;
      pendingPromptRef.current = null;
      setTimeout(() => session.sendText(text), 500);
    }
  }, [connected, session]);

  // ── Auto-scroll with scroll-lock ──────────────────────────────────────────
  // Stick to the bottom as the transcript streams; if the user scrolls up, stop
  // auto-scrolling and show a "Jump to latest" pill; resume when they're back.
  const feedRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  // True while WE are programmatically scrolling, so the resulting scroll event
  // doesn't get mistaken for the user scrolling up and un-pin auto-follow.
  const autoScrollingRef = useRef(false);
  const [showJumpLatest, setShowJumpLatest] = useState(false);

  const onFeedScroll = useCallback(() => {
    const el = feedRef.current;
    if (!el) return;
    if (autoScrollingRef.current) return; // ignore our own programmatic scrolls
    // "Pinned" if within 80px of the bottom (tolerant of sub-pixel + momentum).
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    pinnedRef.current = atBottom;
    setShowJumpLatest(!atBottom);
  }, []);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = feedRef.current;
    if (!el) return;
    autoScrollingRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    // Release the guard after the scroll settles so real user scrolls register.
    window.setTimeout(() => { autoScrollingRef.current = false; }, smooth ? 350 : 60);
  }, []);

  const jumpToLatest = useCallback(() => {
    pinnedRef.current = true;
    setShowJumpLatest(false);
    scrollToBottom(true);
  }, [scrollToBottom]);

  // Auto-follow the newest content as it streams. useLayoutEffect runs AFTER the
  // DOM is updated but BEFORE paint, so scrollHeight is current and we scroll to
  // the true latest height with no flicker — only while pinned. We depend on the
  // LAST bubble's text too: the streaming bubble's height grows without the array
  // length changing, so depending on transcript alone would miss those growths.
  const lastBubbleText = transcript.length ? transcript[transcript.length - 1].text : '';
  useLayoutEffect(() => {
    if (pinnedRef.current) scrollToBottom(false);
    // Also re-pin as the live (realtime) lines grow, since those change height
    // without the committed transcript array changing.
  }, [transcript.length, lastBubbleText, realtime.you, realtime.nicole, scrollToBottom]);

  const changeVoice = (name: string) => {
    setVoice(name);
    if (connected) session.setVoice(name);
    // Persist the choice so it survives a reload (was reverting to the old
    // preferredVoice on refresh). Best-effort — the live switch already happened.
    updateUser({ preferredVoice: name });
    if (token) {
      void fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ preferredVoice: name }),
      }).catch(() => { /* best-effort; local state already updated */ });
    }
  };

  // Debounce the speaking flag so the avatar's state (border/box-shadow + the
  // data-state attribute) doesn't strobe every frame as amplitude crosses the
  // threshold between syllables — that per-frame flip read as the avatar
  // "blinking/glitching", especially on mobile. The orb/companion still react to
  // the raw `amplitude` value (continuous, not a flickering boolean).
  const speaking = useDebouncedSpeaking(amplitude > SPEAKING_AMP);
  const auraState: AuraState = speaking ? 'speaking' : connected && micOn ? 'listening' : 'idle';
  // Feed the wave's energy via a ref (not a prop) so its rAF loop is never torn
  // down on amplitude changes — the fix for the speaking glitch.
  const auraStateRef = useRef<AuraState>(auraState);
  auraStateRef.current = auraState;
  // Stable status label: a single calm "Live" while connected — NOT a per-frame
  // Speaking/Listening flip (that strobed and read as a glitch). The orb still
  // reacts to amplitude via auraState; only the text chip is stabilized.
  const liveLabel = connected ? 'Live' : 'Ready';
  const liveClass = connected ? 'status-listening' : 'status-idle';

  const activeVoice = VOICES.find((v) => v.name === voice);
  const femaleVoices = VOICES.filter((v) => v.gender === 'female');
  const maleVoices   = VOICES.filter((v) => v.gender === 'male');
  // Always Nicole's avatar regardless of the chosen voice — she's Nicole whether
  // she speaks in a female or male voice (no separate "male voice" avatar).
  const avatarSrc = '/nicole-avatar.png';
  const userInitial = user?.displayName?.trim().charAt(0).toUpperCase() ?? '?';

  return (
    <div className="talk-screen" data-testid="talk-screen" data-state={auraState}>

      <TopBar
        current="talk"
        available={[...(onTrain ? ['training' as const] : []), ...(onRoleplay ? ['roleplay' as const] : [])]}
        onNavigate={(m) => { if (m === 'training') onTrain?.(); else if (m === 'roleplay') onRoleplay?.(); }}
        right={
          <>
            <span className={`status-chip ${liveClass}`} data-tooltip={connected ? 'Live session — just talk' : 'Click Start talking to begin'} data-tooltip-pos="bottom">
              <span className="status-dot" aria-hidden="true" />
              <span className="status-text">{liveLabel}</span>
            </span>
            <button
              type="button"
              className="topbar-memory-btn"
              data-testid="memory-button"
              onClick={() => setMemoryOpen(true)}
              aria-label="What Nicole remembers"
              data-tooltip="What Nicole remembers" data-tooltip-pos="bottom"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
              </svg>
            </button>
            <button type="button" className="topbar-avatar-btn" onClick={() => setProfileOpen(true)} aria-label="Open profile">
              {userInitial}
            </button>
          </>
        }
      />

      {camera.error && <p className="camera-error" role="alert">{camera.error}</p>}

      <div className="talk-body">
        <aside className="talk-presence">
          <div className={`presence-avatar presence-avatar--state-${auraState}`} data-testid="nicole-aura">
            <img src={avatarSrc} alt="Nicole" className="presence-img" />
          </div>
          <p className="presence-state">{connected ? 'Live' : 'Your Personal VA'}</p>

          <div className="voice-selector">
            <button type="button" className="voice-current-btn" data-testid="voice-switcher" onClick={() => setVoiceOpen((o) => !o)} aria-expanded={voiceOpen} data-tooltip="Change Nicole's voice" data-tooltip-pos="top">
              <span className="voice-current-name">{voice}</span>
              <span className="voice-current-label">{activeVoice?.label ?? ''}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {voiceOpen && (
              <div className="voice-pop" role="dialog" aria-label="Select voice">
                {/* Gender segmented toggle */}
                <div className="voice-seg" role="tablist" aria-label="Voice gender">
                  <button type="button" role="tab" aria-selected={voiceGender === 'female' ? 'true' : 'false'}
                    className={`voice-seg__btn${voiceGender === 'female' ? ' is-on' : ''}`}
                    onClick={() => setVoiceGender('female')}>Female</button>
                  <button type="button" role="tab" aria-selected={voiceGender === 'male' ? 'true' : 'false'}
                    className={`voice-seg__btn${voiceGender === 'male' ? ' is-on' : ''}`}
                    onClick={() => setVoiceGender('male')}>Male</button>
                </div>
                {/* Chip grid for the selected gender */}
                <div className="voice-chips" role="listbox" aria-label={`${voiceGender} voices`}>
                  {(voiceGender === 'female' ? femaleVoices : maleVoices).map((v) => (
                    <button key={v.name} type="button" role="option"
                      aria-selected={v.name === voice ? 'true' : 'false'}
                      className={`voice-chip${v.name === voice ? ' is-active' : ''}`}
                      data-testid="voice-option"
                      onClick={() => { setVoice(v.name); setVoiceOpen(false); if (connected) session.setVoice(v.name); }}>
                      <span className="voice-chip__name">{v.name}</span>
                      <span className="voice-chip__label">{v.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Ambient weather inside the panel (beside the avatar); Nicole can
              also open the full card by voice. */}
          <WeatherWidget inline handleRef={(h) => { weatherRef.current = h; }} />
        </aside>

        <section className="talk-conversation">
          <WaveBackdrop stateRef={auraStateRef} />
          {transcript.length === 0 && !realtime.you && !realtime.nicole ? (
            <div className="talk-empty">
              <HomePanel
                onStarter={(prompt) => { pendingPromptRef.current = prompt; promptSentRef.current = false; beginSession(); }}
                onDrill={() => onTrain?.()}
              />
            </div>
          ) : (
            <div className="conversation-feed" ref={feedRef} onScroll={onFeedScroll}>
              <ChatTranscript lines={transcript} realtime={realtime} />
              {showJumpLatest && (
                <button type="button" className="jump-latest" onClick={jumpToLatest} aria-label="Jump to latest message">
                  ↓ Latest
                </button>
              )}
            </div>
          )}
          <div className="talk-controls">
            {!connected ? (
              <button type="button" className="talk-start-btn" onClick={beginSession} disabled={starting} aria-busy={starting} data-tooltip="Start a live voice session with Nicole" data-tooltip-pos="top">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                {starting ? 'Connecting…' : 'Start talking'}
              </button>
            ) : (
              <div className="live-controls live-controls--icons">
                <button type="button" className={`ctrl-icon${!micOn ? ' is-muted' : ''}`} data-testid="mute-mic-button" onClick={toggleMic} aria-pressed={micOn ? 'false' : 'true'} aria-label={micOn ? 'Mute your microphone' : 'Unmute your microphone'} data-tooltip={micOn ? 'Mute your microphone' : 'Unmute your microphone'} data-tooltip-pos="top">
                  <Icon name={micOn ? 'mic' : 'mic-off'} size={20} />
                </button>
                <button type="button" className={`ctrl-icon${camera.on && camera.source === 'camera' ? ' is-active' : ''}`} data-testid="camera-button" onClick={() => (camera.on && camera.source === 'camera' ? camera.stop() : void camera.start())} aria-label={camera.source === 'camera' ? 'Turn off camera' : 'Turn on camera'} data-tooltip={camera.source === 'camera' ? 'Turn off camera' : 'Let Nicole see you through your camera'} data-tooltip-pos="top">
                  <Icon name="camera" size={20} />
                </button>
                <button type="button" className={`ctrl-icon${camera.on && camera.source === 'screen' ? ' is-active' : ''}`} data-testid="screen-button" onClick={() => (camera.on && camera.source === 'screen' ? camera.stop() : void camera.startScreen())} aria-label={camera.source === 'screen' ? 'Stop sharing your screen' : 'Share your screen with Nicole'} data-tooltip={camera.source === 'screen' ? 'Stop sharing your screen' : 'Share your screen with Nicole'} data-tooltip-pos="top">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2.5" y="4" width="19" height="13" rx="2" />
                    <path d="M8.5 21h7M12 17v4" />
                  </svg>
                </button>
                <button type="button" className={`ctrl-icon${aiMuted ? ' is-muted' : ''}`} data-testid="mute-ai-button" onClick={() => setAiMuted((m) => !m)} aria-pressed={aiMuted ? 'true' : 'false'} aria-label={aiMuted ? "Unmute Nicole's voice" : "Mute Nicole's voice"} data-tooltip={aiMuted ? "Unmute Nicole's voice" : "Mute Nicole's voice"} data-tooltip-pos="top">
                  <Icon name={aiMuted ? 'speaker-off' : 'speaker'} size={20} />
                </button>
                <div className="ctrl-volume">
                  <button type="button" className={`ctrl-icon${muted ? ' is-muted' : ''}`} data-testid="volume-button" onClick={() => setVolumeOpen((o) => !o)} aria-expanded={volumeOpen ? 'true' : 'false'} aria-label={`Volume ${volume}`} data-tooltip="Volume" data-tooltip-pos="top">
                    <Icon name={muted || volume === 0 ? 'volume-off' : volume < 45 ? 'volume-low' : 'volume'} size={20} />
                  </button>
                  {volumeOpen && (
                    <div className="volume-pop" role="group" aria-label="Volume">
                      <button type="button" className="volume-pop__mute" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'}>
                        <Icon name={muted || volume === 0 ? 'volume-off' : 'volume'} size={16} />
                      </button>
                      <input
                        type="range" min={0} max={100} step={1} value={volume}
                        onChange={(e) => setVolume(Number(e.target.value))}
                        className="volume-pop__slider" aria-label="Volume"
                        style={{ ['--vol' as string]: `${volume}%` }}
                      />
                      <span className="volume-pop__val">{volume}</span>
                    </div>
                  )}
                </div>
                <button type="button" className="ctrl-icon ctrl-icon--end" onClick={endSession} aria-label="End this session" data-tooltip="End this session" data-tooltip-pos="top">
                  <Icon name="end" size={20} />
                </button>
              </div>
            )}
          </div>

          {/* Live2D companion (Aria/Noah) — bottom-right, toggleable. Lip-syncs
              to the live Nicole voice. Avatar + wardrobe colors from prefs. */}
          <Live2DCompanion
            // Remount when the avatar OR its wardrobe colors change so a Save in
            // the Avatar panel reflects on screen immediately — no page refresh.
            key={`${avatarPrefs.avatar}:${JSON.stringify(avatarPrefs.colors[avatarPrefs.avatar === 'noah' ? 'noah' : 'aria'] ?? {})}`}
            amplitude={amplitude}
            speaking={speaking}
            shown={companionShown && avatarPrefs.avatar !== 'off'}
            avatarId={avatarPrefs.avatar === 'noah' ? 'noah' : 'aria'}
            colors={avatarPrefs.colors[avatarPrefs.avatar === 'noah' ? 'noah' : 'aria']}
          />
        </section>
      </div>

      {camera.on && camera.source === 'camera' && (
        <div className="camera-corner">
          <CameraPreview stream={camera.stream} onClose={camera.stop} />
        </div>
      )}

      <ProfilePanel open={profileOpen} onClose={() => setProfileOpen(false)} />

      {memoryOpen && <MemoryPanel onClose={() => setMemoryOpen(false)} />}

      {/* Show/hide-avatar toggle. Only on the ACTIVE Talk screen — TalkScreen
          stays mounted (hidden) when Training/Roleplay are open, but this portal
          renders to document.body and would escape that display:none, so gate it
          on !backgrounded. Also only when an avatar is selected (not 'Off'). */}
      {!backgrounded && avatarPrefs.avatar !== 'off' && createPortal(
        <button
          type="button"
          className={`l2d-toggle-btn${companionShown ? ' is-on' : ''}`}
          onClick={toggleCompanion}
          aria-pressed={companionShown ? 'true' : 'false'}
          aria-label={companionShown ? 'Hide the avatar' : 'Show the avatar'}
          data-tooltip={companionShown ? 'Hide avatar' : 'Show avatar'}
          data-tooltip-pos="left"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="3.2" />
            <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
            {!companionShown && <path d="M3 3l18 18" />}
          </svg>
        </button>,
        document.body,
      )}
    </div>
  );
}

export default TalkScreen;
