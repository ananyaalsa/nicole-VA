import { useCallback, useEffect, useRef, useState } from 'react';
import { useNicoleSession } from './useNicoleSession';
import type { TranscriptLine } from './types';

/**
 * Voice dictation: hold-to-talk (or toggle) and get a live text transcript of
 * what YOU say, which the caller drops into an editable field.
 *
 * It reuses the live session purely as a transcriber: it connects with a
 * "silent transcriber" overlay so the model does NOT reply, and we read only the
 * user-side ('you') transcript lines, joining them into the dictated text. The
 * caller can edit the result freely afterward.
 */

const TRANSCRIBER_OVERLAY =
  'You are a silent dictation transcriber. Do NOT speak, do NOT respond, do NOT ' +
  'acknowledge anything. Stay completely silent no matter what the user says. ' +
  'Your only job is to let their speech be transcribed. Produce no audio output.';

export interface UseDictationResult {
  /** Is the mic currently capturing? */
  listening: boolean;
  /** The transcript of what the user has said so far this dictation. */
  text: string;
  /** Start listening (connects + opens mic). */
  start: () => Promise<void>;
  /** Stop listening (closes the session/mic). */
  stop: () => void;
  /** Toggle listening on/off. */
  toggle: () => Promise<void>;
  /** Clear the captured text (e.g. when the field is reset). */
  reset: () => void;
}

/** Join the user-side ('you') transcript lines into one dictation string. */
export function joinUserTranscript(lines: TranscriptLine[]): string {
  return lines
    .filter((l) => l.speaker === 'you')
    .map((l) => l.text.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

export function useDictation(): UseDictationResult {
  // A transcribe-only session — Nicole stays silent; we read 'you' lines.
  const session = useNicoleSession({
    voiceName: 'Aoede',
    mode: 'talk',
    systemOverlay: TRANSCRIBER_OVERLAY,
  });

  const [listening, setListening] = useState(false);
  const text = joinUserTranscript(session.transcript);

  // Stable refs so effects/callbacks don't churn on the recreated session object.
  const startRef = useRef(session.start);
  startRef.current = session.start;
  const stopRef = useRef(session.stop);
  stopRef.current = session.stop;

  const start = useCallback(async () => {
    await startRef.current();
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    stopRef.current();
    setListening(false);
  }, []);

  const toggle = useCallback(async () => {
    if (listening) stop();
    else await start();
  }, [listening, start, stop]);

  const reset = useCallback(() => {
    // The session owns the transcript; stopping clears it on the next start.
    stopRef.current();
    setListening(false);
  }, []);

  // Always release the mic/session on unmount.
  useEffect(() => () => stopRef.current(), []);

  return { listening, text, start, stop, toggle, reset };
}
