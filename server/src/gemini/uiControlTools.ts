// Gemini function declarations that let Nicole OPERATE THE UI by voice.
//
// These are pure declarations. When Nicole calls one, the relay relays the
// tool-call to the browser (verbatim, like every Gemini message) AND acks Gemini
// so the turn completes. The BROWSER actually performs the action (open camera,
// switch screen, change voice, mute, …) via its UiCommandBus — the server has no
// UI to operate. Adding a new control is one declaration here + one handler
// registration on the frontend.

interface ToolParams {
  type: 'object';
  properties: Record<string, { type: string; description?: string; enum?: string[] }>;
  required: string[];
}
interface ToolDecl {
  name: string;
  description: string;
  parameters: ToolParams;
}

/** The voice names Nicole can switch to (must match the frontend VOICES list). */
export const UI_VOICES = [
  'Aoede',
  'Kore',
  'Leda',
  'Zephyr',
  'Charon',
  'Fenrir',
  'Orus',
  'Puck',
] as const;

/** The tool names the browser knows how to execute (for relay routing). */
export const UI_CONTROL_TOOL_NAMES = new Set([
  'set_camera',
  'switch_mode',
  'set_voice',
  'mute_ai',
  'mute_mic',
  'end_session',
]);

export const UI_CONTROL_TOOL_DECLS: ToolDecl[] = [
  {
    name: 'set_camera',
    description:
      "Turn the user's camera on or off so you can see (or stop seeing) through " +
      'it. Call this when the user asks you to open/close/show/hide the camera ' +
      '("open my camera", "turn the camera off", "let me show you something").',
    parameters: {
      type: 'object',
      properties: {
        on: { type: 'boolean', description: 'true to open the camera, false to close it.' },
      },
      required: ['on'],
    },
  },
  {
    name: 'switch_mode',
    description:
      'Switch which screen is showing. Use when the user asks to open Training, ' +
      'open Roleplay, or go back to normal talking. "talk" = the main voice ' +
      'console, "training" = the coaching/drill room, "roleplay" = live roleplay.',
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['talk', 'training', 'roleplay'], description: 'The screen to open.' },
      },
      required: ['mode'],
    },
  },
  {
    name: 'set_voice',
    description:
      'Change the voice you speak in. Use when the user asks you to switch your ' +
      'voice (e.g. "switch to Leda", "use Fenrir", "talk in a deeper voice" -> ' +
      'pick a fitting male voice like Charon). Female: Aoede, Kore, Leda, Zephyr. ' +
      'Male: Charon, Fenrir, Orus, Puck.',
    parameters: {
      type: 'object',
      properties: {
        voiceName: { type: 'string', enum: [...UI_VOICES], description: 'The voice to switch to.' },
      },
      required: ['voiceName'],
    },
  },
  {
    name: 'mute_ai',
    description:
      'Mute or unmute YOUR OWN voice output — when muted the user stops hearing ' +
      'you, but the session stays live. Use when the user says "mute yourself", ' +
      '"be quiet", "stop talking for a sec", or "you can talk again".',
    parameters: {
      type: 'object',
      properties: {
        muted: { type: 'boolean', description: 'true to mute your voice, false to unmute.' },
      },
      required: ['muted'],
    },
  },
  {
    name: 'mute_mic',
    description:
      "Mute or unmute the user's microphone — when muted you can't hear them. " +
      'Use when the user says "mute my mic", "mute me", or "unmute me".',
    parameters: {
      type: 'object',
      properties: {
        muted: { type: 'boolean', description: "true to mute the user's mic, false to unmute." },
      },
      required: ['muted'],
    },
  },
  {
    name: 'end_session',
    description:
      'End the current voice session entirely. Use when the user says "end the ' +
      'session", "hang up", "I\'m done", or "stop".',
    parameters: { type: 'object', properties: {}, required: [] },
  },
];
