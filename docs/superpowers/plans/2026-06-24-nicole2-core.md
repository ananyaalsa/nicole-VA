# Nicole 2.0 Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Nicole as a minimal, phenomenal, stable voice assistant — copying CHAT's talking/training/prompts, fixing memory + long-hours stability — with a fresh own backend + frontend.

**Architecture:** Node/TS backend relays Gemini Live (key server-side), owns session stability (auto-reconnect, resume handles, proactive reconnect, live summarization) and durable memory in CHAT's Supabase Postgres. React/Vite frontend does voice capture/playback, live transcript, 2D SVG avatar with lip-sync, animated background, voice switching, and training mode.

**Tech Stack:** Node 18+, TypeScript, ws, @google/genai, pg, dotenv, vitest (server); React 19, Vite, TypeScript, Web Audio, Canvas/SVG, vitest + Testing Library (web).

## Global Constraints

- Gemini API key NEVER reaches the browser — all Gemini access server-side.
- Live model: `gemini-3.1-flash-live-preview` (env `GEMINI_LIVE_MODEL`).
- Summarizer model: `gemini-2.5-flash`.
- VAD verbatim from CHAT: `startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH'`, `endOfSpeechSensitivity: 'END_SENSITIVITY_LOW'`, `prefixPaddingMs: 600`, `silenceDurationMs: 700`.
- Resume handle max age: `110 * 60 * 1000` ms. Proactive reconnect threshold: `100 * 60 * 1000` ms.
- New DB table only: `nicole2_memory`. NEVER touch CHAT's existing tables.
- Voices: Aoede, Kore, Leda, Zephyr (female); Charon, Fenrir, Orus, Puck (male).
- Excluded entirely: phone, Twilio, LiveKit, calendar, email, documents, panels, camera, face, contacts, persona-switch, premium toggle.
- TDD for all pure logic. Frequent commits. DRY, YAGNI.

---

## Workstream A — Server foundation & stability (build first; B/C/D depend on shared types from A1)

### Task A1: Project scaffold + shared config/types

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/.env` (copy secrets from CHAT), `server/.gitignore`
- Create: `server/src/config.ts`
- Create: `server/src/types.ts`
- Test: `server/src/config.test.ts`

**Interfaces:**
- Produces: `config` object (`{ geminiApiKey, liveModel, summarizerModel, databaseUrl, port, userId }`); types `SessionConfig`, `MemoryFact`, `RelayClientMsg`, `RelayServerMsg`.

- [ ] Step 1: Init `server/package.json` with deps (`ws`, `@google/genai`, `pg`, `dotenv`) + devDeps (`typescript`, `vitest`, `@types/ws`, `@types/node`, `tsx`); scripts `dev` (tsx watch), `build` (tsc), `test` (vitest run), `start`.
- [ ] Step 2: `tsconfig.json` (NodeNext module, strict, outDir dist).
- [ ] Step 3: Create `server/.env` with `GEMINI_API_KEY`, `GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview`, `GEMINI_SUMMARIZER_MODEL=gemini-2.5-flash`, `DATABASE_URL`, `PORT=4000`, `NICOLE_USER_ID=local-user` (values copied from CHAT `.env`). Add `.gitignore` ignoring `.env`, `dist`, `node_modules`.
- [ ] Step 4: Write `config.test.ts` asserting `config.liveModel === 'gemini-3.1-flash-live-preview'` default and that missing `GEMINI_API_KEY` throws.
- [ ] Step 5: Run `npm test` → fails (no config).
- [ ] Step 6: Implement `config.ts` (dotenv load, read env, throw if no key) and `types.ts` with the interfaces above.
- [ ] Step 7: Run `npm test` → passes.
- [ ] Step 8: Commit `chore(server): scaffold + config/types`.

### Task A2: Session timing logic (pure, TDD) — ported from CHAT

**Files:**
- Create: `server/src/session/sessionTiming.ts`
- Test: `server/src/session/sessionTiming.test.ts`

**Interfaces:**
- Produces: `RESUME_HANDLE_MAX_AGE_MS`, `SESSION_PROACTIVE_RECONNECT_MS`, `isResumeHandleUsable(capturedAtMs: number|null, nowMs: number): boolean`, `shouldProactiveReconnect(sessionAgeMs: number, handleAgeMs: number|null, nowSpeaking: boolean): boolean`.

- [ ] Step 1: Write tests: handle null→unusable; fresh handle (age < 110min)→usable; expired→unusable; proactive reconnect true only when age≥100min AND not speaking AND usable handle; false when speaking; false when no handle.
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement the two pure functions + constants exactly as CHAT's `liveSessionConfig.ts` (logic verbatim).
- [ ] Step 4: Run → passes.
- [ ] Step 5: Commit `feat(server): session timing logic (resume + proactive reconnect)`.

### Task A3: Summary trigger logic (pure, TDD)

**Files:**
- Create: `server/src/session/summaryTrigger.ts`
- Test: `server/src/session/summaryTrigger.test.ts`

**Interfaces:**
- Produces: `estimateTokens(text: string): number`; `shouldSummarize(turnCount: number, estTokens: number): boolean` (threshold e.g. turnCount ≥ 40 OR estTokens ≥ 12000); `splitForSummary(turns: Turn[]): { toSummarize: Turn[], toKeep: Turn[] }` (keep last 8 turns, summarize the rest).
- Consumes: `Turn` type `{ role: 'user'|'nicole', text: string }` (add to types.ts in A1).

- [ ] Step 1: Write tests: below threshold→false; at/above turn or token threshold→true; split keeps last 8, summarizes earlier; empty→no-op.
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement (rough token est ≈ chars/4).
- [ ] Step 4: Run → passes.
- [ ] Step 5: Commit `feat(server): summary trigger + transcript split`.

### Task A4: Gemini Live relay config builder (pure, TDD)

**Files:**
- Create: `server/src/gemini/liveConfig.ts`
- Test: `server/src/gemini/liveConfig.test.ts`

**Interfaces:**
- Produces: `REALTIME_INPUT_CONFIG` (verbatim VAD); `buildLiveConfig({ systemPrompt, voiceName, tools }): object` returning the Gemini Live `config` (model, responseModalities AUDIO, speechConfig with prebuiltVoiceConfig.voiceName, systemInstruction, realtimeInputConfig, tools, sessionResumption enabled).

- [ ] Step 1: Write tests: config includes the exact VAD values; voiceName threads into `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`; systemInstruction present; sessionResumption requested.
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement.
- [ ] Step 4: Run → passes.
- [ ] Step 5: Commit `feat(server): Gemini Live config builder`.

### Task A5: Gemini Live relay (WebSocket bridge)

**Files:**
- Create: `server/src/gemini/relay.ts`
- Create: `server/src/server.ts` (HTTP + WS upgrade on `/ai-live`)
- Test: `server/src/gemini/relay.test.ts` (mock `@google/genai` Live session)

**Interfaces:**
- Consumes: `buildLiveConfig` (A4), session timing (A2), summary trigger (A3), `config` (A1), memory loader (B2), summarizer (A6).
- Produces: WS endpoint `/ai-live`. Client→server msgs: `{type:'connect',config}`, `{type:'client-msg',payload}` (audio/text), `{type:'tool-response',payload}`. Server→client: `{type:'message',data}` (audio/transcript/toolcall), `{type:'reconnecting'}`, `{type:'ready'}`.

- [ ] Step 1: Write test with a mocked Gemini Live session: on `connect`, relay opens Gemini session with built config; inbound Gemini messages forward to client; on simulated `goAway`/close, relay reconnects using saved resume handle and does NOT re-send a greeting; captures resume handle on `sessionResumptionUpdate`.
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement relay: open `ai.live.connect`, pipe both directions, capture resume handle, reconnect on close using `isResumeHandleUsable`, run proactive-reconnect watchdog via `shouldProactiveReconnect`, and on summary trigger call summarizer then reconnect seeded with `[SUMMARY]`. Wire memory tools (`save_memory`/`forget_memory`/`training_mark_progress`) tool-calls to handlers.
- [ ] Step 4: Run → passes.
- [ ] Step 5: Create `server.ts` starting HTTP server + WS upgrade, mount relay. Manual: `npm run dev` boots without crash.
- [ ] Step 6: Commit `feat(server): Gemini Live relay with auto-reconnect + resume`.

### Task A6: Summarizer (Gemini non-live call)

**Files:**
- Create: `server/src/gemini/summarizer.ts`
- Test: `server/src/gemini/summarizer.test.ts` (mock genai generateContent)

**Interfaces:**
- Produces: `summarizeTurns(turns: Turn[]): Promise<string>` using `config.summarizerModel`, returning a concise paragraph.

- [ ] Step 1: Write test mocking genai: given turns, calls summarizer model with a compression prompt; returns trimmed text; empty turns → empty string (no call).
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement.
- [ ] Step 4: Run → passes.
- [ ] Step 5: Commit `feat(server): conversation summarizer`.

---

## Workstream B — Memory & system prompt (parallel with A after A1)

### Task B1: Memory DB layer + migration

**Files:**
- Create: `server/src/memory/db.ts`
- Create: `server/src/memory/migrate.ts` (creates `nicole2_memory` if not exists)
- Test: `server/src/memory/db.test.ts` (mock `pg` Pool)

**Interfaces:**
- Produces: `saveFact({userId,key,fact,factType}): Promise<MemoryFact>` (upsert on user_id+key), `forgetFact(userId,key): Promise<void>`, `loadFacts(userId): Promise<MemoryFact[]>`, `ensureSchema(): Promise<void>`.
- Table `nicole2_memory(id serial pk, user_id text, key text, fact text, fact_type text, created_at, updated_at, unique(user_id,key))`.

- [ ] Step 1: Write tests (mock pg): save issues upsert SQL; forget issues delete by user+key; load selects by user ordered by updated_at; ensureSchema runs CREATE TABLE IF NOT EXISTS.
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement using `pg` Pool from `config.databaseUrl`.
- [ ] Step 4: Run → passes.
- [ ] Step 5: Manual: run `migrate.ts` against the real DB; confirm `nicole2_memory` created, no other table touched.
- [ ] Step 6: Commit `feat(server): nicole2_memory DB layer + migration`.

### Task B2: Memory → system prompt block + memory tools

**Files:**
- Create: `server/src/memory/memoryBlock.ts`
- Create: `server/src/memory/memoryTools.ts`
- Test: `server/src/memory/memoryBlock.test.ts`

**Interfaces:**
- Consumes: `loadFacts`/`saveFact`/`forgetFact` (B1).
- Produces: `formatMemoryBlock(facts: MemoryFact[]): string` → `[MEMORY]\n- key: fact ...` (empty→''); `MEMORY_TOOL_DECLS` (Gemini tool schemas for `save_memory`, `forget_memory`); `handleMemoryTool(name, args, userId): Promise<{ok:boolean}>`.

- [ ] Step 1: Write tests: formatMemoryBlock with facts produces a labeled block; empty → ''; handleMemoryTool('save_memory',...) calls saveFact; ('forget_memory',...) calls forgetFact.
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement.
- [ ] Step 4: Run → passes.
- [ ] Step 5: Commit `feat(server): memory block + save/forget tools`.

### Task B3: System prompt assembly (Nicole personality, stripped)

**Files:**
- Create: `server/src/prompt/nicolePrompt.ts`
- Test: `server/src/prompt/nicolePrompt.test.ts`

**Interfaces:**
- Consumes: `formatMemoryBlock` (B2).
- Produces: `NICOLE_BASE_PROMPT` (CHAT personality: IDENTITY, SPEECH RULES, NOISE HANDLING, VOICE & PERSONALITY, robot-avoidance, MEMORY guidance — stripped of phone/docs/panels/etc.); `buildSystemPrompt({ memoryBlock, summary }): string`.

- [ ] Step 1: Write tests: base prompt contains "You are Nicole" and the no-markdown / identity rules; buildSystemPrompt injects `[MEMORY]` and `[SUMMARY]` when provided, omits when empty; never contains excluded-feature words ("make_phone_call", "business plan", "generate_presentation").
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement: copy the talking/personality sections from CHAT's `ALSA_SYSTEM_INSTRUCTION` verbatim, drop tool/feature sections, append memory+summary injection.
- [ ] Step 4: Run → passes.
- [ ] Step 5: Commit `feat(server): Nicole system prompt assembly`.

### Task B4: Memory HTTP API

**Files:**
- Create: `server/src/memory/routes.ts`
- Modify: `server/src/server.ts` (mount routes)
- Test: `server/src/memory/routes.test.ts`

**Interfaces:**
- Produces: `GET /api/memory`, `POST /api/memory`, `DELETE /api/memory/:key` (JSON), using B1.

- [ ] Step 1: Write tests (supertest or node http mock): GET returns facts; POST upserts; DELETE forgets.
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement minimal router (no framework needed; or add `express` if simpler — allowed).
- [ ] Step 4: Run → passes.
- [ ] Step 5: Commit `feat(server): memory HTTP API`.

---

## Workstream C — Frontend foundation, voice, transcript (parallel; depends on relay protocol from A5 docs only)

### Task C1: Web scaffold

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/.env` (`VITE_SERVER_WS=ws://localhost:4000/ai-live`, `VITE_SERVER_HTTP=http://localhost:4000`)
- Test: `web/src/smoke.test.tsx`

**Interfaces:**
- Produces: running Vite app shell.

- [ ] Step 1: Init Vite React-TS deps; vitest + @testing-library/react + jsdom config.
- [ ] Step 2: Write smoke test: App renders a root element with text "Nicole".
- [ ] Step 3: Run → fails.
- [ ] Step 4: Implement minimal App.
- [ ] Step 5: Run → passes; `npm run dev` serves.
- [ ] Step 6: Commit `chore(web): scaffold`.

### Task C2: Audio capture + playback utils (pure where possible, TDD)

**Files:**
- Create: `web/src/audio/pcm.ts` (float32↔int16, base64 encode/decode, resample helpers)
- Create: `web/src/audio/playbackQueue.ts` (bounded queue)
- Test: `web/src/audio/pcm.test.ts`, `web/src/audio/playbackQueue.test.ts`

**Interfaces:**
- Produces: `floatTo16BitPCM`, `int16ToFloat32`, `base64ToArrayBuffer`, `arrayBufferToBase64`; `PlaybackQueue` with `enqueue`, `flush` (barge-in), bounded length (drops/caps to prevent unbounded growth).

- [ ] Step 1: Tests: round-trip float→int16→float within tolerance; base64 round-trip; queue.flush empties; queue caps at max length (leak-safe).
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement.
- [ ] Step 4: Run → passes.
- [ ] Step 5: Commit `feat(web): audio pcm + bounded playback queue`.

### Task C3: Live session hook (WS client, reconnect-aware, leak-safe)

**Files:**
- Create: `web/src/engine/useNicoleSession.ts`
- Test: `web/src/engine/useNicoleSession.test.ts` (mock WebSocket + AudioContext)

**Interfaces:**
- Consumes: pcm utils + PlaybackQueue (C2).
- Produces: `useNicoleSession({ voiceName, mode })` → `{ connected, micOn, toggleMic, transcript, amplitude, start, stop, setVoice }`. On unmount/voice change/reconnect: tears down AudioContext + stream tracks + queue (no leaks). Sends mic PCM; renders incoming transcript; exposes live output amplitude for lip-sync.

- [ ] Step 1: Tests: hook connects WS, sends `connect`; incoming transcript message appends to transcript state (You/Nicole); teardown closes AudioContext + stops tracks; setVoice triggers reconnect with new voice; amplitude updates from analyser.
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement.
- [ ] Step 4: Run → passes.
- [ ] Step 5: Commit `feat(web): Nicole live session hook (leak-safe)`.

### Task C4: Transcript component (DOM-trimmed)

**Files:**
- Create: `web/src/components/Transcript.tsx`
- Test: `web/src/components/Transcript.test.tsx`

**Interfaces:**
- Consumes: transcript array from C3.
- Produces: `<Transcript lines={...} maxRendered={120} />` — renders only last `maxRendered` lines, auto-scrolls, speaker-labeled.

- [ ] Step 1: Tests: given 500 lines + maxRendered 120, only 120 rendered; newest visible; speaker labels present.
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement.
- [ ] Step 4: Run → passes.
- [ ] Step 5: Commit `feat(web): DOM-trimmed transcript`.

### Task C5: Voice switcher

**Files:**
- Create: `web/src/components/VoiceSwitcher.tsx`
- Create: `web/src/audio/voices.ts` (voice list + style prompts)
- Test: `web/src/audio/voices.test.ts`

**Interfaces:**
- Produces: `VOICES` array (8 voices w/ label, gender, stylePrompt); `<VoiceSwitcher value onChange />` calls `setVoice` (C3).

- [ ] Step 1: Tests: VOICES has the 8 names; each has a stylePrompt; switcher onChange fires with selected name.
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement.
- [ ] Step 4: Run → passes.
- [ ] Step 5: Commit `feat(web): voice switcher`.

---

## Workstream D — Avatar, background, UI shell (parallel; depends on amplitude from C3)

### Task D1: 2D avatar (SVG/Canvas) with blink + lip-sync

**Files:**
- Create: `web/src/avatar/NicoleAvatar.tsx`
- Create: `web/src/avatar/blink.ts` (blink timer logic, pure)
- Create: `web/src/avatar/mouth.ts` (amplitude→mouth-openness mapping, pure)
- Test: `web/src/avatar/blink.test.ts`, `web/src/avatar/mouth.test.ts`

**Interfaces:**
- Consumes: `amplitude` (C3).
- Produces: `<NicoleAvatar amplitude={n} speaking={bool} />`; `nextBlinkDelay(rng): number` (randomized natural interval); `mouthOpenness(amplitude): number` (0..1 clamped/smoothed).

- [ ] Step 1: Tests: nextBlinkDelay within natural range (e.g. 2–6s); mouthOpenness(0)=~0, high amplitude→near 1, clamped; smoothing monotonic.
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement pure logic, then the SVG face component (eyes that blink, mouth that opens by openness, subtle breathing transform).
- [ ] Step 4: Run → passes.
- [ ] Step 5: Commit `feat(web): 2D Nicole avatar with blink + lip-sync`.

### Task D2: Animated background

**Files:**
- Create: `web/src/components/AuroraBackground.tsx`
- Test: `web/src/components/AuroraBackground.test.tsx`

**Interfaces:**
- Produces: `<AuroraBackground />` — animated aurora/gradient + soft particle drift (CSS/Canvas), GPU-friendly, pauses on tab hidden (leak/perf-safe).

- [ ] Step 1: Test: renders a canvas/root; respects `prefers-reduced-motion`.
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement.
- [ ] Step 4: Run → passes.
- [ ] Step 5: Commit `feat(web): animated aurora background`.

### Task D3: Main UI shell — wire everything (talk mode)

**Files:**
- Modify: `web/src/App.tsx`
- Create: `web/src/screens/TalkScreen.tsx`
- Test: `web/src/screens/TalkScreen.test.tsx`

**Interfaces:**
- Consumes: useNicoleSession (C3), Transcript (C4), VoiceSwitcher (C5), NicoleAvatar (D1), AuroraBackground (D2).
- Produces: full talk screen: background + centered avatar (lip-syncing) + transcript + voice switcher + mic/talk + connect/disconnect.

- [ ] Step 1: Test: TalkScreen renders avatar, transcript, voice switcher, mic button; clicking talk calls session.start.
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement, applying frontend-design principles (distinctive, polished).
- [ ] Step 4: Run → passes.
- [ ] Step 5: Commit `feat(web): talk screen wiring`.

---

## Workstream E — Training mode (after A5 relay + B3 prompt + D3 shell)

### Task E1: Phase machine + buildPhasePrompt (pure, TDD) — ported from CHAT

**Files:**
- Create: `web/src/training/phaseMachine.ts`
- Create: `web/src/training/lessonPrompts.ts`
- Create: `web/src/training/lessons.ts` (1–2 authored ClientLessonSpec)
- Test: `web/src/training/lessonPrompts.test.ts`, `web/src/training/phaseMachine.test.ts`

**Interfaces:**
- Produces: `Phase` type + ordered phases; `ClientLessonSpec`, `ClientMove`; `buildPhasePrompt(lesson, phase, reTeachMove, difficultyPrompt): string` (with DRIFT_GUARD/ADVANCE_RIDER/VARY_DELIVERY/SCORE_RIDER/GATE_RIDER as CHAT); `advancePhase(phase, signals): Phase`.

- [ ] Step 1: Tests: intro prompt is short + contains hook, no move-teaching; teach lists moves + no-markdown rule; debrief has no drift guard; guided_practice + roleplay_demo include SCORE_RIDER; gate phases include GATE_RIDER; advancePhase order correct.
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement by porting CHAT's `lessonPrompts.ts` + a phase machine; author 1–2 lessons.
- [ ] Step 4: Run → passes.
- [ ] Step 5: Commit `feat(web): training phase machine + lesson prompts`.

### Task E2: Dual-voice coaching engine

**Files:**
- Create: `web/src/training/useCoachingSession.ts`
- Test: `web/src/training/useCoachingSession.test.ts`

**Interfaces:**
- Consumes: useNicoleSession pattern (C3), buildPhasePrompt (E1).
- Produces: `useCoachingSession({ lesson })` driving TWO sessions: coach (Nicole, avatar) always; prospect (audio-only) during roleplay_demo; phase-aware system overlays; silent scoring via `training_mark_progress`; scorecard state.

- [ ] Step 1: Tests (mock sessions): coach session always active; prospect session only in roleplay_demo; phase change updates coach overlay; training_mark_progress updates scorecard, never spoken.
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement.
- [ ] Step 4: Run → passes.
- [ ] Step 5: Commit `feat(web): dual-voice coaching engine`.

### Task E3: Training screen + scorecard

**Files:**
- Create: `web/src/screens/TrainingScreen.tsx`
- Create: `web/src/components/Scorecard.tsx`
- Modify: `web/src/App.tsx` (mode switch Talk/Training)
- Test: `web/src/screens/TrainingScreen.test.tsx`

**Interfaces:**
- Consumes: useCoachingSession (E2), avatar/background/transcript.
- Produces: training screen with lesson picker, live phase indicator, scorecard, debrief.

- [ ] Step 1: Test: renders lesson picker; starting a lesson mounts coaching session; scorecard reflects marks.
- [ ] Step 2: Run → fails.
- [ ] Step 3: Implement.
- [ ] Step 4: Run → passes.
- [ ] Step 5: Commit `feat(web): training screen + scorecard`.

---

## Workstream F — Integration & stability verification (last)

### Task F1: End-to-end manual run + stability checks

**Files:**
- Create: `README.md` (run instructions)
- Create: `docs/STABILITY-CHECKLIST.md`

- [ ] Step 1: Run server (`npm run dev`) + web (`npm run dev`); have a real voice conversation; confirm talking quality, transcript, voice switch, avatar lip-sync.
- [ ] Step 2: Run a ≥1h session (or simulate by lowering thresholds): confirm auto-reconnect on drop (kill/restore network), proactive reconnect fires, live summary triggers, Nicole keeps context, page memory flat (DevTools heap), no audio glitches.
- [ ] Step 3: Confirm durable memory: save facts, restart both apps, new session greets with facts.
- [ ] Step 4: Run training lesson end-to-end: phases progress, prospect voice in roleplay, silent scoring.
- [ ] Step 5: Write README + stability checklist; commit `docs: run instructions + stability checklist`.

---

## Self-Review

- **Spec coverage:** talking (A4/A5/B3/C2/C3), transcript (C4), voice switch (C5), memory durable (B1/B2/B4) + load into prompt (B3), live summary (A3/A6/A5), reconnect/resume (A2/A5), avatar (D1), background (D2), UI (D3), training (E1/E2/E3), DB reuse new table (B1), secrets server-side (A1). All covered.
- **Placeholders:** none — each task has concrete files, interfaces, tests.
- **Type consistency:** `Turn`, `MemoryFact`, `SessionConfig` defined in A1; `ClientLessonSpec`/`Phase` in E1; `buildPhasePrompt`/`buildSystemPrompt`/`buildLiveConfig` names consistent across consumers.
- **Parallelism:** A1 first (shared types). Then A2–A6 + B1–B4 (server) parallel with C1–C5 + D1–D3 (web). E after E-deps. F last.
