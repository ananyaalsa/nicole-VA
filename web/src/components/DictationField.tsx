import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useDictation } from '../engine/useDictation';
import './DictationField.css';

export interface DictationFieldProps {
  /** Current text value (controlled). */
  value: string;
  /** Called whenever the text changes (typing OR dictation). */
  onChange: (value: string) => void;
  /** Placeholder shown when empty. */
  placeholder?: string;
  /** Textarea rows. */
  rows?: number;
  /** Optional label above the field. */
  label?: string;
  /** Disable the whole field. */
  disabled?: boolean;
}

/**
 * An editable text field you can also DICTATE into.
 *
 * Type normally, or press the mic to speak — your speech is transcribed live and
 * merged into the field, and you can keep editing the text by hand at any time.
 * Used for the custom-coach / custom-training description.
 */
export function DictationField({
  value,
  onChange,
  placeholder,
  rows = 4,
  label,
  disabled,
}: DictationFieldProps): JSX.Element {
  const dictation = useDictation();
  // The text the field had when the current dictation started — new transcript
  // is appended after it, so dictation never clobbers prior typed text.
  const baseRef = useRef('');
  const [error, setError] = useState<string | null>(null);

  // While listening, merge the live dictation transcript into the value.
  useEffect(() => {
    if (dictation.listening && dictation.text) {
      const base = baseRef.current;
      const merged = base ? `${base} ${dictation.text}`.trim() : dictation.text;
      onChange(merged);
    }
    // onChange intentionally omitted — it can be an unstable inline fn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictation.text, dictation.listening]);

  const handleMic = async () => {
    setError(null);
    if (dictation.listening) {
      dictation.stop();
      return;
    }
    baseRef.current = value.trim();
    try {
      await dictation.start();
    } catch (e) {
      setError((e as Error)?.message ?? 'Could not start the mic.');
    }
  };

  return (
    <div className={`dictation-field${disabled ? ' is-disabled' : ''}`}>
      {label && <label className="dictation-field__label hud-label">{label}</label>}
      <div className="dictation-field__box">
        <textarea
          className="dictation-field__input"
          data-testid="dictation-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
        />
        <button
          type="button"
          className={`dictation-field__mic${dictation.listening ? ' is-listening' : ''}`}
          data-testid="dictation-mic"
          onClick={() => void handleMic()}
          disabled={disabled}
          title={dictation.listening ? 'Stop dictation' : 'Dictate with your voice'}
          aria-pressed={dictation.listening}
        >
          <span className="dictation-field__mic-dot" aria-hidden="true" />
          {dictation.listening ? 'Listening… tap to stop' : 'Dictate'}
        </button>
      </div>
      {error && <p className="dictation-field__error" role="alert">{error}</p>}
    </div>
  );
}

export default DictationField;
