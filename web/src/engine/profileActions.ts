/**
 * Profile-update actions Nicole can perform by voice.
 *
 * About / Goals live in memory (POST /api/memory); the display name lives in the
 * account (PATCH /api/auth/me). Goals merge with the current list (add/remove a
 * single goal) rather than replacing it. After any change we broadcast a
 * `nicole:profile-updated` event so an open ProfilePanel re-reads and updates
 * live.
 *
 * Pure-ish: the fetch + the goal-merge logic are separable so the merge is
 * unit-testable without a network.
 */

const HTTP_BASE =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_SERVER_HTTP ?? '';

/** Merge a single goal into a list (add = union, remove = filter). Pure. */
export function mergeGoal(
  current: string[],
  action: 'add' | 'remove',
  goal: string,
): string[] {
  const g = goal.trim();
  if (!g) return current;
  if (action === 'add') {
    return current.some((x) => x.toLowerCase() === g.toLowerCase())
      ? current
      : [...current, g];
  }
  return current.filter((x) => x.toLowerCase() !== g.toLowerCase());
}

function authHeaders(token: string | null): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Notify any open ProfilePanel that profile data changed. */
function broadcastUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nicole:profile-updated'));
  }
}

/** Save a memory fact by exact key (used for user_about / user_goals). */
async function saveMemory(token: string | null, key: string, fact: string): Promise<void> {
  await fetch(`${HTTP_BASE}/api/memory`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ key, fact, factType: 'preference' }),
  });
}

/** Load the current goals list (user_goals) from memory. */
async function loadGoals(token: string | null): Promise<string[]> {
  try {
    const res = await fetch(`${HTTP_BASE}/api/memory`, { headers: authHeaders(token) });
    const data = (await res.json()) as { facts?: Array<{ key: string; fact: string }> };
    const raw = data.facts?.find((f) => f.key === 'user_goals')?.fact ?? '';
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [raw];
    } catch {
      return [raw];
    }
  } catch {
    return [];
  }
}

export interface ProfileActions {
  setAbout: (text: string) => Promise<void>;
  setGoal: (action: 'add' | 'remove', goal: string) => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
}

/**
 * Build the profile actions bound to the current auth token + a callback to
 * update the in-memory user (so the name change reflects instantly).
 */
export function makeProfileActions(
  token: string | null,
  updateUser: (patch: { displayName?: string }) => void,
): ProfileActions {
  return {
    async setAbout(text) {
      await saveMemory(token, 'user_about', text.trim());
      broadcastUpdated();
    },
    async setGoal(action, goal) {
      const current = await loadGoals(token);
      const next = mergeGoal(current, action, goal);
      await saveMemory(token, 'user_goals', JSON.stringify(next));
      broadcastUpdated();
    },
    async setDisplayName(name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      await fetch(`${HTTP_BASE}/api/auth/me`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ displayName: trimmed }),
      });
      updateUser({ displayName: trimmed });
      broadcastUpdated();
    },
  };
}
