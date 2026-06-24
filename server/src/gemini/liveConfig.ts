// Gemini Live session `config` builder.
//
// The model id is intentionally NOT part of this config — it is passed
// separately to `ai.live.connect({ model, config })`. This object only
// describes how the live session behaves (modality, voice, VAD, transcripts,
// resumption).

/**
 * Conservative voice-activity-detection so ONE spoken utterance maps to ONE
 * model turn. Copied VERBATIM from the CHAT frontend's liveSessionConfig.ts.
 * The enum values are plain strings on the wire, so we inline the literals
 * instead of importing the @google/genai enums.
 */
export const REALTIME_INPUT_CONFIG = {
  automaticActivityDetection: {
    startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
    endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
    prefixPaddingMs: 600,
    silenceDurationMs: 700,
  },
} as const;

/** Options for building a Gemini Live session config. */
export interface BuildLiveConfigOpts {
  /** Full system prompt / instruction for Nicole. */
  systemPrompt: string;
  /** Prebuilt Gemini voice name (e.g. 'Aoede', 'Charon'). */
  voiceName: string;
  /** Optional tool/function declarations exposed to the model. */
  tools?: unknown[];
}

/**
 * Build the `config` object passed to `ai.live.connect({ model, config })`.
 * The model id is supplied separately, never embedded here.
 */
export function buildLiveConfig(
  opts: BuildLiveConfigOpts,
): Record<string, unknown> {
  return {
    responseModalities: ['AUDIO'],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: opts.voiceName },
      },
    },
    systemInstruction: opts.systemPrompt,
    realtimeInputConfig: REALTIME_INPUT_CONFIG,
    tools: opts.tools ?? [],
    // Empty object requests session-resumption handles from the server.
    sessionResumption: {},
    // Empty objects request both-side audio transcripts.
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}
