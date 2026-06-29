/**
 * Catalog of Gemini Live voices available for Nicole, with human-friendly
 * labels and short emotional-delivery style prompts.
 *
 * The `stylePrompt` is a brief instruction passed to the model so each voice
 * has a distinct emotional delivery, not just a different timbre.
 */
export interface Voice {
  /** Gemini voice name (sent to the backend as voiceName). */
  name: string;
  /** Short human label / vibe descriptor shown in the UI. */
  label: string;
  /** Voice gender, used to group the selector. */
  gender: 'female' | 'male';
  /** Short emotional-delivery instruction for the model. */
  stylePrompt: string;
}

export const VOICES: Voice[] = [
  // --- Female -------------------------------------------------------------
  {
    name: 'Aoede',
    label: 'warm',
    gender: 'female',
    stylePrompt:
      "Warm, friendly, and expressive, like a close friend who's genuinely happy to talk.",
  },
  {
    name: 'Kore',
    label: 'clear',
    gender: 'female',
    stylePrompt:
      'Calm, clear, and articulate. Confident and reassuring, never rushed.',
  },
  {
    name: 'Leda',
    label: 'bright',
    gender: 'female',
    stylePrompt:
      'Bright and upbeat, with a light, encouraging smile you can hear in every word.',
  },
  {
    name: 'Zephyr',
    label: 'smooth',
    gender: 'female',
    stylePrompt:
      'Smooth, gentle, and easygoing. A relaxed tone that feels effortless.',
  },
  // --- Male ---------------------------------------------------------------
  {
    name: 'Charon',
    label: 'deep',
    gender: 'male',
    stylePrompt:
      'Deep, steady, and grounded. Calm authority that puts people at ease.',
  },
  {
    name: 'Fenrir',
    label: 'strong',
    gender: 'male',
    stylePrompt:
      'Strong and decisive. Bold, motivating, and full of forward drive.',
  },
  {
    name: 'Orus',
    label: 'firm',
    gender: 'male',
    stylePrompt:
      'Firm and measured. Direct and dependable, leaving no room for doubt.',
  },
  {
    name: 'Puck',
    label: 'playful',
    gender: 'male',
    stylePrompt:
      'Playful, witty, and lighthearted. A spark of fun that keeps things lively.',
  },
];

/** Default voice used when none is selected. */
export const DEFAULT_VOICE = 'Aoede';
