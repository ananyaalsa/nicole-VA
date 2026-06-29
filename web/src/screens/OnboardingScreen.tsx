import { useState } from 'react';
import type { JSX } from 'react';
import { VOICES } from '../audio/voices';
import { useAuth } from '../auth/AuthContext';
import './OnboardingScreen.css';

const TOTAL_STEPS = 4;

type Goal = 'Sales coaching' | 'Interview prep' | 'General assistant';
const ALL_GOALS: Goal[] = ['Sales coaching', 'Interview prep', 'General assistant'];

export function OnboardingScreen(): JSX.Element {
  const auth = useAuth();
  const [step, setStep] = useState(1);
  const [goals, setGoals] = useState<Set<Goal>>(new Set());
  const [voice, setVoice] = useState<string>(auth.user?.preferredVoice ?? 'Aoede');
  const [saving, setSaving] = useState(false);

  const displayName = auth.user?.displayName ?? 'Friend';

  const femaleVoices = VOICES.filter((v) => v.gender === 'female');
  const maleVoices = VOICES.filter((v) => v.gender === 'male');

  async function finishOnboarding() {
    setSaving(true);
    try {
      // Save voice + mark onboarding done
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ preferredVoice: voice, onboardingDone: true }),
      });
      if (res.ok) {
        const updated = await res.json();
        auth.updateUser({ preferredVoice: updated.preferredVoice, onboardingDone: true });
      } else {
        auth.updateUser({ preferredVoice: voice, onboardingDone: true });
      }
      // Persist goals to memory so Nicole knows them from day one
      if (goals.size > 0) {
        await fetch('/api/memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
          body: JSON.stringify({ key: 'user_goals', fact: JSON.stringify([...goals]), factType: 'preference' }),
        });
      }
    } catch {
      auth.updateUser({ preferredVoice: voice, onboardingDone: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ob-page">
      <div className="ob-card">
        {/* Progress dots */}
        <div className="ob-dots" aria-label={`Step ${step} of ${TOTAL_STEPS}`}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <span key={i} className={`ob-dot ${i < step ? 'is-filled' : ''}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="ob-step">
            <img src="/nicole-avatar.png" alt="Nicole" className="ob-avatar" />
            <h1 className="ob-title">Hi {displayName}, I am Nicole.</h1>
            <p className="ob-sub">Your Personal Virtual Assistant</p>
            <button className="ob-btn-primary" onClick={() => setStep(2)}>
              Get started
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="ob-step">
            <h2 className="ob-title">What brings you here?</h2>
            <p className="ob-sub">Pick all that suit you best</p>
            <div className="ob-goals">
              {ALL_GOALS.map((g) => {
                const selected = goals.has(g);
                return (
                  <button
                    key={g}
                    className={`ob-goal-card ${selected ? 'is-selected' : ''}`}
                    onClick={() => {
                      setGoals((prev) => {
                        const next = new Set(prev);
                        next.has(g) ? next.delete(g) : next.add(g);
                        return next;
                      });
                    }}
                    type="button"
                    aria-pressed={selected ? true : false}
                  >
                    <span className="ob-goal-check" aria-hidden="true">
                      {selected ? '✓' : ''}
                    </span>
                    {g}
                  </button>
                );
              })}
            </div>
            <button
              className="ob-btn-primary"
              onClick={() => setStep(3)}
              disabled={goals.size === 0}
            >
              Next
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="ob-step">
            <h2 className="ob-title">Pick Nicole's voice</h2>
            <p className="ob-sub">Choose how you want Nicole to sound</p>
            <div className="ob-voice-group">
              <span className="ob-voice-label">Female</span>
              <div className="ob-voice-pills">
                {femaleVoices.map((v) => (
                  <button
                    key={v.name}
                    className={`ob-voice-pill ${voice === v.name ? 'is-selected' : ''}`}
                    onClick={() => setVoice(v.name)}
                    type="button"
                  >
                    {v.name}
                    <span className="ob-voice-vibe">{v.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="ob-voice-group">
              <span className="ob-voice-label">Male</span>
              <div className="ob-voice-pills">
                {maleVoices.map((v) => (
                  <button
                    key={v.name}
                    className={`ob-voice-pill ${voice === v.name ? 'is-selected' : ''}`}
                    onClick={() => setVoice(v.name)}
                    type="button"
                  >
                    {v.name}
                    <span className="ob-voice-vibe">{v.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <button className="ob-btn-primary" onClick={() => setStep(4)}>
              Next
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="ob-step">
            <img src="/nicole-avatar.png" alt="Nicole" className="ob-avatar" />
            <h2 className="ob-title">You are all set.</h2>
            <p className="ob-sub ob-opening">
              "I am ready whenever you are, {displayName}. Let's start with something real."
            </p>
            <button
              className="ob-btn-primary"
              onClick={finishOnboarding}
              disabled={saving}
            >
              {saving ? 'Starting...' : 'Start talking'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
