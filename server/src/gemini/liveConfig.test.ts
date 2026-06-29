import { describe, it, expect } from 'vitest';
import { REALTIME_INPUT_CONFIG, buildLiveConfig } from './liveConfig.js';

describe('REALTIME_INPUT_CONFIG', () => {
  it('uses sensitive onset VAD that does not clip the first word', () => {
    expect(REALTIME_INPUT_CONFIG).toEqual({
      automaticActivityDetection: {
        startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
        endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
        // Onset pad keeps audio before the detected speech-start so the first
        // word/letter isn't clipped. 500ms reliably captures a quick opener.
        prefixPaddingMs: 500,
        // Patient (1000ms) so a slow-spoken utterance with pauses stays one turn.
        silenceDurationMs: 1000,
      },
    });
  });
});

describe('buildLiveConfig', () => {
  const base = { systemPrompt: 'You are Nicole.', voiceName: 'Aoede' };

  it('threads voiceName into speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName', () => {
    const cfg = buildLiveConfig(base) as any;
    expect(cfg.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(
      'Aoede',
    );
  });

  it('responds with AUDIO modality', () => {
    const cfg = buildLiveConfig(base) as any;
    expect(cfg.responseModalities).toEqual(['AUDIO']);
  });

  it('sets systemInstruction from the system prompt', () => {
    const cfg = buildLiveConfig(base) as any;
    expect(cfg.systemInstruction).toBe('You are Nicole.');
  });

  it('includes the REALTIME_INPUT_CONFIG for VAD', () => {
    const cfg = buildLiveConfig(base) as any;
    expect(cfg.realtimeInputConfig).toBe(REALTIME_INPUT_CONFIG);
  });

  it('requests session resumption handles', () => {
    const cfg = buildLiveConfig(base) as any;
    expect(cfg.sessionResumption).toEqual({});
  });

  it('enables sliding-window context compression (unlimited session duration)', () => {
    const cfg = buildLiveConfig(base) as any;
    expect(cfg.contextWindowCompression).toEqual({ slidingWindow: {} });
  });

  it('requests both input and output audio transcription', () => {
    const cfg = buildLiveConfig(base) as any;
    expect(cfg.inputAudioTranscription).toEqual({});
    expect(cfg.outputAudioTranscription).toEqual({});
  });

  it('defaults tools to an empty array when not provided', () => {
    const cfg = buildLiveConfig(base) as any;
    expect(cfg.tools).toEqual([]);
  });

  it('threads provided tools through', () => {
    const tools = [{ functionDeclarations: [] }];
    const cfg = buildLiveConfig({ ...base, tools }) as any;
    expect(cfg.tools).toEqual(tools);
  });

  it('does NOT embed the model id in the config', () => {
    const cfg = buildLiveConfig(base) as any;
    expect(cfg.model).toBeUndefined();
  });

  it('enables Google Search grounding when searchEnabled is true', () => {
    const cfg = buildLiveConfig({ ...base, searchEnabled: true }) as any;
    expect(cfg.tools).toContainEqual({ googleSearch: {} });
  });

  it('keeps Google Search alongside provided function declarations', () => {
    const tools = [{ functionDeclarations: [{ name: 'save_memory' }] }];
    const cfg = buildLiveConfig({ ...base, tools, searchEnabled: true }) as any;
    expect(cfg.tools).toContainEqual({ googleSearch: {} });
    expect(cfg.tools).toContainEqual({ functionDeclarations: [{ name: 'save_memory' }] });
  });

  it('does NOT add Google Search when searchEnabled is false/absent', () => {
    const cfg = buildLiveConfig(base) as any;
    expect(cfg.tools).not.toContainEqual({ googleSearch: {} });
  });
});
