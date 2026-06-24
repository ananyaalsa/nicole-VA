// src/session/sessionTiming.ts
//
// Resume-handle freshness + long-session proactive-reconnect timing.
// Logic ported VERBATIM from the CHAT frontend
// (Nicole-Frontend/services/liveSessionConfig.ts) so the backend relay and the
// original client agree exactly on when a Gemini session-resumption handle is
// usable and when to pre-emptively reconnect.

/**
 * Gemini session-resumption handles are valid only ~2 hours after the last
 * termination. A handle older than this threshold is treated as absent so the
 * reconnect goes fresh. 110 minutes leaves ~10 min headroom under the 2h limit
 * so a handle never expires in transit between the freshness check and the
 * server receiving it.
 */
export const RESUME_HANDLE_MAX_AGE_MS = 110 * 60 * 1000;

/**
 * Long-session watchdog threshold. Once a session has been open this long, we
 * pre-emptively reconnect on the still-fresh resumption handle, which mints a
 * NEW handle and resets the clock. 100 minutes sits a clear 10 min UNDER
 * RESUME_HANDLE_MAX_AGE_MS so the handle we reconnect with is still valid in
 * transit.
 */
export const SESSION_PROACTIVE_RECONNECT_MS = 100 * 60 * 1000;

/**
 * isResumeHandleUsable: is a resume handle captured at `capturedAtMs` still
 * fresh enough to send at `nowMs`? A null timestamp (never captured) is not
 * usable. Pure (time passed in) so it's deterministic and unit-testable.
 */
export function isResumeHandleUsable(
  capturedAtMs: number | null,
  nowMs: number,
): boolean {
  if (capturedAtMs == null) return false;
  return nowMs - capturedAtMs <= RESUME_HANDLE_MAX_AGE_MS;
}

/**
 * shouldProactiveReconnect: should the long-session watchdog pre-emptively
 * reconnect now? Pure (all inputs passed in) so it's deterministic +
 * unit-testable.
 *
 * Returns true only when ALL hold:
 *  1. the session has been open >= SESSION_PROACTIVE_RECONNECT_MS, AND
 *  2. the user is NOT speaking (never reconnect mid-utterance), AND
 *  3. a usable resumption handle exists (handleAgeMs != null AND still within
 *     RESUME_HANDLE_MAX_AGE_MS).
 */
export function shouldProactiveReconnect(
  sessionAgeMs: number,
  handleAgeMs: number | null,
  nowSpeaking: boolean,
): boolean {
  if (sessionAgeMs < SESSION_PROACTIVE_RECONNECT_MS) return false;
  if (nowSpeaking) return false;
  if (handleAgeMs == null || handleAgeMs > RESUME_HANDLE_MAX_AGE_MS) return false;
  return true;
}
