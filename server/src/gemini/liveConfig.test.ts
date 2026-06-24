import { describe, it, expect } from 'vitest';
import { REALTIME_INPUT_CONFIG, buildLiveConfig } from './liveConfig.js';

describe('REALTIME_INPUT_CONFIG', () => {
  it('matches the CHAT VAD values exactly', () => {
    expect(REALTIME_INPUT_CONFIG).toEqual({
      automaticActivityDetection: {
        startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
        endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
        prefixPaddingMs: 600,
        silenceDurationMs: 700,
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
    expect(cfg.tools).toBe(tools);
  });

  it('does NOT embed the model id in the config', () => {
    const cfg = buildLiveConfig(base) as any;
    expect(cfg.model).toBeUndefined();
  });
});
