import { Suspense, lazy, useCallback, useState } from 'react';
import type { JSX } from 'react';
import AuroraBackground from '../components/AuroraBackground';
import { NicolePresence } from '../components/NicolePresence';
import { Transcript } from '../components/Transcript';
import { HistoryPanel } from '../components/HistoryPanel';
import { DictationField } from '../components/DictationField';
import { generateCustomSpec } from '../training/trainingApi';
import { Icon } from '../components/Icon';

// Same lazy 3D avatar used on the Talk screen.
const SophiaAvatar = lazy(() => import('../avatar3d/SophiaAvatar'));
import { Scorecard } from '../components/Scorecard';
import { LESSONS } from '../training/lessons';
import type { ClientLessonSpec } from '../training/lessonPrompts';
import { PHASE_ORDER, type Phase } from '../training/phaseMachine';
import { useCoachingSession } from '../training/useCoachingSession';
import './TrainingScreen.css';

export interface TrainingScreenProps {
  /** Called when the learner leaves training mode entirely. */
  onExit?: () => void;
}

/** Human-friendly labels for each phase shown on the progress rail. */
const PHASE_LABELS: Record<Phase, string> = {
  intro: 'Intro',
  teach: 'Teach',
  model: 'Model',
  guided_practice: 'Practice',
  baseline_assess: 'Baseline',
  readiness_check: 'Readiness',
  level_gate: 'Gate',
  roleplay_demo: 'Roleplay',
  debrief: 'Debrief',
};

/** One-line "what happens now" copy under the phase rail. */
const PHASE_SUBTITLE: Record<Phase, string> = {
  intro: 'Nicole sets up the skill and the goal.',
  teach: 'She walks the framework, one move at a time.',
  model: 'She demonstrates a strong example out loud.',
  guided_practice: 'Your turn — try each move and get a tip.',
  baseline_assess: 'A cold solo attempt to read your starting level.',
  readiness_check: 'Explain it back, then one full solo run.',
  level_gate: 'Your level attempt is being scored.',
  roleplay_demo: 'Live roleplay — a second voice plays the other party.',
  debrief: 'Honest feedback against every move, and what to drill next.',
};

/**
 * Training mode. Starts as a lesson picker; choosing a lesson mounts a live
 * coaching session driven by Nicole. The picker and the session are split so the
 * coaching hook only runs once a lesson is actually selected.
 */
export function TrainingScreen({ onExit }: TrainingScreenProps): JSX.Element {
  const [lesson, setLesson] = useState<ClientLessonSpec | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Custom training: describe (type or dictate) a skill -> AI builds a lesson
  // Nicole teaches end-to-end, just like the authored ones.
  const [showCustom, setShowCustom] = useState(false);
  const [customText, setCustomText] = useState('');
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  const buildCustom = useCallback(async () => {
    if (!customText.trim()) return;
    setBuilding(true);
    setBuildError(null);
    try {
      const res = await generateCustomSpec({ dictation: customText });
      if (res.ok && res.spec) {
        // A TrainingSpec is a superset of ClientLessonSpec — Nicole teaches it.
        setLesson(res.spec as unknown as ClientLessonSpec);
      } else {
        setBuildError(res.error ?? 'Could not build that training. Try rephrasing.');
      }
    } catch (e) {
      setBuildError((e as Error)?.message ?? 'Build failed.');
    } finally {
      setBuilding(false);
    }
  }, [customText]);

  const exitSession = useCallback(() => {
    setLesson(null);
  }, []);

  if (lesson) {
    return (
      <TrainingSession
        lesson={lesson}
        onExit={() => {
          exitSession();
          onExit?.();
        }}
      />
    );
  }

  return (
    <div className="training" data-testid="training-screen">
      <AuroraBackground />
      <main className="training__picker">
        <header className="training__picker-head">
          <div className="training__picker-eyebrow">
            <span className="brand-mark" aria-hidden="true" />
            <span className="hud-label">Training&nbsp;·&nbsp;Drill Room</span>
          </div>
          <div className="training__picker-headrow">
            <h1 className="training__title">Pick one skill to drill</h1>
            <button
              type="button"
              className="icon-btn icon-btn--cyan training__history-btn"
              data-testid="history-button"
              onClick={() => setShowHistory(true)}
              title="History"
              aria-label="History"
            >
              <Icon name="history" />
              <span className="icon-btn__label">History</span>
            </button>
          </div>
          <p className="training__lede">
            Nicole coaches a single skill end to end — teach, model, practice,
            roleplay, debrief. One framework, one room, one rep at a time.
          </p>
        </header>

        <ul className="training__lessons">
          {LESSONS.map((l, i) => (
            <li key={l.skillId}>
              <button
                type="button"
                className="lesson-card hud-panel"
                data-testid="lesson-card"
                onClick={() => setLesson(l)}
              >
                <span className="lesson-card__toprow">
                  <span className="lesson-card__framework">
                    {l.coreFramework.name}
                  </span>
                  <span className="lesson-card__index">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </span>
                <span className="lesson-card__title">{l.title}</span>
                <span className="lesson-card__objective">{l.objective}</span>

                <span className="lesson-card__moves" aria-hidden="true">
                  {l.coreFramework.moves.map((m, mi) => (
                    <span className="lesson-card__move" key={m.step}>
                      <span className="lesson-card__move-num">{mi + 1}</span>
                      {m.step}
                    </span>
                  ))}
                </span>

                <span className="lesson-card__cta hud-label">
                  Enter room <span aria-hidden="true">→</span>
                </span>
              </button>
            </li>
          ))}

          {/* Custom: design your own skill for Nicole to teach. */}
          <li>
            <button
              type="button"
              className={`lesson-card lesson-card--custom hud-panel${showCustom ? ' is-open' : ''}`}
              data-testid="custom-lesson-card"
              onClick={() => setShowCustom((v) => !v)}
            >
              <span className="lesson-card__toprow">
                <span className="lesson-card__framework">CUSTOM</span>
              </span>
              <span className="lesson-card__title">Build your own skill</span>
              <span className="lesson-card__objective">
                Describe any skill you want to get better at — type it or speak it —
                and Nicole builds the lesson and coaches you through it.
              </span>
              <span className="lesson-card__cta hud-label">
                {showCustom ? 'Close' : 'Design it'} <span aria-hidden="true">→</span>
              </span>
            </button>
          </li>
        </ul>

        {showCustom && (
          <section className="training__custom" data-testid="training-custom-builder">
            <DictationField
              label="What do you want to get better at?"
              value={customText}
              onChange={setCustomText}
              rows={3}
              placeholder="Type it, or tap Dictate and speak — e.g. saying no to my boss without sounding rude…"
            />
            <div className="training__custom-actions">
              <button
                type="button"
                className="training__build-btn"
                data-testid="training-build-button"
                disabled={building || !customText.trim()}
                onClick={() => void buildCustom()}
              >
                {building ? 'Building…' : 'Build & enter room'}
              </button>
              {buildError && (
                <span className="training__build-error" data-testid="training-build-error">
                  {buildError}
                </span>
              )}
            </div>
          </section>
        )}

        {onExit && (
          <button
            type="button"
            className="training__back"
            data-testid="picker-exit-button"
            onClick={onExit}
          >
            ← Back to talk
          </button>
        )}
      </main>

      {/* Training History lives INSIDE Training (not on the main page). */}
      {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} />}
    </div>
  );
}

interface TrainingSessionProps {
  lesson: ClientLessonSpec;
  onExit: () => void;
}

/**
 * The live training room. Mounted only when a lesson is chosen, so
 * useCoachingSession (which owns the audio/WS engine) never runs on the picker.
 *
 * Layout is a mission deck: a left rail with the phase timeline + the framework
 * playbook (every move with its intent and key line), Nicole's presence and the
 * live transcript console in the center, and the live scorecard + run controls
 * on the right.
 */
function TrainingSession({ lesson, onExit }: TrainingSessionProps): JSX.Element {
  const session = useCoachingSession({ lesson });
  const { phase } = session;

  const currentIndex = PHASE_ORDER.indexOf(phase);
  const atEnd = phase === 'debrief';
  const moves = lesson.coreFramework.moves;
  const speaking = session.coachAmplitude > 0.02;

  const handleExit = useCallback(() => {
    session.stop();
    onExit();
  }, [session, onExit]);

  return (
    <div className="training training--session" data-testid="training-screen">
      <AuroraBackground />

      <header className="training__topbar">
        <div className="training__topbar-left">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <p className="hud-label training__topbar-eyebrow">
              {lesson.coreFramework.name} · {lesson.mnemonic}
            </p>
            <h1 className="training__session-title">{lesson.title}</h1>
          </div>
        </div>
        <div className="training__topbar-right">
          <span className="training__phasechip hud-label" data-testid="phase-indicator-chip">
            Phase {currentIndex + 1}/{PHASE_ORDER.length} · {PHASE_LABELS[phase]}
          </span>
          <button
            type="button"
            className="training__exit"
            data-testid="exit-button"
            onClick={handleExit}
          >
            Exit room
          </button>
        </div>
      </header>

      <div className="training__layout">
        {/* LEFT — mission timeline + framework playbook. */}
        <aside className="training__rail">
          <nav
            className="phase-rail hud-panel"
            data-testid="phase-indicator"
            aria-label="Lesson progress"
          >
            <div className="phase-rail__head">
              <span className="hud-label">Session timeline</span>
            </div>
            <ol className="phase-rail__track">
              {PHASE_ORDER.map((p, i) => {
                const state =
                  i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming';
                return (
                  <li
                    key={p}
                    className={`phase-rail__step phase-rail__step--${state}`}
                    data-phase={p}
                    data-state={state}
                    aria-current={state === 'current' ? 'step' : undefined}
                  >
                    <span className="phase-rail__marker" aria-hidden="true">
                      <span className="phase-rail__dot" />
                    </span>
                    <span className="phase-rail__step-body">
                      <span className="phase-rail__label">{PHASE_LABELS[p]}</span>
                      {state === 'current' && (
                        <span className="phase-rail__subtitle">{PHASE_SUBTITLE[p]}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* The framework playbook — the substance of the room. */}
          <section className="playbook hud-panel" aria-label="Framework playbook">
            <div className="playbook__head">
              <span className="hud-label">Playbook</span>
              <span className="playbook__badge">{lesson.coreFramework.name}</span>
            </div>
            <ol className="playbook__moves">
              {moves.map((m, i) => (
                <li className="playbook__move" key={m.step}>
                  <div className="playbook__move-head">
                    <span className="playbook__move-num">{i + 1}</span>
                    <span className="playbook__move-step">{m.step}</span>
                  </div>
                  <p className="playbook__move-intent">{m.intent}</p>
                  {m.keyLine && (
                    <p className="playbook__move-line">“{m.keyLine}”</p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </aside>

        {/* CENTER — Nicole + live transcript console. */}
        <section className="training__stage">
          <div className="training__avatar-wrap">
            <div className="stage-corner stage-corner--tl" aria-hidden="true" />
            <div className="stage-corner stage-corner--tr" aria-hidden="true" />
            <div className="stage-corner stage-corner--bl" aria-hidden="true" />
            <div className="stage-corner stage-corner--br" aria-hidden="true" />
            <div className={`training__avatar${speaking ? ' is-speaking' : ''}`}>
              <Suspense
                fallback={
                  <NicolePresence amplitude={session.coachAmplitude} speaking={speaking} />
                }
              >
                <SophiaAvatar amplitude={session.coachAmplitude} speaking={speaking} />
              </Suspense>
            </div>
            <p className="training__coach-state hud-label">
              {speaking ? 'Coach speaking' : 'Coach ready'}
            </p>
          </div>

          <div className="training__transcript hud-panel">
            <div className="rail-head">
              <span className="hud-label">Live transcript</span>
              <span className="hud-label rail-count">
                {session.coachTranscript.length} lines
              </span>
            </div>
            <div className="training__transcript-body">
              <Transcript lines={session.coachTranscript} maxRendered={80} />
            </div>
          </div>
        </section>

        {/* RIGHT — scorecard + run controls. */}
        <aside className="training__panel">
          <Scorecard entries={session.scorecard} />

          <div className="training__controls hud-panel">
            <span className="hud-label training__controls-head">Run control</span>
            <button
              type="button"
              className="training__start"
              data-testid="start-button"
              onClick={() => void session.start()}
            >
              <span className="training__start-dot" aria-hidden="true" />
              Start session
            </button>
            <button
              type="button"
              className="training__advance"
              data-testid="advance-button"
              onClick={session.advance}
              disabled={atEnd}
            >
              {atEnd
                ? 'Lesson complete'
                : `Advance → ${PHASE_LABELS[PHASE_ORDER[currentIndex + 1] ?? phase]}`}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default TrainingScreen;
