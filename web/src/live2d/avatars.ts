import type { RecolorProfile, ElementId } from './recolor';

/** The selectable corner companions. 'off' hides the avatar entirely.
 *  'natori' is the MALE PROSPECT avatar (roleplay / training live-rep), chosen by
 *  the app for the prospect role — not a user-selectable companion. */
export type AvatarId = 'aria' | 'noah' | 'natori' | 'chitose' | 'off';
type RealAvatarId = Exclude<AvatarId, 'off'>;
/** Avatars the user can pick as their own companion (excludes prospect-only natori). */
export type CompanionAvatarId = 'aria' | 'noah';

export interface ElementDef {
  id: ElementId;
  label: string;
  /** Default color (the teal theme). */
  default: string;
}

export interface AvatarDef {
  id: RealAvatarId;
  label: string;
  model: string;
  /** Recolor profile for the wardrobe. Omitted for avatars with no recoloring
   *  (e.g. the natori prospect), where the wardrobe step no-ops. */
  profile?: RecolorProfile;
  mouthParam: string;
  /** Eye-open parameter IDs for the blink animation. Cubism models differ:
   *  older exports use PARAM_EYE_L_OPEN / _R_OPEN, newer ones ParamEyeLOpen /
   *  ParamEyeROpen. Defaults to the old naming when omitted. */
  eyeParams?: { left: string; right: string };
  /** Substrings of part IDs to FORCE-HIDE (opacity 0) every frame. Noah ships
   *  with two overlapping arm poses (set A + set B) both visible → "four hands";
   *  hiding one set leaves a single natural arms-down pose. */
  hideParts?: string[];
  /** Colorable elements shown in the wardrobe, in display order. */
  elements: ElementDef[];
  /** Texture files (relative to model dir) + which elements each can contain.
   *  `original` is the pre-baked PNG (clean base for recoloring). */
  textures: { file: string; original: string; elements: ElementId[] }[];
}

// Theme defaults
const HAIR = '#0B2E2C';    // near-black dark teal
const TEAL = '#0F766E';    // app accent teal
const TEAL_DK = '#0B3D38'; // deeper teal (collar/accents)
const CREAM = '#E7E2D6';   // warm paper (light fabric)
const SLATE = '#1F2937';   // dark slate (tights)

export const AVATARS: Record<RealAvatarId, AvatarDef> = {
  // Long straight hair (source model: Izumi). Waist-up.
  aria: {
    id: 'aria',
    label: 'Aria',
    model: '/live2d/izumi/izumi_illust.model3.json',
    profile: 'izumi',
    mouthParam: 'PARAM_MOUTH_OPEN_Y',
    elements: [
      { id: 'hair', label: 'Hair', default: HAIR },
      { id: 'top', label: 'Top', default: TEAL },
      { id: 'collar', label: 'Collar', default: TEAL_DK },
    ],
    textures: [
      { file: 'izumi_illust.1024/texture_00.png', original: 'izumi_illust.1024/texture_00.original.png', elements: [] },
      { file: 'izumi_illust.1024/texture_01.png', original: 'izumi_illust.1024/texture_01.original.png', elements: ['hair'] },
      { file: 'izumi_illust.1024/texture_02.png', original: 'izumi_illust.1024/texture_02.original.png', elements: ['hair'] },
      { file: 'izumi_illust.1024/texture_03.png', original: 'izumi_illust.1024/texture_03.original.png', elements: ['top', 'collar'] },
    ],
  },
  // Twin-tails, fuller body w/ dress + tights (source model: Haru).
  noah: {
    id: 'noah',
    label: 'Noah',
    model: '/live2d/haru/haru.model3.json',
    profile: 'haru',
    mouthParam: 'PARAM_MOUTH_OPEN_Y',
    // Hide the crossed-arms "A" set so only the natural arms-down pose shows
    // (fixes the "four hands" — both arm sets were rendering).
    hideParts: ['ARM_R_A', 'ARM_L_A'],
    elements: [
      { id: 'hair', label: 'Hair', default: HAIR },
      { id: 'sleeves', label: 'Top & sleeves', default: TEAL },
      { id: 'skirt', label: 'Dress', default: CREAM },
      { id: 'tights', label: 'Tights', default: SLATE },
    ],
    textures: [
      { file: 'haru.1024/texture_00.png', original: 'haru.1024/texture_00.original.png', elements: [] },
      { file: 'haru.1024/texture_01.png', original: 'haru.1024/texture_01.original.png', elements: ['hair'] },
      { file: 'haru.1024/texture_02.png', original: 'haru.1024/texture_02.original.png', elements: ['sleeves', 'skirt', 'tights'] },
    ],
  },
  // PROSPECT (roleplay / training live-rep). Cubism sample "Jin Natori".
  // No wardrobe recoloring — the other party on the call, not a companion.
  // Newer Cubism param naming (ParamMouthOpenY / ParamEye*Open).
  natori: {
    id: 'natori',
    label: 'Prospect',
    model: '/live2d/natori/natori_pro_t06.model3.json',
    mouthParam: 'ParamMouthOpenY',
    eyeParams: { left: 'ParamEyeLOpen', right: 'ParamEyeROpen' },
    elements: [],
    textures: [],
  },
  // PROSPECT (current). Cubism sample "Chitose". Old-style param naming
  // (PARAM_MOUTH_OPEN_Y / PARAM_EYE_*_OPEN), so it uses the Live2DStage defaults.
  chitose: {
    id: 'chitose',
    label: 'Prospect',
    model: '/live2d/chitose/chitose.model3.json',
    mouthParam: 'PARAM_MOUTH_OPEN_Y',
    elements: [],
    textures: [],
  },
};

/** Default color map for an avatar (elementId → hex). */
export function avatarDefaults(id: RealAvatarId): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of AVATARS[id].elements) out[e.id] = e.default;
  return out;
}

export interface AvatarPrefs {
  avatar: AvatarId;
  /** Per-avatar element colors: { aria: { hair, top, collar }, noah: {...} }. */
  colors: Record<string, Record<string, string>>;
}

const PREFS_KEY = 'nicole_avatar_prefs';

export function defaultPrefs(): AvatarPrefs {
  return {
    avatar: 'aria',
    colors: { aria: avatarDefaults('aria'), noah: avatarDefaults('noah') },
  };
}

export function loadAvatarPrefs(): AvatarPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const d = defaultPrefs();
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<AvatarPrefs>;
    return {
      avatar: p.avatar ?? d.avatar,
      colors: {
        aria: { ...d.colors.aria, ...(p.colors?.aria ?? {}) },
        noah: { ...d.colors.noah, ...(p.colors?.noah ?? {}) },
      },
    };
  } catch {
    return defaultPrefs();
  }
}

export function saveAvatarPrefs(p: AvatarPrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
