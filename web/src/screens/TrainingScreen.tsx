import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { HistoryPanel } from '../components/HistoryPanel';
import { DictationField } from '../components/DictationField';
import { generateCustomSpec, saveRun } from '../training/trainingApi';
import { postLiveStatus } from '../training/scoreApi';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { ProfilePanel } from '../components/ProfilePanel';
import { useAuth } from '../auth/AuthContext';
import { LESSONS } from '../training/lessons';
import type { ClientLessonSpec } from '../training/lessonPrompts';
import { PHASE_ORDER, type Phase } from '../training/phaseMachine';
import { useCoachingSession } from '../training/useCoachingSession';
import { LiveRoom } from '../components/LiveRoom';
import { SessionResults } from '../components/SessionResults';
import '../components/ProfilePanel.css';
import './TrainingScreen.css';

export interface TrainingScreenProps {
  /** Called when the learner leaves training mode entirely (back to Talk). */
  onExit?: () => void;
  /** Switch to Roleplay screen. */
  onRoleplay?: () => void;
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

/**
 * Training mode. Starts as a lesson picker; choosing a lesson mounts a live
 * coaching session driven by Nicole. The picker and the session are split so the
 * coaching hook only runs once a lesson is actually selected.
 */
export function TrainingScreen({ onExit, onRoleplay }: TrainingScreenProps): JSX.Element {
  const { user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [lesson, setLesson] = useState<ClientLessonSpec | null>(null);
  // Picker selection (select-then-confirm; the sticky CTA echoes the choice).
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
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
        // A TrainingSpec is a superset of ClientLessonSpec -- Nicole teaches it.
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
      <TopBar
        current="training"
        available={[...(onExit ? ['talk' as const] : []), ...(onRoleplay ? ['roleplay' as const] : [])]}
        onNavigate={(m) => { if (m === 'talk') onExit?.(); else if (m === 'roleplay') onRoleplay?.(); }}
        right={
          <>
            <button
              type="button"
              className="icon-btn training__history-btn"
              data-testid="history-button"
              onClick={() => setShowHistory(true)}
              aria-label="History"
              data-tooltip="Session history" data-tooltip-pos="bottom"
            >
              <Icon name="history" size={15} />
              <span className="icon-btn__label">History</span>
            </button>
            {user && (
              <button type="button" className="topbar-avatar-btn" onClick={() => setProfileOpen(true)} aria-label="Open profile">
                {user.displayName.trim().charAt(0).toUpperCase()}
              </button>
            )}
          </>
        }
      />

      <main className="training__picker">
        <div className="training__picker-scroll">
          <header className="training__picker-head">
            <div className="training__picker-eyebrow">
              <span className="brand-mark" aria-hidden="true" />
              <span className="hud-label">Drill Room</span>
            </div>
            <h1 className="training__title">Pick one skill to drill today</h1>
            <p className="training__subtitle">One focused rep beats ten scattered ones. Choose a skill, and Nicole takes you from teach to live practice.</p>
          </header>

          <ul className={`training__lessons${showCustom ? ' is-custom-open' : ''}`}>
            {LESSONS.map((l, i) => {
              const isSelected = selectedSkill === l.skillId;
              return (
                <li key={l.skillId} className="training__lesson-li">
                  <button
                    type="button"
                    className={`lesson-card${isSelected ? ' is-selected' : ''}`}
                    data-testid="lesson-card"
                    aria-pressed={isSelected ? 'true' : 'false'}
                    onClick={() => { setSelectedSkill(l.skillId); setShowCustom(false); }}
                    onDoubleClick={() => setLesson(l)}
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
                  </button>
                </li>
              );
            })}

            {/* Custom: design your own skill for Nicole to teach. */}
            <li className="training__lesson-li training__lesson-li--custom">
              <button
                type="button"
                className={`lesson-card lesson-card--custom${showCustom ? ' is-open' : ''}`}
                data-testid="custom-lesson-card"
                aria-pressed={showCustom ? 'true' : 'false'}
                onClick={() => { setShowCustom((v) => !v); setSelectedSkill(null); }}
              >
                <span className="lesson-card__toprow">
                  <span className="lesson-card__framework lesson-card__framework--ghost">CUSTOM</span>
                </span>
                <span className="lesson-card__title">Build your own skill</span>
                <span className="lesson-card__objective">
                  Describe any skill you want to get better at, by typing or speaking,
                  and Nicole builds the lesson and coaches you through it.
                </span>
                <span className="lesson-card__custom-hint hud-label">
                  {showCustom ? 'Close builder' : 'Design it'}
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
                placeholder="Type it, or tap Dictate and speak. E.g. saying no to my boss without sounding rude..."
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
        </div>

        {/* Sticky CTA — always anchored, echoes the selection. */}
        {!showCustom && (
          <div className="picker-cta-bar">
            <span className="picker-cta-bar__label">
              {selectedSkill
                ? LESSONS.find((l) => l.skillId === selectedSkill)?.title
                : 'Select a skill to begin'}
            </span>
            <button
              type="button"
              className="picker-cta-bar__btn"
              data-testid="start-training-button"
              disabled={!selectedSkill}
              onClick={() => {
                const l = LESSONS.find((x) => x.skillId === selectedSkill);
                if (l) setLesson(l);
              }}
            >
              Start drill <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </main>

      {/* Training History lives INSIDE Training (not on the main page). */}
      {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} />}

      <ProfilePanel open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}

interface TrainingSessionProps {
  lesson: ClientLessonSpec;
  onExit: () => void;
}

/** One-line "what good looks like" per phase, shown as the live stage caption. */
const PHASE_GOAL: Record<Phase, string> = {
  intro: 'Nicole sets the skill, the goal, and what good looks like.',
  teach: 'Watch as Nicole walks the framework one move at a time.',
  model: 'Watch as Nicole demonstrates a strong example out loud.',
  guided_practice: 'Your turn, with help. Try a move; Nicole nudges you.',
  baseline_assess: 'A cold solo attempt to read your starting level.',
  readiness_check: 'Explain it back, then a solo run, no help now.',
  level_gate: 'A quick gate before the live rep.',
  roleplay_demo: 'Live rep against a real prospect. No hints, just do it.',
  debrief: 'How it went, what to fix, and one more rep if you want it.',
};

/**
 * The live training room. Mounted only when a lesson is chosen, so
 * useCoachingSession (which owns the audio/WS engine) never runs on the picker.
 *
 * Live-mode minimalism (Sweller): one mode on screen at a time. TopBar (small
 * coach avatar + lesson title), a phase stepper in the rail, Nicole's transcript
 * as the full-width main area, at most ONE hint (guided_practice only), and a
 * single state-driven primary action. The full SessionResults appear ONLY at
 * debrief.
 */
function TrainingSession({ lesson, onExit }: TrainingSessionProps): JSX.Element {
  const session = useCoachingSession({ lesson });
  const { phase } = session;
  const [started, setStarted] = useState(false);
  const [scoring, setScoring] = useState(false);
  const { token } = (useAuth() as { token?: string | null });
  const startedAtRef = useRef(Date.now());
  const savedRef = useRef(false);

  // Post 'entered' on mount (best-effort).
  useEffect(() => {
    void postLiveStatus(
      { mode: 'training', state: 'entered', skill: lesson.title, startedAt: Date.now() },
      token ?? undefined,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save run + post 'finished' once scorecardResult first becomes non-null.
  useEffect(() => {
    if (!session.scorecardResult || savedRef.current) return;
    savedRef.current = true;
    const sc = session.scorecardResult;
    const transcriptText = session.practiceTranscript
      .map((l) => `${l.speaker === 'you' ? 'You' : l.speaker === 'rep' ? 'Rep' : 'Nicole'}: ${l.text}`)
      .join('\n');
    void saveRun(
      {
        kind: 'training',
        profileId: lesson.skillId,
        title: lesson.title,
        score: sc.overallScore,
        scorecard: sc.scores,
        transcript: transcriptText,
      },
      token,
    ).catch(() => {});
    void postLiveStatus(
      {
        mode: 'training',
        state: 'finished',
        skill: lesson.title,
        startedAt: startedAtRef.current,
        finishedAt: Date.now(),
        score: sc.overallScore,
      },
      token ?? undefined,
    );
  }, [session.scorecardResult, session.practiceTranscript, lesson, token]);

  const currentIndex = PHASE_ORDER.indexOf(phase);
  const atEnd = phase === 'debrief';
  const speaking = session.coachAmplitude > 0.02;

  const handleExit = useCallback(() => {
    session.stop();
    onExit();
  }, [session, onExit]);

  const handleStart = useCallback(() => {
    setStarted(true);
    startedAtRef.current = Date.now();
    void postLiveStatus(
      { mode: 'training', state: 'active', skill: lesson.title, startedAt: startedAtRef.current },
      token ?? undefined,
    );
    void session.start();
  }, [session, lesson, token]);

  const handleFinishPractice = useCallback(async () => {
    if (scoring) return;
    setScoring(true);
    try {
      await session.finishPractice();
    } finally {
      setScoring(false);
    }
  }, [session, scoring]);

  // ───────── DEBRIEF ─────────
  if (atEnd) {
    return (
      <div className="training training--session" data-testid="training-screen">
        <TopBar
          current="training"
          hideNav
          brand={
            <div className="topbar-brand">
              <div className={`session-coach-avatar${speaking ? ' is-speaking' : ''}`} aria-hidden="true">
                <img src="/nicole-avatar.png" alt="" />
              </div>
              <div className="session-coach-info">
                <span className="topbar-brand-name">Nicole</span>
                <span className="session-coach-status">Debrief</span>
              </div>
            </div>
          }
          center={
            <span className="session-lesson-title" data-testid="phase-indicator-chip">{lesson.title}</span>
          }
          right={
            <button
              type="button"
              className="training__exit"
              data-testid="exit-button"
              onClick={handleExit}
            >
              Exit
            </button>
          }
        />
        {session.scorecardResult ? (
          <SessionResults
            scorecard={session.scorecardResult}
            transcript={session.practiceTranscript}
            repLabel={lesson.coreFramework.name}
            saving={false}
            onAgain={() => session.replayPractice()}
            onDone={handleExit}
          />
        ) : (
          <div className="session-body session-body--debrief">
            <p className="session-scoring-msg">Scoring your practice rep…</p>
          </div>
        )}
      </div>
    );
  }

  // ───────── LIVE ─────────
  const rail = (
    <div className="live-rail">
      <nav className="phase-stepper" aria-label="Lesson progress" data-testid="phase-indicator">
        {PHASE_ORDER.map((p, i) => {
          const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming';
          return (
            <div key={p} className={`phase-stepper__step is-${state}`}>
              <span className="phase-stepper__dot" aria-hidden="true" />
              <span className="phase-stepper__label">{PHASE_LABELS[p]}</span>
            </div>
          );
        })}
      </nav>
      <p className="session-goal" aria-live="polite">{PHASE_GOAL[phase]}</p>
      {!started && (
        <button type="button" className="picker-cta-bar__btn" data-testid="start-button" onClick={handleStart}>
          Begin lesson <span aria-hidden="true">→</span>
        </button>
      )}
      {phase === 'readiness_check' && (
        <button
          type="button"
          className="picker-cta-bar__btn"
          data-testid="readiness-confirm"
          onClick={() => session.advance()}
        >
          I'm ready — go live <span aria-hidden="true">→</span>
        </button>
      )}
      {phase === 'roleplay_demo' && (
        <button
          type="button"
          className="picker-cta-bar__btn"
          data-testid="practice-done"
          disabled={scoring}
          onClick={() => void handleFinishPractice()}
        >
          {scoring ? 'Scoring…' : 'I\'m done'}
        </button>
      )}
    </div>
  );

  return (
    <div className="training training--session" data-testid="training-screen">
      <TopBar
        current="training"
        hideNav
        brand={
          <div className="topbar-brand">
            <div className={`session-coach-avatar${speaking ? ' is-speaking' : ''}`} aria-hidden="true">
              <img src="/nicole-avatar.png" alt="" />
            </div>
            <div className="session-coach-info">
              <span className="topbar-brand-name">Nicole</span>
              <span className="session-coach-status">{speaking ? 'Speaking…' : started ? 'Coaching' : 'Ready'}</span>
            </div>
          </div>
        }
        center={
          <span className="session-lesson-title" data-testid="phase-indicator-chip">{lesson.title}</span>
        }
        right={
          <button
            type="button"
            className="training__exit"
            data-testid="exit-button"
            onClick={handleExit}
          >
            Exit
          </button>
        }
      />

      <LiveRoom
        lines={session.coachTranscript}
        realtime={session.coachRealtime}
        labels={{ nicole: 'Nicole' }}
        rail={rail}
      />
    </div>
  );
}

export default TrainingScreen;
