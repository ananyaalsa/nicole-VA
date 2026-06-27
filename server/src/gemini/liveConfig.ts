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
    // 1000ms: tolerate natural pauses BETWEEN WORDS so one slow-spoken utterance
    // stays ONE turn (not many short turns → fragmented bubbles + reply-spam).
    // The mic input boost ensures the speech itself reaches the VAD, so this
    // longer window doesn't make her seem deaf. The client's sustained-frame
    // barge-in gate still lets the user interrupt her quickly.
    silenceDurationMs: 1000,
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
    // Lower temperature reins in random embellishment + reduces hallucination,
    // reinforcing the "be concise, don't make things up" prompt rules. (Not a
    // brevity cap — maxOutputTokens would clip audio mid-sentence; brevity comes
    // from the system prompt.)
    generationConfig: { temperature: 0.3 },
    systemInstruction: opts.systemPrompt,
    realtimeInputConfig: REALTIME_INPUT_CONFIG,
    tools,
    // Empty object requests session-resumption handles from the server.
    sessionResumption: {},
    // Lift the hard session-duration cap (15 min audio) to effectively unlimited:
    // a sliding window discards the oldest turns instead of ending the session, so
    // Nicole never hits a wall and goes down. Combined with session resumption +
    // proactive reconnect, the assistant stays continuously available. Anything
    // that must never be forgotten lives in the system prompt / memory, not the
    // live window, so pruning old turns is safe.
    contextWindowCompression: { slidingWindow: {} },
    // Empty objects request both-side audio transcripts.
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}
