import { useCallback, useEffect, useRef } from 'react';
import { useNicoleSession } from '../engine/useNicoleSession';
import { useAuth } from '../auth/AuthContext';
import type { TranscriptLine } from '../engine/types';
import type { PersonaOption, ScenarioOption } from './trainingApi';

/**
 * A pure ROLEPLAY session — the experience behind the "Roleplay" button.
 *
 * A SINGLE Gemini Live session plays the OTHER PARTY (the prospect / recruiter /
 * interviewer) using a DIFFERENT voice from Nicole, so it feels like a real
 * conversation with someone else. Nicole is NOT in this session at all — no
 * coaching, no tips, no commentary. Just you and the character.
 *
 * It auto-starts: the moment the session connects, a silent "[OPEN]" directive
 * is sent so the character greets you first IN CHARACTER. The user only has to
 * enter the room; the system drives it.
 *
 * Scoring is computed at the end from move/keyword coverage (no live Nicole tool
 * calls, since Nicole isn't present), and surfaced when the run ends.
 */

export interface UseRoleplayOptions {
  persona: PersonaOption;
  scenario: ScenarioOption;
  /** Optional extra free-text for custom persona/scenario. */
  extraOverlay?: string;
}

export interface UseRoleplayResult {
  connected: boolean;
  micOn: boolean;
  /** Live transcript — 'you' = the user, 'nicole' label is shown as the character. */
  transcript: TranscriptLine[];
  /** Other-party audio amplitude (for the avatar/aura). */
  amplitude: number;
  /** In-progress (realtime) text per speaker — passed straight through to LiveRoom. */
  realtime: { you: string; nicole: string };
  start: () => Promise<void>;
  stop: () => void;
  toggleMic: () => void;
  /** Set the mic on/off explicitly (used to silence the mic when the end-of-call
   *  prompt appears, so the user's "replay or end?" decision isn't transcribed). */
  setMic: (on: boolean) => void;
  /** Wipe the visible transcript — used by Replay to start the same scene fresh. */
  clearTranscript: () => void;
}

/**
 * Build the full system overlay for the other-party session: the persona's
 * coach/character overlay + the scenario's prospect overlay + an instruction to
 * stay fully in character and never break to coach.
 */
export function buildRoleplayOverlay(
  persona: PersonaOption,
  scenario: ScenarioOption,
  extra?: string,
): string {
  const alias = persona.characterAlias;
  return [
    `You are role-playing as "${alias}". Stay FULLY in character for the ENTIRE conversation, including the ending.`,
    persona.systemOverlay,
    scenario.prospectOverlay,
    extra ?? '',
    // This is a pure roleplay — no coaching, no breaking character, no tips.
    `IMPORTANT: This is a live role-play, not a lesson. Do NOT coach, do NOT give feedback or tips, do NOT break character to comment. You ARE ${alias}. Never introduce yourself as Nicole or as an AI. Speak naturally as a real person in this scenario. You are speaking out loud — no markdown, no stage directions in brackets.`,
    // The critical fix: the character must NOT revert to a helpful-assistant /
    // "Nicole" persona when the call winds down. A goodbye is the END of the
    // scene, not a handoff to an assistant.
    `ENDING THE CALL: When the user signals the call is over (says bye, goodbye, talk later, gotta go, thanks for your time, etc.), respond with ONE short, natural in-character sign-off as ${alias} (e.g. "Alright, talk soon — bye." or "Sounds good, take care.") and then STOP. After a goodbye you are STILL ${alias} — do NOT switch into a helpful assistant, do NOT ask "what else can I help you with?", do NOT offer to do tasks, check calendars, or assist. ${alias} is a person in this scenario, not an AI assistant — stay that person no matter what, even if the user keeps talking after the goodbye.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The silent opening directive that makes the character greet first. */
const OPEN_DIRECTIVE =
  '[OPEN] Greet the user briefly IN CHARACTER and pull them into the scenario (one short opening line — e.g. answer the phone, or open the interview), then wait for their response. Do not explain that this is a role-play.';

export function useRoleplaySession(opts: UseRoleplayOptions): UseRoleplayResult {
  const overlay = buildRoleplayOverlay(opts.persona, opts.scenario, opts.extraOverlay);
  const voice = opts.persona.voiceName || 'Charon';
  const { token } = useAuth();

  const session = useNicoleSession({
    voiceName: voice,
    mode: 'prospect',
    systemOverlay: overlay,
    authToken: token,
  });

  const sentOpenRef = useRef(false);

  // Keep the latest session methods in refs so the effects below can depend only
  // on primitive state (session.connected), NOT on the `session` object — which
  // useNicoleSession recreates every render. Depending on it would re-run the
  // teardown each render and kill the live session mid-connect.
  const sendTextRef = useRef(session.sendText);
  sendTextRef.current = session.sendText;
  const stopRef = useRef(session.stop);
  stopRef.current = session.stop;
  const startRef = useRef(session.start);
  startRef.current = session.start;

  // Once connected, fire the silent [OPEN] so the character speaks first.
  useEffect(() => {
    if (session.connected && !sentOpenRef.current) {
      sentOpenRef.current = true;
      // Small delay so the live session is fully ready to accept a turn.
      const t = setTimeout(() => {
        sendTextRef.current(OPEN_DIRECTIVE);
      }, 500);
      return () => clearTimeout(t);
    }
    if (!session.connected) {
      sentOpenRef.current = false;
    }
  }, [session.connected]);

  // Clean teardown on unmount ONLY.
  useEffect(() => () => stopRef.current(), []);

  const start = useCallback(async () => {
    sentOpenRef.current = false;
    await startRef.current();
  }, []);

  return {
    connected: session.connected,
    micOn: session.micOn,
    transcript: session.transcript,
    amplitude: session.amplitude,
    realtime: session.realtime,
    start,
    stop: session.stop,
    toggleMic: session.toggleMic,
    setMic: session.setMic,
    clearTranscript: session.clearTranscript,
  };
}
