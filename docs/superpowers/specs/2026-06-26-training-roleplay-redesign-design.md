# Training & Roleplay Redesign — Design Spec

**Date:** 2026-06-26
**Status:** Approved design → implementation plan next
**Author:** Claude (with Gaurav)

## Problem

The Training and Roleplay experiences don't deliver the guided, coach-led teaching
experience intended. Concretely, from the user:

1. **Cross-mode amnesia ("I'm back" bug).** After actually running a drill and
   returning to Talk, Nicole says "ready to go into training?" — she has no record
   that the user already entered/ran a drill. (Root cause: Talk-Nicole's awareness
   is built only from *saved* runs at connect-time; Training never saves a run;
   there is no real-time "in session / just returned" signal.)
2. **Training isn't autonomous or coach-led.** Nicole doesn't take charge and flow
   through the phases (intro → teach → model → practice → debrief). The learner has
   to drive with a "Continue" button. The top bar doesn't reflect the live phase
   meaningfully. (Root cause: auto-advance is fictional — `phaseAdvance.ts` is cited
   in a comment but does not exist; advancement is manual-button-only.)
3. **No real practice round + feedback loop.** There's no clean "you vs a real rep
   while Nicole listens, then she gives feedback" arc, with replay/re-teach/end
   options.
4. **Scoring is fake / missing.** Training's `training_mark_progress` tool is fully
   dead-wired (declared to Gemini nowhere, callback never attached, scorecard always
   empty). Roleplay scores only "engagement = turns × words" and repeats one verdict
   across every dimension label.
5. **Results lack transcripts / dual-speaker separation.** The user wants the rep's
   transcript and Nicole's/their own transcript in clearly separate visual lanes,
   for both Training and Roleplay.
6. **Live-room UI wastes space.** The drill/roleplay rooms are narrow and centered
   with blank side gutters, unlike Talk which uses the full width. The user wants
   transcripts rendered exactly like Talk mode, and the full width used.

## Research basis

Two research passes informed this design (full reports in the conversation):

- **Chat-project reference** (`C:\Users\anany\CHAT\Nicole-Frontend\app-next`): the
  single biggest lesson is **app-driven phase advancement**. They tried a
  model-called `training_advance_phase` tool, found the model unreliable, and
  replaced it with a deterministic evaluator (`phaseAdvance.ts`) triggering on
  scorer-signal **OR** engagement-floor **OR** a hard time-ceiling, polled every 2s
  so it can never stall. They also use per-phase silent system-prompt overlays with
  "drift guards", a "don't cut her off" transition (wait for `afterNextModelTurn`),
  and a two-tier scoring model (cheap live signal + authoritative end-of-session AI
  judge with explicit rubric bands + evidence).
- **Pedagogy + UX**: Gradual Release of Responsibility (I do / we do / you do),
  auto-flow the teaching, ONE hard mastery gate before the graded rep, immediate
  transcript-anchored feedback (Hattie feed-up/back/forward, 1–2 fixes, process
  praise not person praise), per-dimension **0–3 LLM-judge rubric with required
  evidence quotes** blended with deterministic signals (talk-ratio, question count),
  and a three-altitude results screen (verdict → scorecard → annotated dual-speaker
  transcript).

## Key decisions (locked with the user)

- **Practice voices:** during the live practice round, a **single** Gemini Live
  session plays the **rep only** (its own voice). Nicole is not a second live
  voice. The captured transcript *is* "the draft of everything." After the round,
  Nicole's feedback is produced by a **server LLM-judge** over that transcript and
  **spoken as key points** (headline + the one fix) while the full detail renders on
  the debrief screen.
- **Scoring engine:** a **server LLM-judge rubric** for both Training practice and
  Roleplay — per-dimension 0–3 with a required transcript quote, aggregated to 0–10
  with four bands, blended with deterministic signals. Replaces the fake engagement
  score.
- **Build order:** backend foundation first → training engine → shared live room →
  results → cross-mode wiring.
- **Verification:** unit/integration tests + Playwright against the real logged-in
  app; live voice spot-checks (Gemini key has credits).

---

## Architecture overview

Five workstreams, each an isolated unit with a clear interface.

```
┌──────────────────────────────────────────────────────────────────────┐
│ WS1  Backend foundation (server/)                                      │
│   • POST /api/training/score  → LLM-judge → Scorecard{dims,quotes,...} │
│   • Training runs are SAVED (kind:'training') via existing saveRun      │
│   • Live-status marker: POST /api/session/status {mode,skill,state}    │
│       in-memory per-user; read by relay.buildConfig for [LIVE STATUS]   │
└──────────────────────────────────────────────────────────────────────┘
            │ returns real Scorecard            │ marker read at connect
            ▼                                    ▼
┌───────────────────────────────┐   ┌──────────────────────────────────┐
│ WS2 Training phase engine      │   │ WS5 Cross-mode awareness          │
│   • phaseAdvance.ts (ported)   │   │   • client pings status on        │
│   • useCoachingSession rework: │   │     enter/start/exit              │
│     app-driven auto-advance,   │   │   • relay injects [LIVE STATUS]   │
│     don't-cut-off transitions, │   │     + activity digest now incl.   │
│     practice round, freeze+judge│   │     training runs                 │
└───────────────────────────────┘   └──────────────────────────────────┘
            │ phase + transcript                 
            ▼                                    
┌───────────────────────────────┐   ┌──────────────────────────────────┐
│ WS3 Shared LiveRoom UI         │   │ WS4 Results / debrief             │
│   • <LiveRoom> full-width:     │   │   • <SessionResults> 3 altitudes  │
│     transcript feed (Talk      │   │   • <DualTranscript> rep/you/coach│
│     bubbles) + right anchor    │   │     in separate lanes             │
│   • used by Training + Roleplay│   │   • used by Training + Roleplay   │
└───────────────────────────────┘   └──────────────────────────────────┘
```

---

## WS1 — Backend foundation

### 1.1 Scoring judge — `POST /api/training/score`

**Request** (`ScoreRequest`):
```ts
{
  kind: 'training' | 'roleplay',
  skillId?: string,            // for training: the lesson/framework
  profileId?: string,          // for roleplay: the practice profile
  dimensions: { id: string; label: string; rubric: string }[],
  transcript: { speaker: 'you' | 'rep' | 'nicole'; text: string }[],
}
```

**Response** (`Scorecard`):
```ts
{
  overallScore: number,        // 0–10, 1dp
  band: 'needs_work' | 'developing' | 'proficient' | 'strong',
  scores: {
    dimensionId: string,
    label: string,
    score: 0 | 1 | 2 | 3,
    band: 'missing' | 'emerging' | 'proficient' | 'strong',
    rationale: string,         // one clause
    evidenceQuote: string | null,  // verbatim from transcript, or null ("Unknown")
  }[],
  signals: {                   // deterministic, shown against benchmarks
    talkRatioPct: number,      // user words / (user+rep words)
    questionCount: number,
    longestMonologueWords: number,
  },
  headline: string,            // one honest behavior-based line
  worked: { note: string; quote: string | null },     // what worked + why
  fix: { note: string; quote: string | null; why: string },  // the ONE fix
  nextTime: string,            // rehearsable feed-forward line
  spoken: string,              // <= ~3 sentences Nicole reads aloud
}
```

**Implementation:** one text-LLM call (the existing `summarizerModel`, non-live),
JSON / structured output, temperature ~0.4. System prompt embeds the four scoring
bands + the per-dimension rubric text; requires reason-before-score and a verbatim
quote per dimension (or explicit null). Deterministic `signals` computed in code
(not by the model) and passed into the prompt so the judge can reference them and so
the UI can show them against benchmarks. A `fallbackScorecard` returns a safe,
honest "couldn't fully grade" result if the model output fails to parse (never
crash the debrief). Pure helpers (`computeSignals`, `bandFor`, `parseJudge`,
`fallbackScorecard`) are unit-tested without the network.

### 1.2 Training runs are saved

Today only Roleplay calls `saveRun`. Training will save a `kind:'training'` run on
debrief: `{ kind, profileId: skillId, title, score: overallScore, scorecard,
transcript }`. No schema change — the existing `nicole2_training_history` table
already has these columns. This makes Training appear in history and the activity
digest.

### 1.3 Live-status marker — `POST /api/session/status`

A lightweight, **in-memory** per-user marker (no DB; ephemeral by design):
```ts
type LiveStatus = {
  mode: 'training' | 'roleplay';
  state: 'entered' | 'active' | 'finished';
  skill?: string;              // human label, e.g. "Cold-call open"
  startedAt: number;           // epoch ms
  finishedAt?: number;
  score?: number;              // set when finished
};
```
- `POST /api/session/status` upserts the current user's marker (auth via JWT, same
  `resolveUserId` as history routes).
- `relay.buildConfig` (talk mode only) reads the marker and, when fresh (within ~15
  min), adds a `[LIVE STATUS]` line to the memory block:
  - active → "User is currently in a Training drill (Cold-call open), started 3 min
    ago."
  - finished → "User just finished a Roleplay 1 min ago — scored 6.4/10."
  - entered-but-never-active → "User opened Training a moment ago but hasn't started
    a drill."
- Markers are best-effort; failure never blocks a session. In-memory is acceptable
  because this is transient "what are you doing right now" context, not durable
  history (that's the runs table).

---

## WS2 — Training autonomous phase engine

### 2.1 Port `phaseAdvance.ts` (app-driven auto-advance)

New pure module `web/src/training/phaseAdvance.ts`:
```ts
shouldAdvancePhase(phase, signals): boolean
// advances an AUTO phase when ANY of:
//   (a) scorer:    litDelta >= cfg.minLitDelta
//   (b) engagement: turns >= cfg.minTurns && timeInPhaseMs >= cfg.minPhaseMs
//   (c) ceiling:    timeInPhaseMs >= cfg.maxPhaseMs   (can never stall)
// returns false for gate phases (readiness_check, roleplay_demo, debrief)
```
Per-phase config mirrors the chat project's proven numbers (intro fast, teach/model/
guided slower, all with a hard ceiling). Pure + fully unit-tested.

AUTO phases: `intro`, `teach`, `model`, `guided_practice`.
GATE phases (user/explicit): `readiness_check`, `roleplay_demo`, `debrief`.

### 2.2 `useCoachingSession` rework

- Owns phase state; runs an evaluator on every transcript/lit change **plus a 2s
  interval** (so the ceiling fires even on silence). Tracks `phaseEnteredAt`,
  `userTurnsThisPhase`, `litAtPhaseStart`.
- **Nicole takes charge:** the existing `[OPEN]` directive stays; per-phase overlay
  is rebuilt and pushed on each phase change. The overlay tells her to bridge
  transitions in her own words and never announce "phase two" (drift guard).
- **Don't-cut-her-off:** on phase change, if Nicole is mid-utterance, defer the
  overlay send until her turn completes (port `afterNextModelTurn`, 6s safety cap).
  Add a minimal `afterNextModelTurn(cb)` to `useNicoleSession` (resolves on the next
  `turnComplete`/`generationComplete`).
- **Live scoring pips (lightweight):** wire `training_mark_progress` end-to-end so
  the coach can light moves during guided practice (declare it server-side; attach
  `onToolCall` in the coach session → `markProgress`). This is the *instant* signal;
  the authoritative score is the WS1 judge. If the model under-calls it, the judge
  still produces the real scorecard — so the experience degrades gracefully.
- **Readiness gate:** at `readiness_check`, Nicole asks "ready to go live?"; the UI
  shows a single confirm. On confirm → `roleplay_demo`.
- **Practice round (`roleplay_demo`):** the prospect session (rep voice) is brought
  up (already supported); Nicole's overlay is silent for the rep. The practice
  transcript is captured (tagged), both speakers.
- **End-of-practice (you say "I'm done" or tap it):** freeze the practice
  transcript → `POST /api/training/score` → store the `Scorecard` → advance to
  `debrief`. Nicole speaks `scorecard.spoken` (key points) on entering debrief.
- **Debrief actions:** Replay the rep (→ `roleplay_demo` again) · Re-teach (→
  `model`) · End & save (saveRun + finalize live-status marker, then exit).

### 2.3 Per-phase prompts

Extend `lessonPrompts.ts` with the drift-guard + advance riders from the chat
project (LINGER / don't-rush / don't-announce-structure / vary-delivery) so the
auto-flow feels natural and she never narrates the machine. Add a concise
`debrief` overlay that has her speak the judge's key points (fed in via a short
overlay addendum containing `scorecard.spoken`).

---

## WS3 — Shared full-width LiveRoom

New `web/src/components/LiveRoom.tsx` (+ css) used by **both** Training and Roleplay
rooms. Replaces the narrow centered stage.

Layout (full width, no blank gutters; collapses to single-column on mobile):
```
┌───────────────────────────────────────────────┬───────────────┐
│  TRANSCRIPT FEED  (Talk chat bubbles, the SAME │  ANCHOR RAIL  │
│  renderer as TalkScreen: committed bubbles +   │  • phase      │
│  the realtime in-progress bubble)              │    stepper    │
│                                                │  • who you're │
│                                                │    talking to │
│                                                │  • target move│
│                                                │  • live pips  │
│                                                │  • primary CTA│
└───────────────────────────────────────────────┴───────────────┘
```
- The transcript uses the exact Talk chat-bubble markup/CSS (committed `transcript[]`
  + `realtime.you`/`realtime.nicole`) so it looks and behaves like Talk — the user's
  explicit ask. Extract the Talk bubble list into a small shared `<ChatTranscript>`
  so Talk, Training, and Roleplay render identically.
- Speaker labeling is configurable: Training shows "You" / "Nicole"; Roleplay shows
  "You" / `<alias>`; the practice round shows "You" / `<rep alias>`.
- Respects "live = minimal": coaching richness still waits for the debrief; the rail
  is glanceable anchors only.

The phase stepper in the rail is driven by the live phase state (same source that
gates Nicole) → the top bar / stepper always reflects reality.

---

## WS4 — Results / debrief

New `web/src/components/SessionResults.tsx` (+ css), used by both modes. Three
altitudes (Shneiderman):

1. **Verdict** — big `overallScore` + band word + color + icon (never color alone);
   the one-line `headline`; the 1–2 prescriptive fixes (`fix.note` / `nextTime`).
2. **Scorecard** — per-dimension rows: label + band + `rationale`, each expandable to
   its `evidenceQuote`. A compact deterministic strip (talk ratio / questions /
   longest monologue) each against a benchmark.
3. **Annotated dual transcript** — new `web/src/components/DualTranscript.tsx`:
   renders the frozen transcript with **separate visual lanes** per speaker:
   - **You** — one lane (e.g. right, teal).
   - **Rep / character** — distinct lane (e.g. left, amber) — the user's "rep box".
   - **Nicole** (training only, if any coaching lines) — third lane (purple).
   Alignment + color + label together (not color alone). Optional "missed moves only"
   filter later (not v1).

Roleplay's result screen is replaced by `SessionResults` fed by the WS1 judge (no
more faked per-dimension engagement rows).

---

## WS5 — Cross-mode "I'm back" awareness

- Client pings `POST /api/session/status` on: entering Training/Roleplay (`entered`),
  starting a drill/rep (`active`), and exiting/finishing (`finished` with score).
- `relay.buildConfig` (talk only) injects the `[LIVE STATUS]` line (WS1.3) plus the
  existing activity digest — which now includes training runs (WS1.2).
- The base prompt already documents `[RECENT ACTIVITY]`; add a short `[LIVE STATUS]`
  note so Nicole uses it (e.g. "if LIVE STATUS says they just finished a drill, ask
  how it went — do NOT offer to start training they already did").
- **Open Talk session freshness.** The Talk session stays mounted in the background
  while Training/Roleplay run (per `App.tsx`), so returning to Talk does NOT
  reconnect — meaning the connect-time `[LIVE STATUS]`/digest won't refresh on its
  own. Mechanism (explicit, no hedge): on return to Talk, the client sends a single
  silent `sendText('[STATUS] <one-line live status>')` directive to the live Talk
  session, built from the same marker data, so Nicole's very next turn reflects what
  just happened without a reconnect. The connect-time injection still covers the
  cold-start case (a brand-new Talk session). Both paths use the same status string
  builder.

---

## Data shapes (summary)

```ts
// Shared transcript line for scoring + results (distinct from engine TranscriptLine)
type ScoredSpeaker = 'you' | 'rep' | 'nicole';
type ResultLine = { speaker: ScoredSpeaker; text: string };

// Scorecard — produced by the server judge, rendered by SessionResults
// (full shape in WS1.1)
```

Rubric/dimensions: Training derives dimensions from the lesson's
`coreFramework.moves` (each move → a dimension with the move's intent as rubric).
Roleplay uses the profile's existing `dimensions` (with their `rubric` text, which
is currently unused). This gives both modes a real per-dimension rubric for the
judge — no faked rows.

---

## Error handling

- Judge call fails / unparseable → `fallbackScorecard` (honest "couldn't fully
  grade", deterministic signals still shown). Debrief never crashes.
- `saveRun` / status-marker failures are best-effort and swallowed (logged), never
  block the UX.
- Practice transcript empty (user never spoke) → skip the judge, show an honest
  "no rep to score yet" state with a Replay CTA.
- Dual live-session concerns are avoided entirely by the single-session decision.

## Testing strategy

- **Pure units:** `phaseAdvance` (each trigger + ceiling + gate phases),
  `computeSignals`, `bandFor`, judge `parseJudge` + `fallbackScorecard`.
- **Hook:** `useCoachingSession` — auto-advance on simulated transcript/turns, the
  2s ceiling, readiness gate, freeze→judge→debrief, debrief actions. (Mock the
  session + fetch, as existing tests do.)
- **Server:** `/api/training/score` route (mock model), `/api/session/status`
  upsert+read, `[LIVE STATUS]` injection in `buildConfig`.
- **UI (Playwright, real logged-in app):** the full-width LiveRoom layout (no blank
  gutters; Talk-style bubbles), the readiness gate, the results screen with the
  dual-speaker transcript lanes. Mobile layout pass.
- **Live voice spot-check:** with credits, confirm Nicole opens autonomously, the
  top bar tracks the live phase, the rep takes over for practice, and she speaks the
  feedback key points.

## Out of scope (YAGNI for v1)

- Multi-level mastery ladder (`level_gate`/`level_choice` looping) — keep linear.
- Dual live voices during practice (explicitly decided against).
- "Missed moves only" transcript filter + jump-to-moment navigation (later).
- Session-resumption/cold-reload guards for a second prospect socket (no second
  socket in v1).
- Speech-analytics beyond the three deterministic signals above.
```
