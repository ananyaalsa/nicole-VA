import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { HistoryPanel } from '../components/HistoryPanel';
import { DictationField } from '../components/DictationField';
import { generateCustomSpec, saveRun, fetchHistory } from '../training/trainingApi';
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
import { CallPresence } from '../components/CallPresence';
import { MicControls } from '../components/MicControls';
import { CoachingTip } from '../components/CoachingTip';
import { useStuckDetection } from '../training/useStuckDetection';
import { buildCoachingTip } from '../training/lessonPrompts';
import { useDebouncedSpeaking } from '../engine/useDebouncedSpeaking';
import { useIsMobile } from '../engine/useIsMobile';
import { CenterAvatar } from '../live2d/CenterAvatar';
import { loadAvatarPrefs } from '../live2d/avatars';
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
// Plain-language phase labels (no jargon like "Model"/"Gate"/"Baseline") so it's
// obvious what each step is. Shown in the rail with a "Step N of M" position.
const PHASE_LABELS: Record<Phase, string> = {
  intro: 'Get set up',
  teach: 'Learn the steps',
  model: "See it done",
  guided_practice: 'Practice with help',
  baseline_assess: 'Baseline',
  readiness_check: 'Ready check',
  level_gate: 'Gate',
  roleplay_demo: 'Live rep',
  debrief: 'Your results',
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
  // Set when scoring the practice rep fails; shows a retry instead of a fake 0/10.
  const [scoreError, setScoreError] = useState(false);
  const { token } = (useAuth() as { token?: string | null });
  const startedAtRef = useRef(Date.now());
  // The scorecard object we last persisted. Tracking by IDENTITY (not a boolean)
  // means a SECOND rep — which produces a NEW scorecardResult object via "Again" —
  // saves again, while a re-render with the same object never double-saves. The
  // old boolean guard permanently blocked every rep after the first.
  const savedScorecardRef = useRef<unknown>(null);
  const autoStartedRef = useRef(false);
  // Past overall scores for THIS skill (oldest→newest), for the report's trend
  // graph. Loaded when the debrief opens; excludes the current run (the report
  // appends it). Best-effort — the graph just hides if it can't load.
  const [pastScores, setPastScores] = useState<number[]>([]);

  // Mounting this component IS the user's intent to begin (they tapped "Start
  // drill" on the picker), so we AUTO-START the lesson — no extra "Begin lesson"
  // click. Nicole opens the drill herself and drives it from here.
  // GUARDED so it fires exactly once: React StrictMode double-invokes mount
  // effects in dev, and a second start() reconnected the coach and stranded the
  // [OPEN] directive — the room got stuck on "getting your lesson ready…".
  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    setStarted(true);
    startedAtRef.current = Date.now();
    void postLiveStatus(
      { mode: 'training', state: 'active', skill: lesson.title, startedAt: startedAtRef.current },
      token ?? undefined,
    );
    void session.start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save run + post 'finished' each time a NEW scorecardResult appears (one per
  // completed rep, including replays). Guard by object identity so re-renders
  // don't re-save the same result.
  useEffect(() => {
    if (!session.scorecardResult || savedScorecardRef.current === session.scorecardResult) return;
    savedScorecardRef.current = session.scorecardResult;
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

  // Load past scores for THIS skill once the debrief opens, for the trend graph.
  useEffect(() => {
    if (phase !== 'debrief') return;
    let alive = true;
    void fetchHistory(token)
      .then((runs) => {
        if (!alive) return;
        const scores = runs
          .filter((r) => r.kind === 'training' && r.profileId === lesson.skillId && typeof r.score === 'number')
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .map((r) => r.score as number);
        // Exclude the just-saved current run (the report appends it itself) by
        // dropping the most recent if it matches this run's score closely.
        setPastScores(scores.slice(0, Math.max(0, scores.length - 1)));
      })
      .catch(() => { /* graph hides if history can't load */ });
    return () => { alive = false; };
  }, [phase, lesson.skillId, token]);

  const currentIndex = PHASE_ORDER.indexOf(phase);
  const atEnd = phase === 'debrief';
  // Use the ACTIVE speaker's amplitude — the prospect during the live rep, the
  // coach otherwise — so the on-screen "speaking" pulse tracks whoever is talking.
  const speaking = useDebouncedSpeaking(session.activeAmplitude > 0.02);

  // Mobile = the big centered lip-syncing avatar, no transcript. The COACH is
  // Nicole (the user's companion avatar, Aria/Noah); the live-rep PROSPECT is the
  // male Natori avatar. The active session's amplitude drives the lip-sync.
  const isMobile = useIsMobile();
  const companionId: 'aria' | 'noah' = loadAvatarPrefs().avatar === 'noah' ? 'noah' : 'aria';
  const centerAvatarId: 'aria' | 'noah' | 'chitose' = session.inLiveRep ? 'chitose' : companionId;

  // Live-rep coaching tips (TRAINING ONLY): detect when the learner is stuck during
  // the rep and surface a short text tip from the lesson's framework — no extra
  // session, no voice. Detection is gated to the live rep.
  const stuckSignal = useStuckDetection({
    transcript: session.activeTranscript,
    active: session.inLiveRep && started,
  });
  const [dismissedTipId, setDismissedTipId] = useState<number | null>(null);
  const activeTip = stuckSignal && stuckSignal.id !== dismissedTipId ? stuckSignal : null;

  const handleExit = useCallback(() => {
    session.stop();
    // Tell Talk-Nicole the truth about what just happened so she doesn't
    // mis-congratulate. If the drill produced a scorecard the user COMPLETED it
    // (state 'finished' is already posted by the save effect); if they bailed
    // before finishing, mark it 'left' so she never says "nice work finishing!".
    if (!session.scorecardResult) {
      void postLiveStatus(
        { mode: 'training', state: 'left', skill: lesson.title, startedAt: startedAtRef.current, finishedAt: Date.now() },
        token ?? undefined,
      );
    }
    onExit();
  }, [session, onExit, lesson, token]);

  const handleFinishPractice = useCallback(async () => {
    if (scoring) return;
    setScoring(true);
    setScoreError(false);
    try {
      await session.finishPractice();
    } catch {
      // The judge call failed. Don't show/save a fake 0 — surface a retry; the rep
      // is still live (finishPractice threw before moving to debrief).
      setScoreError(true);
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
          // Scroll wrapper: the screen is 100dvh/overflow-hidden, so the report
          // (which is taller than the viewport) MUST live in its own scroll area
          // or its lower half is clipped with no way to reach it.
          <div className="session-report-scroll" data-testid="session-report-scroll">
            <SessionResults
              scorecard={session.scorecardResult}
              transcript={session.practiceTranscript}
              repLabel={lesson.coreFramework.name}
              saving={false}
              pastScores={pastScores}
              onAgain={() => session.replayPractice()}
              onDone={handleExit}
            />
          </div>
        ) : (
          <div className="session-body session-body--debrief">
            <p className="session-scoring-msg">Scoring your practice rep…</p>
          </div>
        )}
      </div>
    );
  }

  // ───────── LIVE ─────────
  const stepNumber = currentIndex >= 0 ? currentIndex + 1 : 1;
  const rail = (
    <div className="live-rail">
      {/* Unmistakable "where you are": Step N of M + the current phase name. */}
      <div className="phase-now" data-testid="phase-now">
        <span className="phase-now__step">Step {stepNumber} of {PHASE_ORDER.length}</span>
        <span className="phase-now__name">{PHASE_LABELS[phase]}</span>
      </div>
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
      {/* Go-live button: shown ONLY once the learner has worked through every
          teaching phase and reached the Ready check (i.e. all earlier steps are
          done). It is NOT a "skip ahead" during teaching — the user wanted the
          button to appear only when they've actually completed the steps, with a
          "you're ready" label they must click to enter the live rep. */}
      {phase === 'readiness_check' && (
        <button
          type="button"
          className="picker-cta-bar__btn"
          data-testid="readiness-confirm"
          onClick={() => session.goLive()}
        >
          You&apos;re ready, enter the live rep <span aria-hidden="true">→</span>
        </button>
      )}
      {/* The live "I'm done" action lives in the footer bar (room-footer). */}
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
              <img src={session.inLiveRep ? '/nicole-avatar-male.png' : '/nicole-avatar.png'} alt="" />
            </div>
            <div className="session-coach-info">
              {/* During the live rep the user is on the phone with the PROSPECT,
                  not Nicole — reflect that in the topbar so it isn't mislabeled. */}
              <span className="topbar-brand-name">{session.inLiveRep ? session.prospectLabel : 'Nicole'}</span>
              <span className="session-coach-status">
                {session.inLiveRep
                  ? (speaking ? 'Speaking…' : 'On the call')
                  : (speaking ? 'Speaking…' : started ? 'Coaching' : 'Ready')}
              </span>
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
        lines={session.activeTranscript}
        realtime={session.activeRealtime}
        labels={{ nicole: session.inLiveRep ? session.prospectLabel : 'Nicole' }}
        mobileCenter={isMobile}
        centerAvatar={
          <CenterAvatar
            key={centerAvatarId}
            amplitude={session.activeAmplitude}
            speaking={speaking}
            avatarId={centerAvatarId}
            colors={session.inLiveRep ? undefined : loadAvatarPrefs().colors[companionId]}
          />
        }
        presence={
          <CallPresence
            name={session.inLiveRep ? session.prospectLabel : 'Nicole'}
            status={PHASE_GOAL[phase]}
            avatarSrc={session.inLiveRep ? '/nicole-avatar-male.png' : '/nicole-avatar.png'}
            speaking={speaking}
            live={started}
          />
        }
        emptyState={
          <span>
            {phase === 'roleplay_demo'
              ? 'Your live rep is starting. Take the call.'
              : 'Nicole is getting your lesson ready…'}
          </span>
        }
        rail={rail}
        footer={
          <>
            {/* Mic-ready indicator + manual mic / AI-mute, so the user knows when
                their voice is heard and can mute either side at will. */}
            <MicControls
              ready={session.ready}
              micOn={session.micOn}
              onToggleMic={session.toggleMic}
              aiMuted={session.aiMuted}
              onToggleAiMute={session.toggleAiMute}
            />
            <div className="room-footer__actions">
              {phase === 'roleplay_demo' && (
                <button
                  type="button"
                  className="picker-cta-bar__btn"
                  data-testid="practice-done-footer"
                  disabled={scoring}
                  onClick={() => void handleFinishPractice()}
                >
                  {scoring ? 'Scoring…' : scoreError ? 'Retry scoring' : "I'm done"}
                </button>
              )}
            </div>
          </>
        }
      />

      {/* Live-rep coaching tip (Training only) — appears when the learner is stuck. */}
      {session.inLiveRep && activeTip && (
        <CoachingTip
          tip={buildCoachingTip(lesson, activeTip.type, activeTip.id)}
          kind={activeTip.type}
          signalId={activeTip.id}
          onDismiss={() => setDismissedTipId(activeTip.id)}
        />
      )}
    </div>
  );
}

export default TrainingScreen;
