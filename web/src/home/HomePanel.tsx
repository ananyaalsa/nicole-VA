import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useAuth } from '../auth/AuthContext';
import { fetchHistory, type TrainingRun } from '../training/trainingApi';
import { fetchBrief, type Brief, type BriefSection, type BriefEmail, type BriefEvent } from './briefApi';
import { pingActivity } from './activityApi';
import { BRAND_ICONS } from '../integrations/brandIcons';
import {
  greeting, starters, coachStats,
  type Starter, type CoachStats,
} from './homeData';
import './HomePanel.css';

export interface HomePanelProps {
  /** Tap a starter → begin a session seeded with that prompt. */
  onStarter: (prompt: string) => void;
  /** Tap the weak-spot drill → go to Training. */
  onDrill: (weakest: string) => void;
}

/**
 * Render the email section as a calm one-liner: a count headline + the top 2
 * sender names (no subjects, no raw addresses), instead of the run-on spoken
 * summary. Falls back to the summary text if structured data isn't present.
 */
function renderEmails(section: BriefSection): JSX.Element {
  const items = Array.isArray(section.data) ? (section.data as BriefEmail[]) : [];
  if (!items.length) return <p className="home-brief-card__text">{section.summary}</p>;
  // Keep it calm: a count headline + just the top 2 senders (no subjects), so
  // the card reassures at a glance rather than reproducing the inbox.
  const shown = items.slice(0, 2);
  const extra = items.length - shown.length;
  return (
    <p className="home-brief-card__text">
      <strong>{items.length}</strong> recent {items.length === 1 ? 'email' : 'emails'}
      {': '}
      {shown.map((e) => e.from).join(', ')}
      {extra > 0 ? ` +${extra} more` : ''}
    </p>
  );
}

/**
 * Render the calendar section as a clean list — one event per row with its
 * title and a readable day + time — instead of a cramped run-on summary like
 * "You have 3 upcoming: X at 30/6/2026, 7:30:00 pm; Y at …". Falls back to the
 * spoken summary if structured data isn't present.
 */
function renderCalendar(section: BriefSection): JSX.Element {
  const events = Array.isArray(section.data) ? (section.data as BriefEvent[]) : [];
  if (!events.length) return <p className="home-brief-card__text">{section.summary}</p>;
  const fmt = (e: BriefEvent): string => {
    const iso = e.start?.dateTime ?? e.start?.date ?? '';
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const allDay = !e.start?.dateTime; // date-only events have no time
    const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    if (allDay) return day;
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${day} · ${time}`;
  };
  const shown = events.slice(0, 4);
  const extra = events.length - shown.length;
  return (
    <ul className="brief-list" data-testid="brief-calendar-list">
      {shown.map((e, i) => (
        <li key={i} className="brief-list__row">
          <span className="brief-list__title">{e.summary || 'Untitled event'}</span>
          <span className="brief-list__meta">{fmt(e)}</span>
        </li>
      ))}
      {extra > 0 && <li className="brief-list__more">+{extra} more</li>}
    </ul>
  );
}

const STREAK_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M13 2c.5 3-1.5 4.5-3 6S7 11 7 13a5 5 0 0 0 10 0c0-2-1-3.5-2-5 .5 1.5 0 3-1 3.5.5-2-1-4-1-9z" />
  </svg>
);

/**
 * The personalized Talk home (shown before a session starts): greeting, an
 * optional daily-brief card, a coach strip (streak / last score / weak spot),
 * recent-session resume tiles, and goal-personalized one-tap starter chips.
 * Everything degrades gracefully when there's no data yet.
 */
export function HomePanel({ onStarter, onDrill }: HomePanelProps): JSX.Element {
  const { user, token } = useAuth();
  const [goals, setGoals] = useState<string[]>([]);
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefDismissed, setBriefDismissed] = useState(false);
  // Server-computed streak (counts ANY day Nicole is opened, not just scored
  // reps). null until the ping resolves, then it overrides the history-only one.
  const [dailyStreak, setDailyStreak] = useState<number | null>(null);

  // Load goals (memory), history, and the daily brief in parallel. Also ping the
  // activity tracker so simply opening Nicole today advances the streak.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    fetch('/api/memory', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d: { facts?: Array<{ key: string; fact: string }> }) => {
        if (!alive) return;
        const raw = d.facts?.find((f) => f.key === 'user_goals')?.fact ?? '';
        try { setGoals(JSON.parse(raw)); } catch { if (raw) setGoals([raw]); }
      })
      .catch(() => {});
    fetchHistory(token).then((r) => alive && setRuns(r)).catch(() => {});
    fetchBrief(token).then((b) => alive && setBrief(b)).catch(() => {});
    pingActivity(token).then((s) => { if (alive && s != null) setDailyStreak(s); }).catch(() => {});
    return () => { alive = false; };
  }, [token]);

  const hello = greeting(user?.displayName);
  const chips: Starter[] = starters(goals, 3);
  const baseStats: CoachStats = coachStats(runs);
  // Prefer the server's daily streak; fall back to the history-derived one until
  // the ping resolves (so the pill doesn't flicker to 0 on load).
  const stats: CoachStats = { ...baseStats, streak: dailyStreak ?? baseStats.streak };
  const showBrief = !briefDismissed && brief?.available && Object.keys(brief.sections).length > 0;

  const dismissBrief = useCallback(() => setBriefDismissed(true), []);

  return (
    <div className="home" data-testid="home-panel">
      {/* Daily brief — separate cards per source, with brand icons. */}
      {showBrief && brief && (
        <div className="home-brief" data-testid="home-brief">
          <div className="home-brief__head">
            <span className="home-brief__title">Your brief</span>
            <button type="button" className="home-brief__close" onClick={dismissBrief} aria-label="Dismiss brief">×</button>
          </div>
          <div className="home-brief__cards">
            {brief.sections.calendar && (
              <div className="home-brief-card" data-source="calendar">
                <div className="home-brief-card__head">
                  <span className="home-brief-card__ic">{BRAND_ICONS.calendar}</span>
                  <span className="home-brief-card__label">Calendar</span>
                </div>
                {renderCalendar(brief.sections.calendar)}
              </div>
            )}
            {brief.sections.email && (
              <div className="home-brief-card" data-source="email">
                <div className="home-brief-card__head">
                  <span className="home-brief-card__ic">{BRAND_ICONS.gmail}</span>
                  <span className="home-brief-card__label">Email</span>
                </div>
                {renderEmails(brief.sections.email)}
              </div>
            )}
            {brief.sections.tasks && (
              <div className="home-brief-card" data-source="tasks">
                <div className="home-brief-card__head">
                  <span className="home-brief-card__ic">{BRAND_ICONS.todoist}</span>
                  <span className="home-brief-card__label">Tasks</span>
                </div>
                <p className="home-brief-card__text">{brief.sections.tasks.summary}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Greeting */}
      <h2 className="home-greeting" data-testid="home-greeting">{hello}</h2>
      <p className="home-sub">Start talking, or pick one below.</p>

      {/* Coach strip — only with meaningful history. A 0.0 last score is almost
          always a junk/failed run, so don't surface it (the user found "Last: 0.0"
          confusing). Only show the last-score pill for a real (> 0) score. */}
      {(() => {
        const showScore = stats.lastScore != null && stats.lastScore > 0;
        const showStrip = stats.streak > 0 || showScore || !!stats.weakest;
        if (!showStrip) return null;
        return (
        <div className="home-coach" data-testid="home-coach">
          {stats.streak > 0 && (
            <span className="home-coach__pill" title="Practice streak">
              {STREAK_ICON} {stats.streak}-day streak
            </span>
          )}
          {showScore && (
            <span className="home-coach__pill">
              Last: {stats.lastScore!.toFixed(1)}
              {stats.trend === 'up' && <span className="home-coach__trend up"> ↑</span>}
              {stats.trend === 'down' && <span className="home-coach__trend down"> ↓</span>}
            </span>
          )}
          {stats.weakest && (
            <button type="button" className="home-coach__drill" onClick={() => onDrill(stats.weakest!)}>
              Drill your weak spot: {stats.weakest} →
            </button>
          )}
        </div>
        );
      })()}

      {/* Starter chips — one tap to send */}
      <div className="home-chips" data-testid="home-chips">
        {chips.map((s) => (
          <button key={s.label} type="button" className="home-chip" onClick={() => onStarter(s.prompt)}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default HomePanel;
