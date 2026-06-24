# Nicole 2.0 — Core Design Spec

**Date:** 2026-06-24
**Status:** Approved by user

## Purpose

Rebuild Nicole — a virtual voice assistant — from scratch in `NICOLE2.0` as a
**minimal, phenomenal, stable** application. Nicole already talks beautifully in
the existing CHAT project; the only things broken are **memory** and
**longevity** (she cannot run continuously even for 30 minutes). This rebuild
copies everything that makes her talking phenomenal from CHAT, and *fixes* the
two things CHAT got wrong.

This is a fresh codebase (own backend + own frontend), not bolted onto CHAT. It
reuses CHAT's proven prompts, Gemini Live session config, training phase machine,
and CHAT's Supabase database — but owns its own stable session/memory logic.

## Goals (the core — nothing else)

1. **Phenomenal web talking** — natural, emotional, low-latency voice
   conversation with Nicole, identical in quality to CHAT.
2. **Live transcript** — both sides (You / Nicole) shown in real time, like CHAT.
3. **Voice switching** — pick among Gemini voices, each with emotional style.
4. **Training mode** — the coaching phase machine + coaching dialogues from CHAT,
   functionality/prompting-wise (not UI-wise).
5. **Durable memory** — Nicole remembers facts between sessions and days.
6. **Long-hours stability** — never drops, never bloats, never forgets, runs for
   hours. This is the headline fix.
7. **2D avatar** — built in SVG/Canvas: blinks, lip-syncs to real audio, idle
   breathing.
8. **Beautiful UI** — animated assistant background (not plain), polished modern
   interface.

## Explicit Non-Goals (deliberately excluded — "core only")

Phone calls, Twilio, LiveKit, calendar, email, document generation (business
plans/reports/slides/podcasts/videos), the 36 panels, camera, face recognition,
air-draw, contacts, persona-switching to CFO/CTO/etc., premium/standard mode
toggle. None of these are built.

## Architecture

```
NICOLE2.0/
├── server/                     Fresh Node + TypeScript backend (owns stability)
│   ├── Gemini Live relay       WebSocket proxy; Gemini key never reaches browser
│   ├── Session manager         Auto-reconnect, resume handles, proactive reconnect,
│   │                           live summarization (the long-hours fix)
│   ├── Memory API              Durable facts → Supabase Postgres (CHAT's DB)
│   └── Summarizer              Compresses old turns via Gemini (non-live model)
└── web/                        Fresh React + Vite + TypeScript frontend
    ├── Voice engine            mic capture → WS → playback; barge-in; leak-safe
    ├── Transcript              live both-sides, trimmed DOM, auto-scroll
    ├── Voice switcher          Aoede/Kore/Leda/Zephyr + Charon/Fenrir/Orus/Puck
    ├── Avatar (2D)             SVG/Canvas: blink + amplitude lip-sync + breathing
    ├── Background              animated aurora/particles
    └── Training mode           coaching phase machine + dual voice
```

**Data flow (talking):**
1. Browser captures mic → PCM frames → WebSocket → backend.
2. Backend relays to Gemini Live (`gemini-3.1-flash-live-preview`) with the Gemini
   key, the Nicole system prompt, VAD config, and selected voice.
3. Gemini streams audio (24kHz Int16 PCM) + input/output transcripts → backend →
   browser → Web Audio playback + transcript render.

**Key never in browser:** all Gemini access is server-side, matching CHAT's
security posture.

## Component Designs

### 1. Gemini Live relay (server)

Reproduces CHAT's `/ai-live` relay design:
- Client sends `{ type: 'connect', config }`, `{ type: 'client-msg', payload }`
  (text/audio), and the backend relays `{ type: 'message' }` back from Gemini.
- Uses `@google/genai` server-side. Model id `gemini-3.1-flash-live-preview`,
  overridable via env `GEMINI_LIVE_MODEL`.
- Applies `REALTIME_INPUT_CONFIG` (VAD) verbatim from CHAT:
  `startOfSpeechSensitivity: START_SENSITIVITY_HIGH`,
  `endOfSpeechSensitivity: END_SENSITIVITY_LOW`, `prefixPaddingMs: 600`,
  `silenceDurationMs: 700`. This prevents fragmented reply-spam.
- Output audio: 24kHz Int16 PCM base64; barge-in via default
  `START_OF_ACTIVITY_INTERRUPTS`.

### 2. Session manager (server) — the stability fix

Ports CHAT's resume logic and goes further:
- **Resume handles:** capture Gemini's session-resumption handle; treat a handle
  older than `RESUME_HANDLE_MAX_AGE_MS` (110 min) as expired
  (`isResumeHandleUsable`).
- **Proactive reconnect:** `shouldProactiveReconnect(sessionAgeMs, handleAgeMs,
  nowSpeaking)` — once a session has been open `SESSION_PROACTIVE_RECONNECT_MS`
  (100 min) and the user is NOT speaking and a usable handle exists, pre-emptively
  reconnect on the fresh handle to mint a new one and reset the clock. (Pure,
  unit-testable — copied from CHAT.)
- **Auto-reconnect on drop:** on socket close / `goAway`, reconnect on the resume
  handle; Nicole continues mid-conversation, never re-introduces herself.
- **Live summarization (the 30-min-crash fix):** track turn count / token
  estimate; when it crosses a threshold, call the summarizer to compress older
  turns, then resume a fresh session seeded with `[MEMORY]` + the summary. Context
  never overflows → runs for hours.

### 3. Summarizer (server)

Given the rolling transcript, calls a non-live Gemini model (e.g.
`gemini-2.5-flash`) to produce a concise summary of older turns. Returns a short
paragraph injected into the next session's system prompt.

### 4. Memory API (server) → Supabase Postgres (CHAT's DB)

- Connects to CHAT's Supabase Postgres via `DATABASE_URL` from CHAT's backend
  `.env`.
- **New table `nicole2_memory`** (never touches CHAT's tables):
  `id, user_id, key, fact, fact_type, created_at, updated_at`. `key` unique per
  user for upsert/forget.
- Endpoints: `POST /api/memory` (save/upsert), `DELETE /api/memory/:key`
  (forget), `GET /api/memory` (load all facts for user → `[MEMORY]` block).
- Two Gemini tools exposed to Nicole: `save_memory({ fact, key })`,
  `forget_memory({ key })`.
- **Capture policy:** BOTH explicit ("remember this") AND smart auto-save —
  Nicole proactively saves your name, business, key goals/preferences, mirroring
  CHAT's behavior. System prompt instructs aggressive but sensible saving.
- At session start, backend loads all facts → injects `[MEMORY]` block into the
  system prompt so she greets you already knowing you.
- `user_id`: a single local user for v1 (configurable/default constant) — no auth
  system in scope.

### 5. Voice engine (web)

- Capture mic with Web Audio (`AudioContext`, worklet/ScriptProcessor) → PCM →
  WebSocket. Playback queue for incoming 24kHz PCM.
- **Barge-in:** when user speaks, stop/flush Nicole's playback queue.
- **Leak-safe:** every reconnect tears down old AudioContext, stream tracks, and
  buffers; playback queue is bounded; no unbounded arrays. Browser memory stays
  flat over hours.

### 6. Transcript (web)

- Live both-sides bubbles (You / Nicole) from Gemini input/output transcripts.
- Auto-scroll to newest.
- **DOM-trimmed:** render only the recent N lines (older roll off the DOM) so a
  multi-hour session stays fast. Full conversation still lives in session
  memory/summary so Nicole never forgets — the trim is visual only.

### 7. Voice switcher (web)

- Female: Aoede (warm), Kore (clear), Leda (bright), Zephyr.
  Male: Charon (deep), Fenrir (strong), Orus (firm), Puck.
- Each voice carries a style/emotion prompt (CHAT's style-prompt technique) so
  emotion comes through.
- Changing voice cleanly reconnects the session with the new voice (preserving
  memory + summary).

### 8. Avatar (web) — 2D, built by us

- SVG/Canvas Nicole face. **Blink** on a natural randomized timer.
- **Lip-sync:** drive mouth openness from the real output audio amplitude
  (analyser on the playback node), so lips track actual speech — not fake.
- Subtle idle breathing / sway. No 3D libraries (lighter → better longevity).

### 9. Background + UI (web)

- Animated aurora/gradient background with soft particle drift (not plain).
- Centered avatar, transcript panel, voice switcher, talk/mute control.
- Uses frontend-design principles for a distinctive, non-templated look.

### 10. Training mode (web + server)

Functionality/prompting-wise port of CHAT's coaching, not UI-wise:
- **Phase machine:** INTRO → TEACH → MODEL → GUIDED_PRACTICE → BASELINE_ASSESS →
  READINESS_CHECK → LEVEL_GATE → ROLEPLAY_DEMO → DEBRIEF.
- **`buildPhasePrompt`** ported from CHAT's `lessonPrompts.ts`, including the
  riders: DRIFT_GUARD, ADVANCE_RIDER, VARY_DELIVERY, SCORE_RIDER, GATE_RIDER.
- **Lesson spec** shape (`ClientLessonSpec`: skillId, title, objective, hook,
  coreFramework{name,moves}, mnemonic, workedExamples, guidedPracticePrompts,
  expectations) ported from CHAT. Ship 1–2 authored lessons to start.
- **Dual-voice coaching:** Nicole (coach) is always the avatar; a separate
  audio-only voice plays the prospect/other-party during ROLEPLAY_DEMO. Two
  Gemini Live sessions, same as CHAT's `useCoachingSession`.
- **Silent live scoring:** `training_mark_progress({ dimension, hit, tip })` tool
  drives an on-screen scorecard; never spoken.
- Coach personas (e.g. Cardone/Belfort/Wolf) and scenario overlays ported as
  prompt text where useful, but kept minimal for v1.

## System Prompt

Port CHAT's Nicole personality prompt (`ALSA_SYSTEM_INSTRUCTION`), keeping the
**talking/voice/personality** sections verbatim (IDENTITY, SPEECH RULES, NOISE
HANDLING, VOICE & PERSONALITY, robot-avoidance) and the MEMORY guidance; **strip
out** all sections tied to excluded features (phone, documents, panels, calendar,
email, personas, premium mode, camera, face). Inject `[MEMORY]` (durable facts)
and `[SUMMARY]` (live session summary) blocks at runtime.

## Configuration / Secrets

From CHAT's backend `.env` (reused):
- `GEMINI_API_KEY` (server only)
- `GEMINI_MODEL_WEB=gemini-3.1-flash-live-preview` (live model)
- Summarizer model: `gemini-2.5-flash`
- `DATABASE_URL` (Supabase Postgres — for `nicole2_memory` table only)

Nicole 2.0's own `.env` holds these; the key is never sent to the browser.

## Stability Requirements (acceptance)

- A session runs **continuously for ≥ 1 hour** without dropping, without the page
  slowing, and without Nicole losing earlier context.
- On any socket drop, she reconnects within ~2s and continues without
  re-introducing herself.
- Browser memory stays approximately flat over a long session (no unbounded
  growth in transcript DOM, audio buffers, or arrays).
- Durable facts persist across full app restarts and new days.

## Tech Stack

- **Server:** Node 18+, TypeScript, `ws` (WebSocket), `@google/genai`, `pg`
  (Postgres), `dotenv`, `vitest` (tests).
- **Web:** React 19, Vite, TypeScript, Web Audio API, Canvas/SVG, `vitest` +
  Testing Library.
- Pure logic modules (session timing, phase machine, memory formatting,
  summarizer trigger) are unit-tested with vitest; no Gemini key needed in tests.

## Testing Strategy

TDD for pure logic: `isResumeHandleUsable`, `shouldProactiveReconnect`, summary
trigger threshold, `[MEMORY]` block formatting, `buildPhasePrompt` phase outputs,
transcript trimming, audio buffer bounding. Integration (relay, DB) covered with
lightweight smoke tests / mocks where a live key isn't available.
