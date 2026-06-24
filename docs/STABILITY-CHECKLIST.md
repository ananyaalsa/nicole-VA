# Stability Checklist

The headline goal of Nicole 2.0 is **long-hours stability**. This checklist
verifies the four failure modes from the original CHAT Nicole are fixed:
session drops, slowdown/leaks, forgetting context, and audio glitches.

## Automated coverage (already passing)

- **Auto-reconnect on drop** — `server/src/gemini/relay.test.ts` → "reconnects on
  a non-terminal close" (simulates a socket drop, asserts a new Gemini session
  opens and the client is told it's reconnecting).
- **Resume-handle reuse** — relay test "captures a session-resumption handle" →
  on reconnect the new config carries `sessionResumption.handle`.
- **Proactive reconnect** — `server/src/session/sessionTiming.test.ts` →
  `shouldProactiveReconnect` fires only when the session nears the handle
  boundary, the user isn't speaking, and a usable handle exists.
- **Live summarization (overflow fix)** — relay test "summarizes and reconnects
  when the buffer grows" → past the turn threshold, older turns are summarized
  and the session resumes seeded with `[SUMMARY]`; the buffer trims to ≤ 8 turns.
- **Bounded audio + transcript** — `web/src/audio/playbackQueue.test.ts` (queue
  caps and drops oldest); `web/src/components/Transcript.test.tsx` (only the last
  N lines render); hook test caps transcript at 400 lines.
- **Terminal close handling** — relay test "does NOT reconnect on a terminal
  billing close" (prevents reconnect storms).

## Manual long-session verification

Lower the thresholds temporarily to exercise long-session behavior fast:

1. **Summary trigger** — in `server/src/session/summaryTrigger.ts`, drop
   `shouldSummarize` to e.g. `turnCount >= 6`. Have a short conversation; confirm
   in the server logs that a summary + reconnect happens, and Nicole keeps the
   earlier context afterward. Restore the threshold.
2. **Proactive reconnect** — in `server/src/session/sessionTiming.ts`, drop
   `SESSION_PROACTIVE_RECONNECT_MS` to `60_000`. Talk for >1 min; confirm a
   seamless reconnect (no re-intro). Restore the value.
3. **Drop recovery** — while talking, kill the network (or stop/restart the
   server). Confirm the client shows "reconnecting" and Nicole resumes when the
   connection returns, continuing the conversation.
4. **Memory leak watch** — open DevTools → Performance/Memory. Run a 30–60 min
   session. Confirm JS heap stays roughly flat (no monotonic growth) and the
   transcript DOM node count stays bounded.
5. **Durable memory** — tell Nicole something ("remember I run Alsatronix"),
   fully restart both apps, start a new session, and confirm she greets you
   already knowing it. Or check via `GET http://localhost:4000/api/memory`.

## Targets

- A session runs **≥ 1 hour** without dropping, slowing, or losing context.
- On any drop, reconnect within ~2s, continuing without re-introducing herself.
- Browser memory stays approximately flat over the session.
- Durable facts persist across full app restarts.
