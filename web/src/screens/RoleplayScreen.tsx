import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { DictationField } from '../components/DictationField';
import { TopBar } from '../components/TopBar';
import { ProfilePanel } from '../components/ProfilePanel';
import { HistoryPanel } from '../components/HistoryPanel';
import { Icon } from '../components/Icon';
import { useAuth } from '../auth/AuthContext';
import {
  fetchProfiles,
  generateCustomSpec,
  saveRun,
  type DimensionDef,
  type PersonaOption,
  type ProfileDef,
  type ScenarioOption,
} from '../training/trainingApi';
import { useRoleplaySession } from '../training/useRoleplaySession';
import { LiveRoom } from '../components/LiveRoom';
import { SessionResults } from '../components/SessionResults';
import { requestScore, postLiveStatus, type ResultLine, type Scorecard } from '../training/scoreApi';
import '../components/ProfilePanel.css';
import './RoleplayScreen.css';

/** Amplitude above which the character counts as actively speaking. */
const SPEAKING_AMP = 0.06;

/** Practice difficulty — maps to how persuadable / tough the character plays. */
export type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_META: Record<Difficulty, { label: string; overlay: string }> = {
  easy: {
    label: 'Easy',
    overlay: 'DIFFICULTY: Easy. Play warm and fairly persuadable. Give the user openings, soften objections quickly, and reward a decent attempt.',
  },
  medium: {
    label: 'Medium',
    overlay: 'DIFFICULTY: Medium. Play realistically, with some resistance and a real objection or two, but movable if the user handles it well.',
  },
  hard: {
    label: 'Hard',
    overlay: 'DIFFICULTY: Hard. Play skeptical, busy and tough. Push back hard, stack objections, and only concede to genuinely strong handling.',
  },
};

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export interface RoleplayScreenProps {
  /** Leave the roleplay flow entirely (back to the talk console). */
  onExit?: () => void;
  /** Switch to Training screen. */
  onTrain?: () => void;
}

/**
 * The ROLEPLAY experience.
 *
 * Three internal stages:
 *  - PICKER: choose a type (Sales / Interview / Custom), then a persona +
 *    scenario (or describe a custom one and let the server build it).
 *  - ROOM:   a pure live roleplay against a DIFFERENT voice (not Nicole). The
 *    character greets first and drives the scene; Nicole never appears.
 *  - RESULT: a transparent engagement score + scorecard, saved to history.
 */
export function RoleplayScreen({ onExit, onTrain }: RoleplayScreenProps): JSX.Element {
  const { user } = useAuth();
  const [panelOpen, setPanelOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [profiles, setProfiles] = useState<ProfileDef[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [profileId, setProfileId] = useState<string | null>(null);
  const [persona, setPersona] = useState<PersonaOption | null>(null);
  const [scenario, setScenario] = useState<ScenarioOption | null>(null);
  // Difficulty defaults to Easy (early success → confidence; ramp from there).
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');

  // Custom-profile builder state.
  const [dictation, setDictation] = useState('');
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  const [stage, setStage] = useState<'picker' | 'room'>('picker');

  // Load the profiles once on mount.
  useEffect(() => {
    let alive = true;
    setLoadingProfiles(true);
    fetchProfiles()
      .then((p) => {
        if (!alive) return;
        setProfiles(p);
        // Auto-select the first real (non-custom) type so the persona grid is
        // visible immediately — no dead screen, no extra click.
        const first = p.find((x) => x.id !== 'custom') ?? p[0];
        if (first) {
          setProfileId(first.id);
          setPersona(null);
          setScenario(null);
        }
        setLoadingProfiles(false);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setProfileError(err instanceof Error ? err.message : 'Failed to load profiles');
        setLoadingProfiles(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === profileId) ?? null,
    [profiles, profileId],
  );

  const selectProfile = useCallback((id: string) => {
    setProfileId(id);
    setPersona(null);
    setScenario(null);
    setBuildError(null);
  }, []);

  const buildCustom = useCallback(async () => {
    if (!dictation.trim()) return;
    setBuilding(true);
    setBuildError(null);
    try {
      const res = await generateCustomSpec({ dictation });
      if (!res.ok || !res.spec) {
        setBuildError(res.error ?? 'Could not build that. Try describing it differently.');
        return;
      }
      const spec = res.spec;
      const builtPersona: PersonaOption = {
        id: 'custom',
        name: spec.persona.alias,
        tagline: spec.objective,
        systemOverlay: spec.persona.personaPrompt,
        voiceName: spec.persona.voiceName ?? 'Charon',
        characterAlias: spec.persona.alias,
      };
      const builtScenario: ScenarioOption = {
        id: 'custom',
        name: spec.title,
        description: spec.objective,
        prospectOverlay: spec.hook ?? spec.objective,
      };
      setPersona(builtPersona);
      setScenario(builtScenario);
    } catch (err: unknown) {
      setBuildError(err instanceof Error ? err.message : 'Could not reach the builder.');
    } finally {
      setBuilding(false);
    }
  }, [dictation]);

  const canStart = persona !== null && scenario !== null;

  if (stage === 'room' && persona && scenario) {
    return (
      <RoleplayRoom
        persona={persona}
        scenario={scenario}
        difficulty={difficulty}
        dimensions={activeProfile?.dimensions ?? []}
        profileId={profileId ?? 'custom'}
        onAgain={() => {
          // Keep the same persona/scenario picked; just go back to the picker.
          setStage('picker');
        }}
        onDone={() => {
          setStage('picker');
        }}
      />
    );
  }

  return (
    <div className="roleplay" data-testid="roleplay-screen">
      <TopBar
        current="roleplay"
        available={[...(onExit ? ['talk' as const] : []), ...(onTrain ? ['training' as const] : [])]}
        onNavigate={(m) => { if (m === 'talk') onExit?.(); else if (m === 'training') onTrain?.(); }}
        right={
          <>
            <button
              type="button"
              className="icon-btn"
              data-testid="history-button"
              onClick={() => setShowHistory(true)}
              aria-label="History"
              data-tooltip="Session history" data-tooltip-pos="bottom"
            >
              <Icon name="history" size={15} />
              <span className="icon-btn__label">History</span>
            </button>
            {user && (
              <button type="button" className="topbar-avatar-btn" onClick={() => setPanelOpen(true)} aria-label="Open profile">
                {user.displayName.trim().charAt(0).toUpperCase()}
              </button>
            )}
          </>
        }
      />

      <main className="roleplay__picker">
        <div className="roleplay__picker-scroll">
          <header className="roleplay__picker-head">
            <div className="roleplay__eyebrow">
              <span className="brand-mark" aria-hidden="true" />
              <span className="hud-label">Live Rep</span>
            </div>
            <h1 className="roleplay__title">Who do you want to practice against?</h1>
          </header>

          {loadingProfiles && (
            <p className="roleplay__status hud-label" data-testid="profiles-loading">
              Loading profiles…
            </p>
          )}
          {profileError && (
            <p className="roleplay__status roleplay__status--bad" data-testid="profiles-error">
              {profileError}
            </p>
          )}

          {/* TYPE — a compact segmented control, not big cards. */}
          <div className="roleplay__types" role="tablist" aria-label="Practice type" data-testid="profile-list">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                className={`roleplay-type${p.id === profileId ? ' is-selected' : ''}`}
                data-testid="profile-card"
                data-profile={p.id}
                aria-selected={p.id === profileId ? 'true' : 'false'}
                onClick={() => selectProfile(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* CUSTOM builder. */}
          {activeProfile && activeProfile.id === 'custom' && (
            <section className="roleplay__custom" data-testid="custom-builder">
              <DictationField
                label="Describe who you want to practice against and the situation"
                value={dictation}
                onChange={setDictation}
                rows={4}
                placeholder="Type it, or tap Dictate and speak. E.g. A skeptical CFO who thinks our tool is too expensive, on a renewal call…"
              />
              <div className="roleplay__custom-actions">
                <button
                  type="button"
                  className="roleplay__build-btn"
                  data-testid="build-button"
                  disabled={building || !dictation.trim()}
                  onClick={() => void buildCustom()}
                >
                  {building ? 'Building…' : 'Build it'}
                </button>
                {buildError && (
                  <span className="roleplay__status roleplay__status--bad" data-testid="build-error">
                    {buildError}
                  </span>
                )}
              </div>
              {persona && scenario && (
                <p className="roleplay__custom-ready hud-label" data-testid="custom-ready">
                  Built: {persona.name} · {scenario.name}
                </p>
              )}
            </section>
          )}

          {/* MASTER-DETAIL: persona grid (master) + detail panel (scenario + difficulty). */}
          {activeProfile && activeProfile.id !== 'custom' && (
            <div className={`roleplay__md${persona ? ' has-selection' : ''}`}>
              <section className="roleplay__personas" data-testid="persona-list">
                <div className="roleplay__group-headrow">
                  <span className="roleplay__group-head">Who you'll face</span>
                  {/* Mobile-only: once a persona is picked the others collapse;
                      this reopens the full list. */}
                  {persona && (
                    <button type="button" className="roleplay__change-btn" onClick={() => { setPersona(null); setScenario(null); }}>
                      Change
                    </button>
                  )}
                </div>
                <ul className="roleplay__persona-grid">
                  {activeProfile.personas.map((p) => {
                    const sel = persona?.id === p.id;
                    return (
                    <li key={p.id} className={sel ? 'is-selected' : ''}>
                      <button
                        type="button"
                        className={`persona-card${sel ? ' is-selected' : ''}`}
                        data-testid="persona-card"
                        aria-pressed={sel ? 'true' : 'false'}
                        onClick={() => { setPersona(p); setScenario(null); }}
                      >
                        <span className="persona-card__avatar" aria-hidden="true">
                          {p.name.trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="persona-card__body">
                          <span className="persona-card__name">{p.name}</span>
                          <span className="persona-card__tagline">{p.tagline}</span>
                        </span>
                      </button>
                    </li>
                    );
                  })}
                </ul>
              </section>

              {/* DETAIL panel — appears once a persona is chosen. */}
              <aside className="roleplay__detail" data-testid="scenario-list">
                {persona ? (
                  <>
                    <div className="roleplay__detail-head">
                      <span className="persona-card__avatar persona-card__avatar--lg" aria-hidden="true">
                        {persona.name.trim().charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <h2 className="roleplay__detail-name">{persona.name}</h2>
                        <p className="roleplay__detail-tagline">{persona.tagline}</p>
                      </div>
                    </div>

                    <div className="roleplay__detail-section">
                      <span className="roleplay__group-head">Pick the situation</span>
                      <ul className="roleplay__scenario-list">
                        {activeProfile.scenarios.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              className={`scenario-row${scenario?.id === s.id ? ' is-selected' : ''}`}
                              data-testid="scenario-card"
                              aria-pressed={scenario?.id === s.id ? 'true' : 'false'}
                              onClick={() => setScenario(s)}
                            >
                              <span className="scenario-row__name">{s.name}</span>
                              <span className="scenario-row__desc">{s.description}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="roleplay__detail-section">
                      <span className="roleplay__group-head">Difficulty</span>
                      <div className="roleplay__difficulty" role="group" aria-label="Difficulty">
                        {DIFFICULTIES.map((d) => (
                          <button
                            key={d}
                            type="button"
                            className={`difficulty-seg${difficulty === d ? ' is-selected' : ''}`}
                            data-testid="difficulty-option"
                            aria-pressed={difficulty === d ? 'true' : 'false'}
                            onClick={() => setDifficulty(d)}
                          >
                            {DIFFICULTY_META[d].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="roleplay__detail-empty">
                    <span className="roleplay__detail-empty-icon" aria-hidden="true">
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="9" cy="7" r="3.2" />
                        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
                        <path d="M16.5 8.5l3 3-3 3" />
                        <path d="M19.5 11.5H13" />
                      </svg>
                    </span>
                    <p>Pick someone to face, then choose the situation and difficulty.</p>
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>

        {/* Sticky echoing CTA. */}
        <div className="picker-cta-bar">
          <span className="picker-cta-bar__label" data-testid="selection-summary">
            {canStart
              ? `${persona?.name} · ${scenario?.name} · ${DIFFICULTY_META[difficulty].label}`
              : 'Pick a persona and a situation to begin'}
          </span>
          <button
            type="button"
            className="picker-cta-bar__btn"
            data-testid="start-roleplay-button"
            disabled={!canStart}
            onClick={() => setStage('room')}
          >
            Start roleplay <span aria-hidden="true">→</span>
          </button>
        </div>
      </main>

      {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} />}
      <ProfilePanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  );
}

interface RoleplayRoomProps {
  persona: PersonaOption;
  scenario: ScenarioOption;
  difficulty: Difficulty;
  dimensions: DimensionDef[];
  profileId: string;
  onDone: () => void;
  onAgain: () => void;
}

/**
 * The live roleplay room + the result stage.
 *
 * Mounted only once a persona + scenario are chosen, so the live session hook
 * (audio/WS) never runs on the picker. The character drives the scene; the user
 * ends it with "End & score", which freezes a transcript snapshot, computes a
 * transparent engagement score, and persists the run.
 */
function RoleplayRoom({
  persona,
  scenario,
  difficulty,
  dimensions,
  profileId,
  onDone,
  onAgain,
}: RoleplayRoomProps): JSX.Element {
  const { token } = useAuth();
  const session = useRoleplaySession({
    persona,
    scenario,
    extraOverlay: DIFFICULTY_META[difficulty].overlay,
  });
  const { connected, micOn, transcript, amplitude, realtime, start, stop, toggleMic } = session;

  const [scResult, setScResult] = useState<Scorecard | null>(null);
  const [saving, setSaving] = useState(false);
  // Guards against a double-click on "End & score" firing two judge+save calls
  // during the async scoring gap (before scResult unmounts the button).
  const scoringRef = useRef(false);
  const startedRef = useRef(false);
  const startedAtRef = useRef(Date.now());

  // Auto-start the session on enter, exactly once.
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      void postLiveStatus({ mode: 'roleplay', state: 'entered', startedAt: startedAtRef.current }, token ?? undefined);
      void start().then(() => {
        void postLiveStatus({ mode: 'roleplay', state: 'active', skill: `${persona.name} · ${scenario.name}`, startedAt: startedAtRef.current }, token ?? undefined);
      });
    }
  }, [start, persona, scenario, token]);

  const alias = persona.characterAlias || persona.name;
  const speaking = amplitude > SPEAKING_AMP;

  const endAndScore = useCallback(async () => {
    if (scoringRef.current) return; // ignore double-clicks during scoring
    scoringRef.current = true;
    const lines: ResultLine[] = transcript.map((l) => ({
      speaker: l.speaker === 'you' ? 'you' : 'rep',
      text: l.text,
    }));
    stop();
    let sc: Scorecard;
    try {
      sc = await requestScore(
        {
          kind: 'roleplay',
          dimensions: dimensions.length
            ? dimensions
            : [{ id: 'engagement', label: 'Engagement', rubric: 'Did they drive the exchange with real moves?' }],
          transcript: lines,
        },
        token ?? undefined,
      );
    } catch {
      sc = {
        overallScore: 0,
        band: 'needs_work',
        scores: dimensions.length
          ? dimensions.map((d) => ({ dimensionId: d.id, label: d.label, score: 0, band: 'missing', rationale: '', evidenceQuote: null }))
          : [{ dimensionId: 'engagement', label: 'Engagement', score: 0, band: 'missing', rationale: '', evidenceQuote: null }],
        signals: { talkRatioPct: 0, questionCount: 0, longestMonologueWords: 0 },
        headline: 'Could not score — network error.',
        worked: { note: '', quote: null },
        fix: { note: '', quote: null, why: '' },
        nextTime: '',
        spoken: '',
      };
    }
    setScResult(sc);
    setSaving(true);
    try {
      await saveRun(
        {
          kind: 'roleplay',
          profileId,
          personaId: persona.id,
          scenarioId: scenario.id,
          title: `${persona.name} · ${scenario.name}`,
          score: sc.overallScore,
          scorecard: sc.scores,
          transcript: lines.map((l) => `${l.speaker === 'you' ? 'You' : alias}: ${l.text}`).join('\n'),
        },
        token,
      );
    } catch {
      // Best-effort; score is already shown.
    } finally {
      setSaving(false);
    }
    void postLiveStatus(
      { mode: 'roleplay', state: 'finished', skill: `${persona.name} · ${scenario.name}`, startedAt: startedAtRef.current, finishedAt: Date.now(), score: sc.overallScore },
      token ?? undefined,
    );
  }, [transcript, dimensions, stop, profileId, persona, scenario, alias, token]);

  // RESULT stage — full SessionResults debrief from the judge.
  if (scResult) {
    const repLines: ResultLine[] = transcript.map((l) => ({
      speaker: l.speaker === 'you' ? 'you' : 'rep',
      text: l.text,
    }));
    return (
      <div className="roleplay roleplay--result" data-testid="roleplay-result">
        <SessionResults
          scorecard={scResult}
          transcript={repLines}
          repLabel={alias}
          saving={saving}
          onAgain={onAgain}
          onDone={onDone}
        />
      </div>
    );
  }

  // Explicit turn state — the signature cue no competitor surfaces.
  // speaking → character talking; mic on & quiet & connected → your turn; else connecting.
  const turnState: 'speaking' | 'your-turn' | 'connecting' = speaking
    ? 'speaking'
    : connected && micOn
      ? 'your-turn'
      : 'connecting';
  const turnLabel =
    turnState === 'speaking' ? `${alias} is speaking` : turnState === 'your-turn' ? 'Your turn' : 'Connecting…';

  // ROOM stage.
  return (
    <div className="roleplay roleplay--room" data-testid="roleplay-room">

      <TopBar
        current="roleplay"
        hideNav
        brand={
          <div className="topbar-brand">
            <div className={`session-coach-avatar session-coach-avatar--initial${speaking ? ' is-speaking' : ''}`} aria-hidden="true">
              {alias.trim().charAt(0).toUpperCase()}
            </div>
            <div className="session-coach-info">
              <span className="topbar-brand-name" data-testid="character-label">{alias}</span>
              <span className="session-coach-status">{scenario.name}</span>
            </div>
          </div>
        }
        right={
          <>
            <button
              type="button"
              className={`ctrl-btn${micOn ? '' : ' is-muted'}`}
              data-testid="mic-toggle"
              onClick={toggleMic}
              aria-pressed={micOn ? 'false' : 'true'}
            >
              {micOn ? 'Mute' : 'Unmute'}
            </button>
            <button
              type="button"
              className="ctrl-btn ctrl-btn--end"
              data-testid="end-score-button"
              disabled={saving}
              onClick={() => void endAndScore()}
            >
              End &amp; score
            </button>
          </>
        }
      />

      <LiveRoom
        lines={transcript}
        realtime={realtime}
        labels={{ nicole: alias }}
        rail={
          <div className="live-rail">
            <div className={`turn-indicator turn-indicator--${turnState}`} aria-live="polite" data-testid="turn-indicator">
              <span className="turn-indicator__pulse" aria-hidden="true" />
              <span className="turn-indicator__label">{turnLabel}</span>
            </div>
            <button
              type="button"
              className="session-replay"
              data-testid="restart-scene-button"
              onClick={() => void start()}
            >
              Restart scene
            </button>
          </div>
        }
      />
    </div>
  );
}

export default RoleplayScreen;

