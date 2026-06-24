import type { JSX } from 'react';
import { VOICES } from '../audio/voices';
import type { Voice } from '../audio/voices';
import './VoiceSwitcher.css';

export interface VoiceSwitcherProps {
  /** Currently selected voice name. */
  value: string;
  /** Called with the newly selected voice name. */
  onChange: (name: string) => void;
}

const GROUPS: Array<{ gender: Voice['gender']; label: string }> = [
  { gender: 'female', label: 'Female' },
  { gender: 'male', label: 'Male' },
];

/**
 * Polished voice picker. Voices are grouped by gender; the active voice is
 * highlighted and exposes aria-pressed for accessibility / testing.
 */
export function VoiceSwitcher({
  value,
  onChange,
}: VoiceSwitcherProps): JSX.Element {
  return (
    <div className="voice-switcher" data-testid="voice-switcher">
      {GROUPS.map((group) => {
        const voices = VOICES.filter((v) => v.gender === group.gender);
        return (
          <div className="voice-group" key={group.gender}>
            <div className="voice-group-label">{group.label}</div>
            <div className="voice-group-options">
              {voices.map((voice) => {
                const active = voice.name === value;
                return (
                  <button
                    key={voice.name}
                    type="button"
                    className={`voice-option${active ? ' is-active' : ''}`}
                    data-testid="voice-option"
                    data-voice={voice.name}
                    data-active={active ? 'true' : 'false'}
                    aria-pressed={active}
                    title={voice.stylePrompt}
                    onClick={() => onChange(voice.name)}
                  >
                    <span className="voice-option-name">{voice.name}</span>
                    <span className="voice-option-label">{voice.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default VoiceSwitcher;
