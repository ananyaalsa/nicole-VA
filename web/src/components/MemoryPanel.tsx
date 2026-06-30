import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useAuth } from '../auth/AuthContext';
import './MemoryPanel.css';

export interface MemoryPanelProps {
  /** Close the memory overlay. */
  onClose?: () => void;
}

/** One stored fact as returned by GET /api/memory. */
interface MemoryFact {
  id?: number;
  key: string;
  fact: string;
  factType?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Human label for a topic/factType ("business" → "Business", blank → "Other"). */
function topicLabel(factType?: string): string {
  const t = (factType ?? '').trim();
  if (!t || t === 'general' || t === 'inferred' || t === 'explicit') return 'Other';
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ');
}

/** Pretty label for a profile key (user_about → About). */
function profileLabel(key: string): string {
  switch (key) {
    case 'user_about': return 'About you';
    case 'user_goals': return 'Goals';
    case 'user_phone': return 'Phone';
    case 'user_name': return 'Name';
    default: return key.replace(/^user_/, '').replace(/_/g, ' ');
  }
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Render a goals JSON array or raw string readably. */
function readable(key: string, fact: string): string {
  if (key === 'user_goals') {
    try {
      const arr = JSON.parse(fact);
      if (Array.isArray(arr)) return arr.join(', ');
    } catch { /* fall through */ }
  }
  return fact;
}

/**
 * "What Nicole remembers" — a per-user view of everything Nicole has stored about
 * you, split into PROFILE facts (what you set) and LEARNED facts grouped by topic
 * (what came up in conversation), with the ability to delete any of them. Mirrors
 * the HistoryPanel overlay so it feels native. Read/delete only (edit happens by
 * just telling Nicole, which is the product's voice-first ethos).
 */
export function MemoryPanel({ onClose }: MemoryPanelProps): JSX.Element {
  const { token } = useAuth();
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch('/api/memory', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => {
        if (!r.ok) throw new Error('Could not load your memory');
        return r.json() as Promise<{ facts: MemoryFact[] }>;
      })
      .then((d) => { if (alive) { setFacts(d.facts ?? []); setLoading(false); } })
      .catch((e: unknown) => { if (alive) { setError(e instanceof Error ? e.message : 'Failed to load'); setLoading(false); } });
    return () => { alive = false; };
  }, [token]);

  const deleteFact = useCallback(async (key: string) => {
    // Optimistic remove.
    setFacts((prev) => prev.filter((f) => f.key !== key));
    try {
      await fetch(`/api/memory/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch { /* best-effort; it's already gone from the list */ }
  }, [token]);

  const profile = facts.filter((f) => f.source === 'settings');
  const learned = facts.filter((f) => f.source !== 'settings');

  // Group learned facts by topic.
  const byTopic = new Map<string, MemoryFact[]>();
  for (const f of learned) {
    const label = topicLabel(f.factType);
    const arr = byTopic.get(label) ?? [];
    arr.push(f);
    byTopic.set(label, arr);
  }
  const topicOrder = ['Identity', 'Business', 'Goal', 'Goals', 'Project', 'Preference', 'Preferences', 'People', 'Travel', 'Weather', 'Health', 'Finance'];
  const rank = (l: string) => (topicOrder.indexOf(l) >= 0 ? topicOrder.indexOf(l) : l === 'Other' ? 999 : 500);
  const topics = [...byTopic.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  const empty = !loading && !error && facts.length === 0;

  return (
    <div className="history memory-panel" data-testid="memory-panel" role="dialog" aria-label="What Nicole remembers">
      <div className="history__scrim" data-testid="memory-scrim" onClick={onClose} aria-hidden="true" />
      <section className="history__sheet hud-panel">
        <header className="history__head">
          <div className="history__head-left">
            <span className="brand-mark" aria-hidden="true" />
            <div>
              <span className="hud-label">Memory&nbsp;·&nbsp;What Nicole knows</span>
              <h2 className="history__title">What Nicole remembers</h2>
            </div>
          </div>
          {onClose && (
            <button type="button" className="history__close" data-testid="memory-close-button" onClick={onClose} aria-label="Close memory">✕</button>
          )}
        </header>

        <div className="history__body">
          {loading && <p className="history__status hud-label" data-testid="memory-loading">Loading…</p>}
          {error && <p className="history__status history__status--bad" data-testid="memory-error">{error}</p>}
          {empty && (
            <p className="history__empty" data-testid="memory-empty">
              Nicole hasn't saved anything about you yet. As you talk, she'll remember the things that matter.
            </p>
          )}

          {!loading && !error && profile.length > 0 && (
            <section className="mem-group" data-testid="memory-profile">
              <h3 className="mem-group__title">From your profile</h3>
              <p className="mem-group__hint">Things you set — Nicole knows these, you didn't necessarily discuss them.</p>
              <ul className="mem-list">
                {profile.map((f) => (
                  <li key={f.key} className="mem-card" data-testid="memory-fact">
                    <div className="mem-card__body">
                      <span className="mem-card__key">{profileLabel(f.key)}</span>
                      <span className="mem-card__fact">{readable(f.key, f.fact)}</span>
                    </div>
                    <button type="button" className="mem-card__delete" onClick={() => void deleteFact(f.key)} aria-label={`Forget ${profileLabel(f.key)}`}>✕</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!loading && !error && topics.map((topic) => (
            <section className="mem-group" key={topic} data-testid="memory-topic">
              <h3 className="mem-group__title">{topic}</h3>
              <ul className="mem-list">
                {byTopic.get(topic)!
                  .slice()
                  .sort((a, b) => (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? ''))
                  .map((f) => (
                    <li key={f.key} className="mem-card" data-testid="memory-fact">
                      <div className="mem-card__body">
                        <span className="mem-card__fact">{readable(f.key, f.fact)}</span>
                        {formatDate(f.updatedAt ?? f.createdAt) && (
                          <span className="mem-card__date">{formatDate(f.updatedAt ?? f.createdAt)}</span>
                        )}
                      </div>
                      <button type="button" className="mem-card__delete" onClick={() => void deleteFact(f.key)} aria-label="Forget this">✕</button>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

export default MemoryPanel;
