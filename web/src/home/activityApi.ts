// Client for the daily-activity STREAK. Opening Nicole on any day (Talk,
// Training, or Roleplay) counts: we ping once per home load with the LOCAL day
// key so the streak respects the user's timezone, and the server returns the
// freshly-counted streak.

/** Local day key (YYYY-MM-DD) from the user's own clock. */
export function localDayKey(now: Date = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/** Mark today active and return the current streak. Best-effort: returns null on failure. */
export async function pingActivity(token: string, now: Date = new Date()): Promise<number | null> {
  try {
    const res = await fetch('/api/activity/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ day: localDayKey(now) }),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { streak?: number };
    return typeof d.streak === 'number' ? d.streak : null;
  } catch {
    return null;
  }
}
