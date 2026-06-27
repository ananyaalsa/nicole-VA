import { useEffect, useRef, useState } from 'react';

/**
 * Smooth a raw "is speaking" signal (amplitude > threshold, which flips many
 * times a second as the voice dips between syllables) into a STABLE flag.
 *
 * It turns on immediately when speech starts, but only turns off after the
 * signal has stayed quiet for `holdMs` — so a brief pause mid-sentence doesn't
 * flicker the Speaking/Listening label back and forth (which read as a glitch).
 */
export function useDebouncedSpeaking(rawSpeaking: boolean, holdMs = 450): boolean {
  const [stable, setStable] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (rawSpeaking) {
      // Speech is active → cancel any pending turn-off and show speaking now.
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setStable((s) => (s ? s : true));
    } else if (!timerRef.current) {
      // Went quiet → wait holdMs before declaring her done (rides out brief dips).
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setStable(false);
      }, holdMs);
    }
  }, [rawSpeaking, holdMs]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return stable;
}
