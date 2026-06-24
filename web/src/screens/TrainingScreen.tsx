import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import AuroraBackground from '../components/AuroraBackground';
import NicoleAvatar from '../avatar/NicoleAvatar';
import { Transcript } from '../components/Transcript';
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
          <p className="training__eyebrow">Training mode</p>
          <h1 className="training__title">Pick one skill to drill</h1>
          <p className="training__lede">
            Nicole coaches a single skill end to end — teach, model, practice,
            roleplay, debrief.
          </p>
        </header>

        <ul className="training__lessons">
          {LESSONS.map((l) => (
            <li key={l.skillId}>
              <button
                type="button"
                className="lesson-card"
                data-testid="lesson-card"
                onClick={() => setLesson(l)}
              >
                <span className="lesson-card__framework">
                  {l.coreFramework.name}
                </span>
                <span className="lesson-card__title">{l.title}</span>
                <span className="lesson-card__objective">{l.objective}</span>
                <span className="lesson-card__moves">
                  {l.coreFramework.moves.map((m) => m.step).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {onExit && (
          <button
            type="button"
            className="training__back"
            data-testid="picker-exit-button"
            onClick={onExit}
          >
            Back
          </button>
        )}
      </main>
    </div>
  );
}

interface TrainingSessionProps {
  lesson: ClientLessonSpec;
  onExit: () => void;
}

/**
 * The live session view. Mounted only when a lesson is chosen, so
 * useCoachingSession (which owns the audio/WS engine) never runs on the picker.
 */
function TrainingSession({ lesson, onExit }: TrainingSessionProps): JSX.Element {
  const session = useCoachingSession({ lesson });
  const { phase } = session;

  const currentIndex = PHASE_ORDER.indexOf(phase);
  const atEnd = phase === 'debrief';

  const handleExit = useCallback(() => {
    session.stop();
    onExit();
  }, [session, onExit]);

  return (
    <div className="training training--session" data-testid="training-screen">
      <AuroraBackground />

      <header className="training__topbar">
        <div className="training__topbar-left">
          <p className="training__eyebrow">{lesson.coreFramework.name}</p>
          <h1 className="training__session-title">{lesson.title}</h1>
        </div>
        <button
          type="button"
          className="training__exit"
          data-testid="exit-button"
          onClick={handleExit}
        >
          Exit
        </button>
      </header>

      <div className="training__layout">
        <section className="training__stage">
          <div className="training__avatar">
            <NicoleAvatar
              amplitude={session.coachAmplitude}
              speaking={session.coachAmplitude > 0.02}
            />
          </div>

          {/* Signature: the phase rail — the lesson IS an ordered sequence. */}
          <nav
            className="phase-rail"
            data-testid="phase-indicator"
            aria-label="Lesson progress"
          >
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
                    <span className="phase-rail__dot" aria-hidden="true" />
                    <span className="phase-rail__label">{PHASE_LABELS[p]}</span>
                  </li>
                );
              })}
            </ol>
            <p className="phase-rail__subtitle">{PHASE_SUBTITLE[phase]}</p>
          </nav>

          <div className="training__transcript">
            <Transcript lines={session.coachTranscript} maxRendered={60} />
          </div>
        </section>

        <aside className="training__panel">
          <Scorecard entries={session.scorecard} />

          <div className="training__controls">
            <button
              type="button"
              className="training__start"
              data-testid="start-button"
              onClick={() => void session.start()}
            >
              Start session
            </button>
            <button
              type="button"
              className="training__advance"
              data-testid="advance-button"
              onClick={session.advance}
              disabled={atEnd}
            >
              {atEnd ? 'Lesson complete' : `Advance to ${PHASE_LABELS[PHASE_ORDER[currentIndex + 1] ?? phase]}`}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default TrainingScreen;
