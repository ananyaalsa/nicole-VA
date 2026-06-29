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
  fetchHistory,
  generateCustomSpec,
  saveRun,
  type DimensionDef,
  type PersonaOption,
  type ProfileDef,
  type ScenarioOption,
} from '../training/trainingApi';
import { useRoleplaySession } from '../training/useRoleplaySession';
import { useDebouncedSpeaking } from '../engine/useDebouncedSpeaking';
import { LiveRoom } from '../components/LiveRoom';
import { CallPresence } from '../components/CallPresence';
import { MicControls } from '../components/MicControls';
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

/**
 * Does this line sound like the END of the call — a goodbye / sign-off from
 * either side? Used to auto-surface the "End & score / Replay" prompt the moment
 * the conversation naturally wraps, so the user doesn't hunt for a button.
 * Deterministic + conservative: matches clear closing phrases, not mid-call uses.
 */
export function isClosingLine(text: string): boolean {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ')} `;
  const PHRASES = [
    'bye', 'goodbye', 'good bye', 'see you', 'see ya', 'talk later', 'talk soon',
    'gotta go', 'got to go', 'have to go', 'i should go', 'take care',
    'thanks for your time', 'thank you for your time', 'have a good day',
    'have a good one', 'have a great day', 'speak soon', 'catch you later',
    'see you later', 'we ll be in touch', 'we will be in touch',
    'i ll let you go', 'let you go', 'i ll talk to you later',
  ];
  return PHRASES.some((ph) => t.includes(` ${ph} `));
}

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
  const { connected, ready, micOn, transcript, amplitude, realtime, start, stop, toggleMic, setMic, clearTranscript, aiMuted, toggleAiMute } = session;

  const [scResult, setScResult] = useState<Scorecard | null>(null);
  const [saving, setSaving] = useState(false);
  // Past scores for this persona·scenario, for the report's trend graph.
  const [pastScores, setPastScores] = useState<number[]>([]);
  // True from the moment "End & score" is tapped until the report is ready, so we
  // leave the call screen and show a "generating your report…" state (no stuck UI).
  const [scoring, setScoring] = useState(false);
  // Set when the judge call fails. We do NOT fabricate a 0/10 scorecard or save it
  // (that polluted history with fake zeros) — we show a retry instead.
  const [scoreError, setScoreError] = useState(false);
  // Captured at end-of-call so "Retry scoring" can re-run without the live session.
  const scoredLinesRef = useRef<ResultLine[]>([]);
  // Auto end-of-call prompt: appears when either side says goodbye, offering
  // End & score / Replay (dismissible so a false 'later' mid-call doesn't trap).
  const [endPromptOpen, setEndPromptOpen] = useState(false);
  const endPromptDismissedRef = useRef(false);
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

  // Load past scores for this persona·scenario when the report opens, for the
  // trend graph (best-effort; excludes the current run which the report appends).
  const repTitle = `${persona.name} · ${scenario.name}`;
  useEffect(() => {
    if (!scResult) return;
    let alive = true;
    void fetchHistory(token)
      .then((runs) => {
        if (!alive) return;
        const scores = runs
          .filter((r) => r.kind === 'roleplay' && r.title === repTitle && typeof r.score === 'number')
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .map((r) => r.score as number);
        setPastScores(scores.slice(0, Math.max(0, scores.length - 1)));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [scResult, repTitle, token]);

  // Watch the conversation for a natural close (either side says bye/later/etc.)
  // and surface the End-or-Replay prompt once. A few real turns must have
  // happened first (so the opening line can't trip it), and once dismissed it
  // won't nag again.
  const lastLine = transcript[transcript.length - 1];
  useEffect(() => {
    if (endPromptDismissedRef.current || endPromptOpen) return;
    if (transcript.length < 3) return; // need a real exchange first
    if (lastLine && isClosingLine(lastLine.text)) {
      setEndPromptOpen(true);
      // Silence the mic while the end-of-call prompt is up — the user's "replay
      // or end?" decision should drive a BUTTON, not get spoken into the rep.
      setMic(false);
    }
  }, [lastLine, transcript.length, endPromptOpen, setMic]);

  const alias = persona.characterAlias || persona.name;
  // Debounced so the Speaking/Listening label doesn't flicker on brief voice dips.
  const speaking = useDebouncedSpeaking(amplitude > SPEAKING_AMP);

  // Run the judge on the captured transcript, then save + post status. Separated
  // from endAndScore so "Retry scoring" can re-run it after a transient failure
  // WITHOUT needing the (already stopped) live session.
  const runScoring = useCallback(async (lines: ResultLine[]) => {
    setScoreError(false);
    setScoring(true);
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
      // Do NOT fabricate a 0/10 scorecard or save it — that polluted history with
      // fake zeros and showed the user a "0.0" they never earned. Surface a retry.
      scoringRef.current = false;
      setScoring(false);
      setScoreError(true);
      return;
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
  }, [dimensions, profileId, persona, scenario, alias, token]);

  const endAndScore = useCallback(async () => {
    if (scoringRef.current) return; // ignore double-clicks during scoring
    scoringRef.current = true;
    const lines: ResultLine[] = transcript.map((l) => ({
      speaker: l.speaker === 'you' ? 'you' : 'rep',
      text: l.text,
    }));
    scoredLinesRef.current = lines;
    stop();
    await runScoring(lines);
  }, [transcript, stop, runScoring]);

  const retryScoring = useCallback(() => {
    scoringRef.current = true;
    void runScoring(scoredLinesRef.current);
  }, [runScoring]);

  // Replay the SAME scene from scratch: wipe the conversation (it is NOT saved —
  // only End & score persists), re-arm the end prompt, turn the mic back on, and
  // restart the session.
  const replayScene = useCallback(() => {
    setEndPromptOpen(false);
    endPromptDismissedRef.current = false;
    clearTranscript();
    setMic(true);
    void start();
  }, [clearTranscript, setMic, start]);

  // "Keep talking" — dismiss the prompt and re-open the mic so the call continues.
  const keepTalking = useCallback(() => {
    endPromptDismissedRef.current = true;
    setEndPromptOpen(false);
    setMic(true);
  }, [setMic]);

  // SCORING-FAILED stage — the judge call failed. We DON'T show a fake 0/10 or
  // save it; we let the user retry (the transcript is captured) or just exit.
  if (scoreError && !scResult) {
    return (
      <div className="roleplay roleplay--generating" data-testid="roleplay-score-error">
        <div className="rp-generating">
          <p className="rp-generating__title">Couldn't score that call</p>
          <p className="rp-generating__sub">The scoring service didn't respond. Your conversation is safe — try again.</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button type="button" className="picker-cta-bar__btn" data-testid="retry-score-button" onClick={retryScoring}>
              Try scoring again
            </button>
            <button type="button" className="results-secondary" data-testid="score-error-exit" onClick={onDone}>
              Exit without scoring
            </button>
          </div>
        </div>
      </div>
    );
  }

  // GENERATING stage — between "End & score" and the report being ready. We
  // leave the call screen immediately so the user sees clear progress, not a
  // frozen room while the judge runs. (All hooks above this point.)
  if (scoring && !scResult) {
    return (
      <div className="roleplay roleplay--generating" data-testid="roleplay-generating">
        <div className="rp-generating">
          <div className="rp-generating__spinner" aria-hidden="true" />
          <p className="rp-generating__title">Generating your report…</p>
          <p className="rp-generating__sub">Scoring your call against {persona.name}. One moment.</p>
        </div>
      </div>
    );
  }

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
          pastScores={pastScores}
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
      />

      <LiveRoom
        lines={transcript}
        realtime={realtime}
        labels={{ nicole: alias }}
        presence={
          <CallPresence
            name={alias}
            status={turnState === 'connecting' ? 'Connecting…' : scenario.name}
            avatarSrc="/nicole-avatar-male.png"
            speaking={speaking}
            live={connected}
          />
        }
        emptyState={
          <span>
            {turnState === 'connecting'
              ? `Connecting you to ${alias}…`
              : `You're live with ${alias}. Say hello to start the call.`}
          </span>
        }
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
              onClick={replayScene}
            >
              Restart scene
            </button>
          </div>
        }
        footer={
          <>
            <span className={`room-footer__turn room-footer__turn--${turnState}`}>{turnLabel}</span>
            <div className="room-footer__actions">
              {/* Mic-ready indicator + manual mic + mute-the-character controls. */}
              <MicControls
                ready={ready}
                micOn={micOn}
                onToggleMic={toggleMic}
                aiMuted={aiMuted}
                onToggleAiMute={toggleAiMute}
              />
              <button
                type="button"
                className="ctrl-btn ctrl-btn--end"
                data-testid="end-score-button"
                disabled={scoring || saving}
                onClick={() => void endAndScore()}
              >
                End &amp; score
              </button>
            </div>
          </>
        }
      />

      {/* Auto end-of-call prompt — appears when the conversation wraps up. */}
      {endPromptOpen && !scResult && (
        <div className="endcall" role="dialog" aria-modal="true" aria-label="End of call" data-testid="endcall-dialog">
          <button
            type="button"
            className="endcall__scrim"
            aria-label="Keep talking"
            data-testid="endcall-dismiss"
            onClick={keepTalking}
          />
          <div className="endcall__card">
            <p className="endcall__title">Sounds like you're wrapping up.</p>
            <div className="endcall__actions">
              <button
                type="button"
                className="endcall__replay"
                data-testid="endcall-replay"
                onClick={replayScene}
              >
                Replay
              </button>
              <button
                type="button"
                className="endcall__score picker-cta-bar__btn"
                data-testid="endcall-score"
                onClick={() => { setEndPromptOpen(false); void endAndScore(); }}
              >
                End &amp; score <span aria-hidden="true">→</span>
              </button>
            </div>
            <button
              type="button"
              className="endcall__keep"
              data-testid="endcall-keep"
              onClick={keepTalking}
            >
              Keep talking
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default RoleplayScreen;

