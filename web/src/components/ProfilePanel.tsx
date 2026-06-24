import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useAuth } from '../auth/AuthContext';
import './ProfilePanel.css';

/* ── Types ───────────────────────────────────────────────────────────────── */

interface MemoryFact { key: string; fact: string; fact_type?: string; }
type Tab = 'profile' | 'integrations' | 'memory';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function initials(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0] ?? '').slice(0, 2).join('').toUpperCase() || '?';
}

function prettifyKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Integration data with SVG icons ─────────────────────────────────────── */

const INTEGRATIONS = [
  {
    id: 'gcal', name: 'Google Calendar', desc: 'Schedule & book meetings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="intg-svg"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#4285F4" strokeWidth="1.8"/><path d="M3 9h18" stroke="#4285F4" strokeWidth="1.8"/><path d="M8 4V2M16 4V2" stroke="#4285F4" strokeWidth="1.8" strokeLinecap="round"/><rect x="7" y="13" width="4" height="4" rx="0.5" fill="#EA4335"/></svg>
    ),
  },
  {
    id: 'gmail', name: 'Gmail', desc: 'Summarize & draft replies',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="intg-svg"><rect x="2" y="5" width="20" height="14" rx="2" stroke="#EA4335" strokeWidth="1.8"/><path d="M2 7l10 7 10-7" stroke="#EA4335" strokeWidth="1.8" strokeLinejoin="round"/></svg>
    ),
  },
  {
    id: 'slack', name: 'Slack', desc: 'Post notes & check messages',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="intg-svg"><path d="M9 3a2 2 0 1 0 0 4h2V3a2 2 0 0 0-2 0z" fill="#E01E5A"/><path d="M3 9a2 2 0 0 0 4 0V7H5a2 2 0 0 0-2 2z" fill="#36C5F0"/><path d="M15 21a2 2 0 1 0 0-4h-2v2a2 2 0 0 0 2 2z" fill="#2EB67D"/><path d="M21 15a2 2 0 0 0-4 0v2h2a2 2 0 0 0 2-2z" fill="#ECB22E"/><path d="M3 15a2 2 0 0 0 4 0v-2H5a2 2 0 0 0-2 2z" fill="#E01E5A"/><path d="M9 21a2 2 0 0 0 0-4H7v2a2 2 0 0 0 2 2z" fill="#36C5F0"/><path d="M21 9a2 2 0 0 0-4 0v2h2a2 2 0 0 0 2-2z" fill="#2EB67D"/><path d="M15 3a2 2 0 1 0 0 4h2V5a2 2 0 0 0-2-2z" fill="#ECB22E"/></svg>
    ),
  },
  {
    id: 'notion', name: 'Notion', desc: 'Access notes & docs',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="intg-svg"><rect x="4" y="2" width="16" height="20" rx="2" stroke="#1C1917" strokeWidth="1.8"/><path d="M8 7h8M8 11h5M8 15h6" stroke="#1C1917" strokeWidth="1.8" strokeLinecap="round"/></svg>
    ),
  },
  {
    id: 'spotify', name: 'Spotify', desc: 'Play music by voice',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="intg-svg"><circle cx="12" cy="12" r="10" stroke="#1DB954" strokeWidth="1.8"/><path d="M7 10.5c3-1 6.5-1 9 .5M7.5 13.5c2.5-.8 5.5-.8 8 .5M8 16.5c2-.6 4.5-.6 6.5.3" stroke="#1DB954" strokeWidth="1.8" strokeLinecap="round"/></svg>
    ),
  },
  {
    id: 'whatsapp', name: 'WhatsApp', desc: 'Send messages hands-free',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="intg-svg"><circle cx="12" cy="12" r="10" stroke="#25D366" strokeWidth="1.8"/><path d="M8 15.5c1-1 2-2.5 2.5-3.5 0 0 1 1 2 1 1.5 0 3-2 3-4C15.5 7.5 14 6 12 6c-2.5 0-4.5 2-4.5 4.5 0 1 .3 1.8.8 2.5L7.5 16l2-0.5z" stroke="#25D366" strokeWidth="1.5" strokeLinejoin="round"/></svg>
    ),
  },
  {
    id: 'todoist', name: 'Todoist', desc: 'Capture tasks by voice',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="intg-svg"><circle cx="12" cy="12" r="10" stroke="#DB4035" strokeWidth="1.8"/><path d="M8 12l3 3 5-5" stroke="#DB4035" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  {
    id: 'gmeet', name: 'Google Meet', desc: 'Join calls, get AI notes',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="intg-svg"><rect x="2" y="6" width="13" height="12" rx="2" stroke="#00AC47" strokeWidth="1.8"/><path d="M15 10l5-3v10l-5-3V10z" stroke="#00AC47" strokeWidth="1.8" strokeLinejoin="round"/></svg>
    ),
  },
] as const;

/* ── Goal options ─────────────────────────────────────────────────────────── */

const ALL_GOALS = [
  'Sales coaching',
  'Cold calling',
  'Objection handling',
  'Closing techniques',
  'Interview prep',
  'Real estate sales',
  'Productivity',
  'General assistant',
];

const COUNTRY_CODES = [
  { code: 'US', flag: '🇺🇸', dial: '+1',   name: 'United States' },
  { code: 'GB', flag: '🇬🇧', dial: '+44',  name: 'United Kingdom' },
  { code: 'IN', flag: '🇮🇳', dial: '+91',  name: 'India' },
  { code: 'AU', flag: '🇦🇺', dial: '+61',  name: 'Australia' },
  { code: 'CA', flag: '🇨🇦', dial: '+1',   name: 'Canada' },
  { code: 'AE', flag: '🇦🇪', dial: '+971', name: 'UAE' },
  { code: 'SG', flag: '🇸🇬', dial: '+65',  name: 'Singapore' },
  { code: 'ZA', flag: '🇿🇦', dial: '+27',  name: 'South Africa' },
  { code: 'NG', flag: '🇳🇬', dial: '+234', name: 'Nigeria' },
  { code: 'DE', flag: '🇩🇪', dial: '+49',  name: 'Germany' },
  { code: 'FR', flag: '🇫🇷', dial: '+33',  name: 'France' },
  { code: 'PK', flag: '🇵🇰', dial: '+92',  name: 'Pakistan' },
  { code: 'BD', flag: '🇧🇩', dial: '+880', name: 'Bangladesh' },
  { code: 'PH', flag: '🇵🇭', dial: '+63',  name: 'Philippines' },
  { code: 'NZ', flag: '🇳🇿', dial: '+64',  name: 'New Zealand' },
];

/* ── ProfileTab ──────────────────────────────────────────────────────────── */

/* ── Goals field with custom Add ─────────────────────────────────────────── */

interface GoalsFieldProps {
  goals: string[];
  loaded: boolean;
  toggleGoal(g: string): Promise<void>;
  saveMemory(key: string, fact: string): Promise<void>;
  setGoals: React.Dispatch<React.SetStateAction<string[]>>;
}

function GoalsField({ goals, loaded, toggleGoal, saveMemory, setGoals }: GoalsFieldProps): JSX.Element {
  const [custom, setCustom] = useState('');
  const LIMIT = 40;

  const addCustom = async () => {
    const trimmed = custom.trim();
    if (!trimmed || goals.includes(trimmed)) { setCustom(''); return; }
    const next = [...goals, trimmed];
    setGoals(next);
    setCustom('');
    await saveMemory('user_goals', JSON.stringify(next));
  };

  return (
    <div className="pfield">
      <div className="pfield__label-row">
        <span className="pfield__label">Your goals</span>
        <span className="pfield__hint">Tap to select · {loaded ? `${goals.length} active` : '…'}</span>
      </div>
      <div className="goals-grid">
        {ALL_GOALS.map((g) => {
          const on = goals.includes(g);
          return (
            <button key={g} type="button" className={`goal-toggle${on ? ' is-on' : ''}`}
              onClick={() => void toggleGoal(g)} aria-pressed={on}>
              {on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
              {g}
            </button>
          );
        })}
        {/* Custom goals already in memory (not in ALL_GOALS) */}
        {goals.filter((g) => !ALL_GOALS.includes(g)).map((g) => (
          <button key={g} type="button" className="goal-toggle is-on is-custom"
            onClick={() => void toggleGoal(g)} aria-pressed="true">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            {g}
          </button>
        ))}
      </div>
      {/* Custom goal input */}
      <div className="goal-add-row">
        <input
          className="goal-add-input"
          type="text"
          placeholder="Add your own goal…"
          value={custom}
          maxLength={LIMIT}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void addCustom(); }}
          aria-label="Add custom goal"
        />
        <span className="goal-add-count">{LIMIT - custom.length}</span>
        <button type="button" className="goal-add-btn" onClick={() => void addCustom()} disabled={!custom.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}

/* ── Searchable phone field ───────────────────────────────────────────────── */

interface PhoneFieldProps {
  cc: string; onCcChange(v: string): void;
  num: string; onNumChange(v: string): void;
  onSave(): void; saving: boolean;
}

function PhoneField({ cc, onCcChange, num, onNumChange, onSave, saving }: PhoneFieldProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = COUNTRY_CODES.find((c) => c.dial === cc) ?? COUNTRY_CODES[0];
  const filtered = COUNTRY_CODES.filter((c) =>
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.dial.includes(search)
  );

  useEffect(() => {
    if (!open) { setSearch(''); return; }
    setTimeout(() => searchRef.current?.focus(), 40);
  }, [open]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  return (
    <div className="phone-field">
      <div className="phone-field__row">
        {/* Country code trigger */}
        <div className="phone-cc" ref={dropRef}>
          <button type="button" className="phone-cc__trigger" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
            <span className="phone-cc__flag">{selected.flag}</span>
            <span className="phone-cc__dial">{selected.dial}</span>
            <svg className="phone-cc__chevron" width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {open && (
            <div className="phone-cc__drop">
              <div className="phone-cc__search-wrap">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <input ref={searchRef} className="phone-cc__search" placeholder="Search country…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search country code" />
              </div>
              <div className="phone-cc__list" role="listbox" aria-label="Country code">
                {filtered.length === 0 && <div className="phone-cc__empty">No results</div>}
                {filtered.map((c) => (
                  <button key={c.code} type="button" role="option" aria-selected={c.dial === cc}
                    className={`phone-cc__option${c.dial === cc ? ' is-selected' : ''}`}
                    onClick={() => { onCcChange(c.dial); setOpen(false); }}>
                    <span className="phone-cc__opt-flag">{c.flag}</span>
                    <span className="phone-cc__opt-name">{c.name}</span>
                    <span className="phone-cc__opt-dial">{c.dial}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Number input */}
        <input
          className="phone-field__num"
          type="tel"
          placeholder="Phone number"
          value={num}
          onChange={(e) => onNumChange(e.target.value)}
          aria-label="Phone number"
          onKeyDown={(e) => { if (e.key === 'Enter') onSave(); }}
        />
      </div>

      <div className="pfield__footer">
        <span className="pfield__memory-tag">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M12 8v4l3 3"/></svg>
          Saved to memory
        </span>
        <button type="button" className="pfield__save-link" disabled={saving || !num.trim()} onClick={onSave}>Save</button>
      </div>
    </div>
  );
}

function ProfileTab(): JSX.Element {
  const { user, token, logout, updateUser } = useAuth();

  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(user?.displayName ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) nameInputRef.current?.focus(); }, [editing]);

  const saveName = useCallback(async () => {
    if (!nameVal.trim() || nameVal === user?.displayName) { setEditing(false); return; }
    setNameSaving(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ displayName: nameVal.trim() }),
      });
      if (res.ok) updateUser({ displayName: nameVal.trim() });
    } finally { setNameSaving(false); setEditing(false); }
  }, [nameVal, user?.displayName, token, updateUser]);

  const [about, setAbout]   = useState('');
  const [goals, setGoals]   = useState<string[]>([]);
  const [phoneCC, setPhoneCC]   = useState('+1');
  const [phoneNum, setPhoneNum] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [aboutSaving, setAboutSaving] = useState(false);

  const loadProfile = useCallback(() => {
    if (!token) return;
    fetch('/api/memory', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data: { facts: MemoryFact[] }) => {
        const facts = data.facts ?? [];
        const get = (key: string) => facts.find((f) => f.key === key)?.fact ?? '';
        setAbout(get('user_about'));
        const gf = get('user_goals');
        if (gf) { try { setGoals(JSON.parse(gf)); } catch { setGoals([gf]); } } else { setGoals([]); }
        const pf = get('user_phone');
        if (pf) {
          const match = COUNTRY_CODES.find((c) => pf.startsWith(c.dial));
          if (match) { setPhoneCC(match.dial); setPhoneNum(pf.slice(match.dial.length).trim()); }
          else setPhoneNum(pf);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [token]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // Re-read when Nicole changes profile data by voice, so the panel stays live.
  useEffect(() => {
    window.addEventListener('nicole:profile-updated', loadProfile);
    return () => window.removeEventListener('nicole:profile-updated', loadProfile);
  }, [loadProfile]);

  const saveMemory = useCallback(async (key: string, fact: string) => {
    await fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key, fact: fact.trim(), factType: 'preference' }),
    });
  }, [token]);

  const saveAbout = useCallback(async () => {
    if (!about.trim()) return;
    setAboutSaving(true);
    try { await saveMemory('user_about', about); } finally { setAboutSaving(false); }
  }, [about, saveMemory]);

  const toggleGoal = useCallback(async (g: string) => {
    const next = goals.includes(g) ? goals.filter((x) => x !== g) : [...goals, g];
    setGoals(next);
    await saveMemory('user_goals', JSON.stringify(next));
  }, [goals, saveMemory]);

  const savePhone = useCallback(async () => {
    if (!phoneNum.trim()) return;
    setPhoneSaving(true);
    try { await saveMemory('user_phone', `${phoneCC} ${phoneNum.trim()}`); }
    finally { setPhoneSaving(false); }
  }, [phoneCC, phoneNum, saveMemory]);

  if (!user) return <div className="panel-loading">Loading…</div>;

  return (
    <div className="profile-body">

      {/* Identity */}
      <div className="pid-card">
        <div className="pid-avatar">{initials(user.displayName)}</div>
        <div className="pid-info">
          <div className="pid-name-row">
            {editing ? (
              <>
                <input ref={nameInputRef} className="pid-name-input" aria-label="Display name"
                  value={nameVal} onChange={(e) => setNameVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void saveName(); if (e.key === 'Escape') { setEditing(false); setNameVal(user.displayName); } }} />
                <button className="pid-save-btn" onClick={() => void saveName()} disabled={nameSaving} type="button">{nameSaving ? '…' : 'Save'}</button>
              </>
            ) : (
              <>
                <span className="pid-name">{user.displayName}</span>
                <button className="pid-edit-icon" onClick={() => { setNameVal(user.displayName); setEditing(true); }} type="button" aria-label="Edit display name" data-tooltip="Edit your display name" data-tooltip-pos="right">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </>
            )}
          </div>
          <div className="pid-email">{user.email}</div>
        </div>
      </div>

      {/* About */}
      {(() => {
        const ABOUT_LIMIT = 300;
        const remaining = ABOUT_LIMIT - about.length;
        return (
          <div className="pfield">
            <div className="pfield__label-row">
              <span className="pfield__label">About you</span>
              <span className="pfield__hint">Nicole uses this every session</span>
            </div>
            <textarea className="pfield__textarea" placeholder="Your role, industry, communication style…"
              value={about} onChange={(e) => { if (e.target.value.length <= ABOUT_LIMIT) setAbout(e.target.value); }}
              rows={2} disabled={!loaded} maxLength={ABOUT_LIMIT} />
            <div className="pfield__footer">
              <span className={`pfield__char-count${remaining <= 30 ? ' is-warn' : ''}`}>{remaining} left</span>
              <button className="pfield__save-link" type="button" onClick={() => void saveAbout()} disabled={aboutSaving || !about.trim()}>
                {aboutSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Goals — all always visible, toggle on/off + custom add */}
      <GoalsField goals={goals} loaded={loaded} toggleGoal={toggleGoal} saveMemory={saveMemory} setGoals={setGoals} />

      {/* Phone */}
      {/* Phone with searchable country code */}
      <div className="pfield">
        <div className="pfield__label-row">
          <span className="pfield__label">Phone</span>
          {phoneSaving && <span className="pfield__hint">Saving…</span>}
        </div>
        <PhoneField
          cc={phoneCC} onCcChange={setPhoneCC}
          num={phoneNum} onNumChange={setPhoneNum}
          onSave={() => void savePhone()}
          saving={phoneSaving}
        />
      </div>

      <button type="button" className="signout-btn" onClick={logout}>Sign out</button>
    </div>
  );
}

/* ── IntegrationsTab ──────────────────────────────────────────────────────── */

function IntegrationsTab(): JSX.Element {
  return (
    <div className="integrations-grid">
      {INTEGRATIONS.map((intg) => (
        <div className="integration-card" key={intg.id} data-tooltip={`${intg.name}: ${intg.desc} — coming soon`} data-tooltip-pos="top">
          <div className="integration-card__top">
            <div className="intg-icon-wrap">{intg.icon}</div>
            <span className="integration-badge">Soon</span>
          </div>
          <div className="integration-card__name">{intg.name}</div>
          <div className="integration-card__desc">{intg.desc}</div>
        </div>
      ))}
    </div>
  );
}

/* ── MemoryTab ────────────────────────────────────────────────────────────── */

function MemoryTab(): JSX.Element {
  const { token } = useAuth();
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true); setError(null);
    fetch('/api/memory', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error('Load failed'); return r.json() as Promise<{ facts: MemoryFact[] }>; })
      .then((d) => setFacts(d.facts ?? []))
      .catch((e: unknown) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const del = useCallback(async (key: string) => {
    await fetch(`/api/memory/${encodeURIComponent(key)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setFacts((p) => p.filter((f) => f.key !== key));
  }, [token]);

  if (loading) return <div className="panel-loading">Loading…</div>;
  if (error)   return <div className="panel-error">{error}</div>;

  return (
    <div className="memory-body">
      <p className="memory-count">
        <strong>{facts.length}</strong> {facts.length === 1 ? 'memory' : 'memories'} stored
      </p>
      {facts.length === 0 ? (
        <div className="memory-empty">
          <div className="memory-empty__icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          </div>
          <p className="memory-empty__title">Nothing yet</p>
          <p>Start talking — Nicole will remember what matters.</p>
        </div>
      ) : (
        <div className="memory-list">
          {facts.map((f) => {
            const label = prettifyKey(f.key);
            let displayFact = f.fact;
            if (f.key === 'user_goals') {
              try {
                const arr: string[] = JSON.parse(f.fact);
                displayFact = arr.join(' · ');
              } catch { /* keep raw */ }
            }
            return (
              <div className="memory-card" key={f.key}>
                <div className="memory-card__body">
                  <span className="memory-card__key">{label}</span>
                  <span className="memory-card__fact">{displayFact}</span>
                </div>
                <button type="button" className="memory-card__delete" onClick={() => void del(f.key)} aria-label={`Forget ${label}`} data-tooltip="Nicole will forget this" data-tooltip-pos="left">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────────────────────── */

export interface ProfilePanelProps { open: boolean; onClose: () => void; }

export function ProfilePanel({ open, onClose }: ProfilePanelProps): JSX.Element {
  const [tab, setTab] = useState<Tab>('profile');

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  return (
    <>
      <div className={`profile-overlay${open ? ' is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`profile-drawer${open ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Profile">
        <div className="profile-drawer__header">
          <span className="profile-drawer__title">Account</span>
          <button type="button" className="profile-drawer__close" onClick={onClose} aria-label="Close panel" data-tooltip="Close" data-tooltip-pos="left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="profile-tabs" role="tablist">
          {(['profile', 'integrations', 'memory'] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t ? true : false}
              className={`profile-tab${tab === t ? ' is-active' : ''}`} onClick={() => setTab(t)}>
              {t === 'profile' ? 'Profile' : t === 'integrations' ? 'Integrations' : 'Memory'}
            </button>
          ))}
        </div>
        <div className="profile-drawer__body" role="tabpanel">
          {tab === 'profile'      && <ProfileTab />}
          {tab === 'integrations' && <IntegrationsTab />}
          {tab === 'memory'       && <MemoryTab />}
        </div>
      </aside>
    </>
  );
}

export default ProfilePanel;
