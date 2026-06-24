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
    // 800ms: a touch more patient than CHAT's 700ms so a brief mid-thought
    // pause doesn't make her jump in — but NOT so long she feels unresponsive.
    // (1100ms was too long: combined with the mic DSP it made her seem deaf to
    // normal speech.) The client's sustained-frame barge-in gate handles blips.
    silenceDurationMs: 800,
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
  /**
   * When true, enable Gemini's built-in Google Search grounding so Nicole can
   * answer real-time questions (news, weather, flights, prices, latest facts).
   * Added as its own tool entry alongside any function declarations.
   */
  searchEnabled?: boolean;
}

/**
 * Build the `config` object passed to `ai.live.connect({ model, config })`.
 * The model id is supplied separately, never embedded here.
 */
export function buildLiveConfig(
  opts: BuildLiveConfigOpts,
): Record<string, unknown> {
  // Google Search grounding is its own tool entry; it coexists with the memory
  // function declarations. Search goes first so it's the model's default reach.
  const tools: unknown[] = [];
  if (opts.searchEnabled) tools.push({ googleSearch: {} });
  if (opts.tools) tools.push(...opts.tools);

  return {
    responseModalities: ['AUDIO'],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: opts.voiceName },
      },
    },
    systemInstruction: opts.systemPrompt,
    realtimeInputConfig: REALTIME_INPUT_CONFIG,
    tools,
    // Empty object requests session-resumption handles from the server.
    sessionResumption: {},
    // Empty objects request both-side audio transcripts.
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}
