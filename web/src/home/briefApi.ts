// Client for the daily-brief aggregation (GET /api/brief).

/** A clean email row for the brief UI (no raw addresses). */
export interface BriefEmail {
  subject: string;
  from: string;
}

/** A Google Calendar event (subset of the raw API shape we render). */
export interface BriefEvent {
  summary?: string;
  start?: { dateTime?: string; date?: string };
}

export interface BriefSection {
  /** A short, spoken-style summary line for this section. */
  summary: string;
  data?: unknown;
}

export interface Brief {
  /** True if at least one source (Google / Todoist) is connected. */
  available: boolean;
  connected: { google: boolean; todoist: boolean };
  /** Present sections only (calendar / email / tasks). */
  sections: Partial<Record<'calendar' | 'email' | 'tasks', BriefSection>>;
}

export async function fetchBrief(token: string | null): Promise<Brief> {
  const res = await fetch('/api/brief', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`brief ${res.status}`);
  return res.json();
}
