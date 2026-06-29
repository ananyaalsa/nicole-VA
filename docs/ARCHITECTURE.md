# Nicole 2.0 — Architecture

A plain overview of how the project is put together. No diagrams, just text.

## What it is

Nicole 2.0 is a voice-first AI assistant and sales coach. You talk to "Nicole"
out loud and she talks back in real time. There are three modes:

- **Talk** — a general voice assistant (memory, weather, calendar/email via
  integrations, etc.).
- **Training** — Nicole teaches one sales skill across phases, then you do a live
  practice rep against a separate "prospect" voice, then you get a scored report.
- **Roleplay** — a pure live practice call against an in-character prospect, then a
  scored report.

## The two halves

The repo has two apps:

- **`web/`** — the frontend. React + TypeScript + Vite. This is the whole UI.
- **`server/`** — the backend. Node + TypeScript. It holds the Gemini API key,
  talks to the database, and relays voice between the browser and Google's Gemini
  Live API.

They talk over: REST (`/api/*`) for normal data, and a **WebSocket** (`/ai-live`)
for the live voice stream.

## How a voice conversation flows

1. The browser opens a WebSocket to the server at `/ai-live`.
2. The browser captures mic audio (16kHz PCM) and streams it over the socket.
3. The server (the "relay") forwards that audio to **Gemini Live** using the
   server-side API key, along with the right system prompt + voice + tools for the
   current mode.
4. Gemini streams back audio + text transcripts. The server relays them to the
   browser, which plays the audio and shows the transcript.
5. The key never reaches the browser. The server is the only thing that talks to
   Gemini.

The relay also handles reconnects, session resumption, and live summarization so a
session can run a long time without dropping.

## Frontend (`web/src/`)

- **`screens/`** — the three top-level screens: `TalkScreen`, `TrainingScreen`,
  `RoleplayScreen`, plus `AuthScreen` and `OnboardingScreen`. `App.tsx` picks which
  one is shown.
- **`engine/`** — `useNicoleSession`: the core hook that owns one live voice
  session (the WebSocket, mic capture, audio playback, transcript, mic/mute state,
  the "ready" signal). Everything voice-related goes through this.
- **`training/`** — the Training and Roleplay logic:
  - `useCoachingSession` — Training. Runs a **coach** session (Nicole teaching) and,
    only during the live rep, a separate **prospect** session (a different male
    voice). They are never live at the same time — entering the rep stops the coach
    and starts the prospect.
  - `useRoleplaySession` — Roleplay. A single in-character prospect session.
  - `lessonPrompts.ts` / `lessons.ts` — the per-phase coaching prompts, the lesson
    content, and the prospect persona overlay.
  - `phaseMachine.ts` / `phaseAdvance.ts` — the Training phase order and when to
    auto-advance.
  - `scoreApi.ts` / `trainingApi.ts` — calls to score a rep and to read/save history.
- **`components/`** — shared UI: `LiveRoom` (the call layout), `CallPresence`,
  `MicControls` (mic-ready indicator + manual mic/mute), `SessionResults` (the
  scored report) + `ResultCharts` (the bar chart + score trend), `HistoryPanel`,
  `TopBar`, etc.
- **`home/`** — the Talk home screen content (greeting, starter chips, coach stats).
- **`auth/`** — `AuthContext`: login state + the access token; restores the session
  on load via the refresh cookie.
- **`live2d/`** / **`avatar/`** — the on-screen avatar (Live2D companion + 3D).
- **`integrations/`**, **`weather/`**, **`rtc/`** — UI for connected apps, the
  weather widget, and the phone↔PC camera (WebRTC) signaling client.
- **`audio/`** — PCM helpers and the playback queue.

## Backend (`server/src/`)

- **`server.ts`** — the entry point. Plain Node HTTP + `ws`. Routes `/api/*` to
  handlers and upgrades `/ai-live` (voice) and `/rtc-signal` (camera) WebSockets.
- **`gemini/`** — `relay.ts` is the heart: one `LiveSession` per browser
  connection, bridging it to Gemini Live. `liveConfig.ts` is the Gemini session
  config (voice, VAD, transcripts). `summarizer.ts` compresses old turns.
- **`prompt/`** — `nicolePrompt.ts`: builds Nicole's system prompt per mode.
- **`auth/`** — signup/login/refresh/logout, JWT middleware, refresh tokens.
- **`memory/`** — the user's long-term facts (Postgres) + the memory tools Nicole
  can call to save/recall things.
- **`training/`** — scoring (the judge), lesson/persona data, and run history.
- **`session/`** — live-status (what mode the user is in) + session timing.
- **`integrations/`** — OAuth connect/callback + per-provider adapters
  (Google/Notion/Todoist/Slack), with encrypted token storage and a confirm gate
  for destructive actions.
- **`weather/`**, **`rtc/`** — weather lookup and the WebRTC signaling room.
- **`http/`** — small shared helpers (bounded body reader, rate limiter).

## Data + auth

- **Database**: Postgres (Supabase). Tables are prefixed `nicole2_` (users, memory,
  training history, integration connections, refresh tokens, live status). The
  server creates them on startup if missing.
- **Auth**: a short-lived (24h) JWT access token sent as `Authorization: Bearer`,
  plus a long-lived refresh token in an httpOnly cookie. The frontend silently
  refreshes the access token on load and when it expires.
- **Secrets** live only on the server in `server/.env` (Gemini key, DB URL,
  `JWT_SECRET`, `INTEGRATIONS_ENC_KEY`, OAuth client secrets). They are never sent
  to the browser and are gitignored.

## Tech stack

- Frontend: React, Vite, TypeScript, three / @react-three (3D avatar), pixi +
  pixi-live2d-display (2D avatar).
- Backend: Node, TypeScript, `ws` (WebSockets), `pg` (Postgres), `jsonwebtoken`,
  `bcrypt`, `@google/genai` (Gemini Live).

## Running it locally

1. **Backend**: `cd server && npm install && npm run dev` (serves on
   `http://localhost:4000`). Needs `server/.env` with `GEMINI_API_KEY`,
   `DATABASE_URL`, and (for full features) `JWT_SECRET` + `INTEGRATIONS_ENC_KEY`.
2. **Frontend**: `cd web && npm install && npm run dev` (serves on
   `http://localhost:5173`/`5175`). It proxies `/api` and the WebSockets to the
   backend, so calls are same-origin in dev.

## Tests

- `cd web && npx vitest run` — frontend unit/component tests.
- `cd server && npx vitest run` — backend tests.
- `npx tsc --noEmit` in each — type-check.
