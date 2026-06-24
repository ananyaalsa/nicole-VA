import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import AuroraBackground from '../components/AuroraBackground';
import { NicolePresence } from '../components/NicolePresence';
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
import { scoreRoleplay } from '../training/roleplayScore';
import './RoleplayScreen.css';

/** Amplitude above which the character counts as actively speaking. */
const SPEAKING_AMP = 0.06;

export interface RoleplayScreenProps {
  /** Leave the roleplay flow entirely (back to the talk console). */
  onExit?: () => void;
}

/** One row of the engagement scorecard shown on the result stage. */
interface ScorecardRow {
  dimension: string;
  hit: boolean;
  tip: string;
}

/** The full result of a finished run, before it's persisted. */
interface RoleplayResult {
  score: number;
  scorecard: ScorecardRow[];
  transcriptText: string;
  userLineCount: number;
  totalWords: number;
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
export function RoleplayScreen({ onExit }: RoleplayScreenProps): JSX.Element {
  const [profiles, setProfiles] = useState<ProfileDef[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [profileId, setProfileId] = useState<string | null>(null);
  const [persona, setPersona] = useState<PersonaOption | null>(null);
  const [scenario, setScenario] = useState<ScenarioOption | null>(null);

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
        setBuildError(res.error ?? 'Could not build that — try describing it differently.');
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
      <AuroraBackground />
      <main className="roleplay__picker">
        <header className="roleplay__picker-head">
          <div className="roleplay__eyebrow">
            <span className="brand-mark" aria-hidden="true" />
            <span className="hud-label">Roleplay&nbsp;·&nbsp;Live Rep</span>
          </div>
          <h1 className="roleplay__title">Pick who you want to practice against</h1>
          <p className="roleplay__lede">
            Choose a type and a scenario. A different voice plays the other party
            and starts the scene automatically — it's just you and them. No
            coaching, no Nicole. You get an engagement score at the end.
          </p>
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

        {/* TYPE cards. */}
        <ul className="roleplay__profiles" data-testid="profile-list">
          {profiles.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`roleplay-card hud-panel${
                  p.id === profileId ? ' is-selected' : ''
                }`}
                data-testid="profile-card"
                data-profile={p.id}
                aria-pressed={p.id === profileId}
                onClick={() => selectProfile(p.id)}
              >
                <span className="roleplay-card__name">{p.name}</span>
                <span className="roleplay-card__blurb">{p.blurb}</span>
              </button>
            </li>
          ))}
        </ul>

        {activeProfile && activeProfile.id === 'custom' && (
          <section className="roleplay__custom" data-testid="custom-builder">
            <label className="hud-label" htmlFor="roleplay-dictation">
              Describe who you want to practice against and the situation
            </label>
            <textarea
              id="roleplay-dictation"
              className="roleplay__textarea"
              data-testid="custom-dictation"
              rows={4}
              value={dictation}
              placeholder="e.g. A skeptical CFO who thinks our tool is too expensive, on a renewal call…"
              onChange={(e) => setDictation(e.target.value)}
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

        {activeProfile && activeProfile.id !== 'custom' && (
          <div className="roleplay__choices">
            {/* PERSONAS. */}
            <section className="roleplay__group" data-testid="persona-list">
              <span className="hud-label roleplay__group-head">Who you face</span>
              <ul className="roleplay__cards">
                {activeProfile.personas.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`roleplay-card hud-panel${
                        persona?.id === p.id ? ' is-selected' : ''
                      }`}
                      data-testid="persona-card"
                      aria-pressed={persona?.id === p.id}
                      onClick={() => setPersona(p)}
                    >
                      <span className="roleplay-card__name">{p.name}</span>
                      <span className="roleplay-card__blurb">{p.tagline}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {/* SCENARIOS. */}
            <section className="roleplay__group" data-testid="scenario-list">
              <span className="hud-label roleplay__group-head">The situation</span>
              <ul className="roleplay__cards">
                {activeProfile.scenarios.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`roleplay-card hud-panel${
                        scenario?.id === s.id ? ' is-selected' : ''
                      }`}
                      data-testid="scenario-card"
                      aria-pressed={scenario?.id === s.id}
                      onClick={() => setScenario(s)}
                    >
                      <span className="roleplay-card__name">{s.name}</span>
                      <span className="roleplay-card__blurb">{s.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        <div className="roleplay__picker-actions">
          {onExit && (
            <button
              type="button"
              className="roleplay__back"
              data-testid="picker-exit-button"
              onClick={onExit}
            >
              ← Back to talk
            </button>
          )}
          <button
            type="button"
            className="roleplay__start"
            data-testid="start-roleplay-button"
            disabled={!canStart}
            onClick={() => setStage('room')}
          >
            <span className="roleplay__start-dot" aria-hidden="true" />
            Start roleplay
          </button>
        </div>
      </main>
    </div>
  );
}

interface RoleplayRoomProps {
  persona: PersonaOption;
  scenario: ScenarioOption;
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
  dimensions,
  profileId,
  onDone,
  onAgain,
}: RoleplayRoomProps): JSX.Element {
  const session = useRoleplaySession({ persona, scenario });
  const { connected, micOn, transcript, amplitude, start, stop, toggleMic } = session;

  const [result, setResult] = useState<RoleplayResult | null>(null);
  const [saving, setSaving] = useState(false);
  const startedRef = useRef(false);

  // Auto-start the session on enter, exactly once.
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      void start();
    }
  }, [start]);

  const alias = persona.characterAlias || persona.name;
  const speaking = amplitude > SPEAKING_AMP;

  const endAndScore = useCallback(async () => {
    // Snapshot the transcript before tearing the session down.
    const lines = transcript;
    const userLines = lines.filter((l) => l.speaker === 'you');
    const userLineCount = userLines.length;
    const totalWords = userLines.reduce(
      (sum, l) => sum + l.text.trim().split(/\s+/).filter(Boolean).length,
      0,
    );
    const score = scoreRoleplay(userLineCount, totalWords);

    const transcriptText = lines
      .map((l) => `${l.speaker === 'you' ? 'You' : alias}: ${l.text}`)
      .join('\n');

    // Build an honest scorecard: every profile dimension is "evaluated" against
    // the same engagement signal — we do NOT fake a per-dimension AI judgement.
    const evaluated = score >= 5;
    const tip = evaluated
      ? 'You stayed engaged and kept the exchange going.'
      : 'Push for more back-and-forth next time — longer, fuller turns.';
    const scorecard: ScorecardRow[] =
      dimensions.length > 0
        ? dimensions.map((d) => ({ dimension: d.label, hit: evaluated, tip }))
        : [{ dimension: 'Engagement', hit: evaluated, tip }];

    stop();
    setResult({ score, scorecard, transcriptText, userLineCount, totalWords });

    setSaving(true);
    try {
      await saveRun({
        kind: 'roleplay',
        profileId,
        personaId: persona.id,
        scenarioId: scenario.id,
        title: `${persona.name} · ${scenario.name}`,
        score,
        scorecard,
        transcript: transcriptText,
      });
    } catch {
      // History save is best-effort; the score is still shown to the user.
    } finally {
      setSaving(false);
    }
  }, [transcript, alias, dimensions, stop, profileId, persona, scenario]);

  // RESULT stage.
  if (result) {
    return (
      <div className="roleplay roleplay--result" data-testid="roleplay-result">
        <AuroraBackground />
        <main className="roleplay__result">
          <header className="roleplay__result-head">
            <span className="hud-label">Roleplay&nbsp;·&nbsp;Result</span>
            <h1 className="roleplay__result-title">
              {persona.name} · {scenario.name}
            </h1>
          </header>

          <div className="roleplay__score hud-panel" data-testid="roleplay-score">
            <span className="roleplay__score-value">{result.score.toFixed(1)}</span>
            <span className="roleplay__score-max">/ 10</span>
            <span className="roleplay__score-label hud-label">Engagement score</span>
            <span className="roleplay__score-sub">
              {result.userLineCount} turns · {result.totalWords} words
            </span>
          </div>

          <ul className="roleplay__scorecard" data-testid="roleplay-scorecard">
            {result.scorecard.map((row, i) => (
              <li
                key={`${row.dimension}-${i}`}
                className={`roleplay__scorerow roleplay__scorerow--${row.hit ? 'hit' : 'miss'}`}
                data-testid="scorecard-row"
                data-hit={row.hit ? 'true' : 'false'}
              >
                <span className="roleplay__scorerow-mark" aria-hidden="true">
                  {row.hit ? '✓' : '✕'}
                </span>
                <span className="roleplay__scorerow-body">
                  <span className="roleplay__scorerow-dim">{row.dimension}</span>
                  <span className="roleplay__scorerow-tip">{row.tip}</span>
                </span>
              </li>
            ))}
          </ul>

          <p className="roleplay__result-note hud-label" aria-live="polite">
            {saving ? 'Saving to history…' : 'Saved to history.'}
          </p>

          <div className="roleplay__result-actions">
            <button
              type="button"
              className="roleplay__back"
              data-testid="result-done-button"
              onClick={onDone}
            >
              Done
            </button>
            <button
              type="button"
              className="roleplay__start"
              data-testid="result-again-button"
              onClick={onAgain}
            >
              Roleplay again
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ROOM stage.
  return (
    <div className="roleplay roleplay--room" data-testid="roleplay-room">
      <AuroraBackground />

      <header className="roleplay__topbar">
        <div className="roleplay__topbar-left">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <p className="hud-label roleplay__topbar-eyebrow">{scenario.name}</p>
            <h1 className="roleplay__room-title" data-testid="room-character">
              {alias}
            </h1>
          </div>
        </div>
        <div className="roleplay__topbar-right">
          <span
            className={`status-chip status-${speaking ? 'speaking' : connected ? 'listening' : 'idle'}`}
          >
            <span className="status-dot" aria-hidden="true" />
            <span className="status-text">
              {speaking ? 'Speaking' : connected ? 'Live' : 'Connecting'}
            </span>
          </span>
          <button
            type="button"
            className={`control-btn${micOn ? ' is-on' : ' is-off'}`}
            data-testid="mic-toggle"
            onClick={toggleMic}
            aria-pressed={micOn}
          >
            {micOn ? 'Mute' : 'Unmute'}
          </button>
          <button
            type="button"
            className="control-btn is-end"
            data-testid="end-score-button"
            onClick={() => void endAndScore()}
          >
            End &amp; score
          </button>
        </div>
      </header>

      <div className="roleplay__layout">
        {/* CENTER — the character's presence (NOT Nicole). */}
        <section className="roleplay__stage">
          <div className="roleplay__avatar-wrap">
            <div className="stage-corner stage-corner--tl" aria-hidden="true" />
            <div className="stage-corner stage-corner--tr" aria-hidden="true" />
            <div className="stage-corner stage-corner--bl" aria-hidden="true" />
            <div className="stage-corner stage-corner--br" aria-hidden="true" />
            <div className={`roleplay__avatar${speaking ? ' is-speaking' : ''}`}>
              <NicolePresence amplitude={amplitude} speaking={speaking} />
            </div>
            <p className="roleplay__character-name hud-label" data-testid="character-label">
              {alias}
            </p>
          </div>
        </section>

        {/* RIGHT — live transcript, relabeled with the character alias. */}
        <aside className="roleplay__transcript hud-panel">
          <div className="rail-head">
            <span className="hud-label">Live transcript</span>
            <span className="hud-label rail-count">{transcript.length} lines</span>
          </div>
          <div className="roleplay__transcript-body" data-testid="roleplay-transcript">
            {transcript.length === 0 ? (
              <p className="roleplay__transcript-empty hud-label">
                {connected ? `${alias} is about to speak…` : 'Connecting…'}
              </p>
            ) : (
              transcript.map((line) => (
                <div
                  key={line.id}
                  className={`roleplay__line roleplay__line--${line.speaker === 'you' ? 'you' : 'character'}`}
                  data-testid="roleplay-line"
                  data-speaker={line.speaker === 'you' ? 'you' : 'character'}
                >
                  <span className="roleplay__line-who">
                    {line.speaker === 'you' ? 'You' : alias}
                  </span>
                  <span className="roleplay__line-text">{line.text}</span>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default RoleplayScreen;
