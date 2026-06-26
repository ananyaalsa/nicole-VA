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
  'set_volume',
  'adjust_volume',
  'set_mute',
  'get_weather',
  'end_session',
  'set_about',
  'set_goal',
  'set_display_name',
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
    name: 'set_volume',
    description:
      'Set how loud YOUR voice plays, on a 0-100 scale (like "set your volume to ' +
      '70"). 0 is silent, 100 is loudest. Use when the user names a level: "turn ' +
      'your volume to 50", "set volume to 80", "volume 20". After changing it, ' +
      'briefly confirm the new level, e.g. "Okay, volume at 70."',
    parameters: {
      type: 'object',
      properties: {
        level: { type: 'number', description: 'Target volume, 0 (silent) to 100 (loudest).' },
      },
      required: ['level'],
    },
  },
  {
    name: 'adjust_volume',
    description:
      'Make your voice louder or quieter by a step, when the user does NOT name a ' +
      'number: "louder", "turn it up", "quieter", "turn it down a bit". Confirm ' +
      'the result briefly, e.g. "Turning it up, now at 80." If already at the max ' +
      'or min, say so ("that\'s as loud as I go").',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down'], description: 'Louder or quieter.' },
        amount: { type: 'number', description: 'Optional step size on the 0-100 scale (default 10).' },
      },
      required: ['direction'],
    },
  },
  {
    name: 'set_mute',
    description:
      'Mute or unmute your output volume entirely (gain to zero), remembering the ' +
      'previous level so unmuting restores it. Use for "mute", "silence", ' +
      '"unmute", "sound back on". This is the volume mute; mute_ai is the ' +
      '"stop talking" toggle.',
    parameters: {
      type: 'object',
      properties: {
        muted: { type: 'boolean', description: 'true to mute (volume 0), false to unmute.' },
      },
      required: ['muted'],
    },
  },
  {
    name: 'get_weather',
    description:
      'Show the weather in a dialog and tell the user. Use when they ask about ' +
      'weather ("what\'s the weather?", "is it going to rain?", "weather in Tokyo?"). ' +
      'Omit location for the user\'s current area (their device location is used); ' +
      'pass location for a named place. The app fetches it, opens a weather card, ' +
      'and gives you the reading to speak; report it warmly in a sentence.',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'Optional place name, e.g. "Tokyo". Omit for the user\'s current location.' },
      },
      required: [],
    },
  },
  {
    name: 'end_session',
    description:
      'End the current voice session entirely. Use when the user says "end the ' +
      'session", "hang up", "I\'m done", or "stop".',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'set_about',
    description:
      "Update the user's profile 'About you' — a short description of who they " +
      'are (role, industry, communication style) that you use every session. ' +
      'Use when they say "update my about to…", "set my profile to…", "I\'m a…".',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The new About-you text.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'set_goal',
    description:
      "Add or remove one of the user's goals. Use when they say \"add cold " +
      'calling to my goals", "remove interview prep", "I want to work on closing". ' +
      'Adding merges with their existing goals; removing drops just that one.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'remove'], description: 'Whether to add or remove the goal.' },
        goal: { type: 'string', description: 'The goal text, e.g. "Cold calling".' },
      },
      required: ['action', 'goal'],
    },
  },
  {
    name: 'set_display_name',
    description:
      "Change the user's display name (what you call them and what shows on " +
      'their profile). Use when they say "change my name to…", "call me…".',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The new display name.' },
      },
      required: ['name'],
    },
  },
];

/** Training-only: Nicole silently marks a framework move hit/missed during
 *  guided practice. Acked server-side; the BROWSER lights the live scorecard. */
export const TRAINING_TOOL_DECLS: ToolDecl[] = [
  {
    name: 'training_mark_progress',
    description:
      'SILENTLY record how the learner did on a framework move during guided ' +
      'practice. Call it once per attempt. Never say out loud that you are scoring.',
    parameters: {
      type: 'object',
      properties: {
        dimension: { type: 'string', description: 'The framework move being attempted, e.g. "Acknowledge".' },
        hit: { type: 'boolean', description: 'true if they performed the move well.' },
        tip: { type: 'string', description: 'A short, specific tip for this attempt.' },
      },
      required: ['dimension', 'hit', 'tip'],
    },
  },
];
