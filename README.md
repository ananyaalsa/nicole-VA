# Nicole 2.0

A minimal, phenomenal, **stable** voice assistant. Nicole talks like a real
person (Gemini Live), shows you a live transcript, lets you switch her voice,
coaches you in training mode, **remembers** across sessions, and is built to run
for **long hours** without dropping, slowing, or forgetting.

This is a fresh rebuild of the talking core from the CHAT project, with the two
things CHAT struggled with — **memory** and **longevity** — fixed at the source.

## What's inside

```
NICOLE2.0/
├── server/   Node + TypeScript backend
│   • Gemini Live relay (the API key never reaches the browser)
│   • Auto-reconnect + session resume + proactive reconnect watchdog
│   • Live summarization (keeps long sessions from overflowing → runs for hours)
│   • Durable memory (save/forget facts) in Postgres
│   • Memory HTTP API
└── web/      React 19 + Vite frontend
    • Live voice talking (mic → relay → speaker), barge-in, leak-safe audio
    • Live both-sides transcript (DOM-trimmed so it never slows down)
    • Voice switcher (8 Gemini voices, each with an emotional style)
    • 2D Nicole avatar (SVG) — blinks + lip-syncs to her real voice amplitude
    • Animated aurora background + Nicole's living aura (the signature visual)
    • Training mode (coaching phase machine + dual-voice roleplay + scorecard)
```

## Prerequisites

- Node 18+ (built/tested on Node 22)
- A reachable Postgres database (the `server/.env` `DATABASE_URL`)
- A Gemini API key (in `server/.env`)

## Setup

```bash
# 1. Backend
cd server
npm install
npm run migrate     # creates the nicole2_memory table (one time)
npm run dev         # starts the relay on http://localhost:4000

# 2. Frontend (new terminal)
cd web
npm install
npm run dev         # serves the app on http://localhost:5173
```

Open http://localhost:5173, click **Start talking**, and talk to Nicole. Use the
voice switcher to change her voice; click **Training** for coaching mode.

## Configuration (`server/.env`)

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Gemini key (server-side only, never sent to the browser) |
| `GEMINI_LIVE_MODEL` | Live talking model (default `gemini-3.1-flash-live-preview`) |
| `GEMINI_SUMMARIZER_MODEL` | Model for live summarization (default `gemini-2.5-flash`) |
| `DATABASE_URL` | Postgres connection for durable memory |
| `NICOLE_USER_ID` | The single local user id for v1 |
| `PORT` | Backend port (default 4000) |

`web/.env` points the frontend at the backend:
`VITE_SERVER_WS=ws://localhost:4000/ai-live`, `VITE_SERVER_HTTP=http://localhost:4000`.

## How the stability fixes work

- **Never drops** — the relay captures Gemini's session-resumption handle and
  reconnects on it whenever the socket drops, so Nicole continues mid-conversation
  with no "Hello" re-intro. A watchdog also reconnects *proactively* before the
  ~2h handle boundary.
- **Never bloats** — audio buffers are bounded, the playback queue is capped, and
  the transcript is DOM-trimmed (older lines roll off the DOM). Browser memory
  stays flat over a long session.
- **Never forgets** — durable facts are stored in Postgres and reloaded into her
  system prompt every session. Within a long session, older turns are summarized
  and the session is resumed seeded with that summary, so context never overflows.

## Tests

```bash
cd server && npm test    # 77 tests
cd web && npm test       # 138 tests
```

See `docs/STABILITY-CHECKLIST.md` for the long-session verification steps.
