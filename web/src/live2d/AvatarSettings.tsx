import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import {
  AVATARS, avatarDefaults, type AvatarId, type AvatarPrefs,
} from './avatars';
import { Live2DStage } from './Live2DStage';
import './AvatarSettings.css';

/** A small set of on-theme preset colors users can tap. */
const PRESETS = ['#0F766E', '#0B2E2C', '#0B3D38', '#14B8A6', '#D97706', '#E7E2D6', '#1F2937', '#7C2D5B'];

export interface AvatarSettingsProps {
  prefs: AvatarPrefs;
  onChange: (prefs: AvatarPrefs) => void;
}

/**
 * "Choose an avatar for Nicole" — pick which avatar shows in the corner and
 * recolor each of her elements with color pickers. Edits update a DRAFT (live
 * preview reflects it instantly); only SAVE applies it to the rest of the app
 * (persist + broadcast). Defaults are the teal theme; Reset restores them.
 */
export function AvatarSettings({ prefs, onChange }: AvatarSettingsProps): JSX.Element {
  // DRAFT: edits live here so the preview updates instantly without touching the
  // app. `onChange` (persist + broadcast to the corner companion) fires on Save.
  const [draft, setDraft] = useState<AvatarPrefs>(prefs);
  // If the incoming prefs change externally (rare), resync the draft.
  useEffect(() => { setDraft(prefs); }, [prefs]);

  const editing: 'aria' | 'noah' = draft.avatar === 'noah' ? 'noah' : 'aria';
  const def = AVATARS[editing];

  // Static refs for the preview (no live voice here).
  const ampRef = useRef(0);
  const spkRef = useRef(false);

  const colors = draft.colors[editing] ?? avatarDefaults(editing);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(prefs), [draft, prefs]);

  const setAvatar = (avatar: AvatarId) => setDraft({ ...draft, avatar });
  const setColor = (element: string, hex: string) => {
    setDraft({
      ...draft,
      colors: { ...draft.colors, [editing]: { ...colors, [element]: hex } },
    });
  };
  const resetColors = () => {
    setDraft({
      ...draft,
      colors: { ...draft.colors, [editing]: avatarDefaults(editing) },
    });
  };
  const save = () => onChange(draft); // persist + apply to the live app

  return (
    <div className="avset">
      <p className="avset__lede">
        Choose an avatar for Nicole. You can change her outfit and hair colors,
        or reset to the defaults.
      </p>

      {/* Avatar choice (reflects the DRAFT) */}
      <div className="avset__choices" role="radiogroup" aria-label="Avatar">
        {(['aria', 'noah'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={draft.avatar === id ? 'true' : 'false'}
            className={`avset__choice${draft.avatar === id ? ' is-on' : ''}`}
            onClick={() => setAvatar(id)}
          >
            <span className="avset__choice-name">{AVATARS[id].label}</span>
            <span className="avset__choice-sub">{id === 'aria' ? 'Long hair' : 'Twin-tails'}</span>
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={draft.avatar === 'off' ? 'true' : 'false'}
          className={`avset__choice${draft.avatar === 'off' ? ' is-on' : ''}`}
          onClick={() => setAvatar('off')}
        >
          <span className="avset__choice-name">Off</span>
          <span className="avset__choice-sub">No avatar</span>
        </button>
      </div>

      <div className="avset__body">
        {/* Live preview */}
        <div className="avset__preview">
          <Live2DStage
            key={editing}
            amplitudeRef={ampRef}
            speakingRef={spkRef}
            avatarId={editing}
            colors={colors}
            className="avset__preview-canvas"
          />
          <span className="avset__preview-tag">{def.label} preview</span>
        </div>

        {/* Wardrobe color pickers */}
        <div className="avset__wardrobe">
          <div className="avset__wardrobe-head">
            <span>Wardrobe</span>
            <button type="button" className="avset__reset" onClick={resetColors}>Reset to default</button>
          </div>
          {def.elements.map((el) => (
            <div key={el.id} className="avset__row">
              <span className="avset__row-label">{el.label}</span>
              <div className="avset__row-controls">
                {/* Presets */}
                <div className="avset__presets">
                  {PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`avset__swatch${(colors[el.id] || '').toLowerCase() === p.toLowerCase() ? ' is-on' : ''}`}
                      style={{ background: p }}
                      aria-label={`Set ${el.label} to ${p}`}
                      onClick={() => setColor(el.id, p)}
                    />
                  ))}
                </div>
                {/* Exact RGB/hex picker */}
                <input
                  type="color"
                  className="avset__color"
                  value={colors[el.id] || el.default}
                  onChange={(e) => setColor(el.id, e.target.value)}
                  aria-label={`${el.label} color`}
                />
              </div>
            </div>
          ))}
          <p className="avset__hint">Tap a swatch or use the picker for any color.</p>
        </div>
      </div>

      {/* Save footer — applies the draft to the live app (corner companion). */}
      <div className="avset__footer">
        {dirty && <span className="avset__footer-note">Unsaved changes</span>}
        <button
          type="button"
          className="avset__save"
          disabled={!dirty}
          onClick={save}
        >
          {dirty ? 'Save & apply' : 'Saved'}
        </button>
      </div>
    </div>
  );
}

export default AvatarSettings;
