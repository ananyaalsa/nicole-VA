import { useCallback, useEffect, useRef, useState } from 'react';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  floatTo16BitPCM,
  int16ToFloat32,
} from '../audio/pcm';
import { PlaybackQueue } from '../audio/playbackQueue';
import type { Speaker, TranscriptLine } from './types';

export type { TranscriptLine, Speaker } from './types';

/** Conversation mode forwarded to the backend. */
export type SessionMode = 'talk' | 'coach' | 'prospect';

export interface UseNicoleSessionOptions {
  /** Gemini voice name (e.g. 'Aoede'). */
  voiceName: string;
  /** Conversation mode. Defaults to 'talk'. */
  mode?: SessionMode;
  /** WebSocket relay URL. Defaults to import.meta.env.VITE_SERVER_WS. */
  serverWs?: string;
  /** Optional extra system overlay forwarded in the connect config. */
  systemOverlay?: string;
  /** Optional per-voice style prompt forwarded in the connect config. */
  stylePrompt?: string;
}

export interface UseNicoleSessionResult {
  connected: boolean;
  micOn: boolean;
  transcript: TranscriptLine[];
  amplitude: number;
  start: () => Promise<void>;
  stop: () => void;
  toggleMic: () => void;
  setVoice: (v: string) => void;
}

// --- Tuning constants ------------------------------------------------------

/** Output (Nicole) audio is decoded at 24kHz int16 PCM. */
const OUTPUT_SAMPLE_RATE = 24000;
/** Target mic capture rate sent to the backend. */
const INPUT_SAMPLE_RATE = 16000;
/** ScriptProcessor buffer size (power of two). */
const PROCESSOR_BUFFER_SIZE = 4096;
/** Cap on transcript history to keep memory bounded. */
const MAX_TRANSCRIPT_LINES = 400;

// --- Barge-in / noise gating ----------------------------------------------
// Goal: she should hear you at a NORMAL speaking volume, while a cough or a
// one-second blip still doesn't cut her off. The barge-in gate below ONLY
// governs interrupting her mid-speech — it must NOT be so high that normal
// speech fails to register. Kept low + a short sustain so interrupting is easy.

/** RMS floor below which audio is ignored for barge-in. Low so a normal voice interrupts. */
const BARGE_IN_RMS_THRESHOLD = 0.045;
/**
 * Consecutive over-threshold frames before we treat it as a real interruption.
 * One frame (4096 samples @16kHz) ≈ 256ms, so 2 frames ≈ ~500ms — enough to
 * shrug off a single-frame blip/cough, short enough that normal speech
 * interrupts her almost immediately.
 */
const BARGE_IN_SUSTAIN_FRAMES = 2;
/**
 * Mic constraints. We keep ECHO CANCELLATION on (stops Nicole's own voice from
 * feeding back into the mic — essential for a speaker setup), but leave
 * NOISE SUPPRESSION and AUTO-GAIN OFF: both were swallowing a normal-volume
 * voice (AGC dropped the gain in a quiet room; suppression clipped soft speech),
 * forcing the user to shout. Off = your voice comes through at its true level.
 */
const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  },
};

let lineCounter = 0;
function nextLineId(): string {
  lineCounter += 1;
  return `l${Date.now().toString(36)}_${lineCounter}`;
}

function resolveDefaultWs(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  return env?.VITE_SERVER_WS ?? 'ws://localhost:4000/ai-live';
}

interface GeminiPart {
  inlineData?: { mimeType?: string; data?: string };
  text?: string;
}

interface GeminiServerContent {
  modelTurn?: { parts?: GeminiPart[] };
  inputTranscription?: { text?: string };
  outputTranscription?: { text?: string };
  turnComplete?: boolean;
}

interface GeminiServerMessage {
  serverContent?: GeminiServerContent;
}

interface RelayMessage {
  type: string;
  payload?: GeminiServerMessage;
  message?: string;
  code?: number;
  reason?: string;
}

/**
 * Live-voice session hook for Nicole.
 *
 * Owns: a WebSocket to the relay, a mic capture AudioContext (16kHz input),
 * a 24kHz playback AudioContext, a bounded PlaybackQueue, an AnalyserNode for
 * lip-sync amplitude, and the conversation transcript.
 *
 * Leak-safety is the central concern: `stop()` (and unmount) tears down the
 * socket, mic tracks, both AudioContexts, all nodes, the playback timer and
 * the queue, with no dangling timers/intervals/rAF.
 */
export function useNicoleSession(
  opts: UseNicoleSessionOptions,
): UseNicoleSessionResult {
  const {
    voiceName,
    mode = 'talk',
    serverWs,
    systemOverlay,
    stylePrompt,
  } = opts;

  const [connected, setConnected] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [amplitude, setAmplitude] = useState(0);

  // --- Mutable refs (never trigger re-render) ------------------------------
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const queueRef = useRef(new PlaybackQueue<Float32Array>(80));
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const playHeadRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const wantMicRef = useRef(true);
  // Count of consecutive over-threshold mic frames, for sustained barge-in.
  const sustainedSpeechRef = useRef(0);
  const voiceRef = useRef(voiceName);

  // In-flight (streaming) transcript lines, keyed by speaker.
  const openLineRef = useRef<Record<Speaker, string | null>>({
    you: null,
    nicole: null,
  });

  // Keep the latest opts in a ref so the WS open handler always reads fresh
  // config without re-subscribing.
  const connectCfgRef = useRef({ voiceName, mode, systemOverlay, stylePrompt });
  connectCfgRef.current = { voiceName, mode, systemOverlay, stylePrompt };
  voiceRef.current = voiceName;

  // ------------------------------------------------------------------------
  // Transcript helpers
  // ------------------------------------------------------------------------
  const appendPartial = useCallback((speaker: Speaker, chunk: string) => {
    if (!chunk) return;
    setTranscript((prev) => {
      let openId = openLineRef.current[speaker];
      const next = prev.slice();
      if (openId) {
        const idx = next.findIndex((l) => l.id === openId);
        if (idx >= 0) {
          next[idx] = { ...next[idx], text: next[idx].text + chunk };
          return capLines(next);
        }
        // open id stale — fall through to create a new one
      }
      openId = nextLineId();
      openLineRef.current[speaker] = openId;
      next.push({ id: openId, speaker, text: chunk });
      return capLines(next);
    });
  }, []);

  const finalizeTurn = useCallback(() => {
    openLineRef.current.you = null;
    openLineRef.current.nicole = null;
  }, []);

  // ------------------------------------------------------------------------
  // Playback scheduling (24kHz, back-to-back buffers)
  // ------------------------------------------------------------------------
  const drainQueue = useCallback(() => {
    const ctx = playCtxRef.current;
    if (!ctx) return;
    let frames: Float32Array | undefined;
    // eslint-disable-next-line no-cond-assign
    while ((frames = queueRef.current.dequeue())) {
      const buffer = ctx.createBuffer(1, frames.length, OUTPUT_SAMPLE_RATE);
      buffer.getChannelData(0).set(frames);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const analyser = analyserRef.current;
      if (analyser) {
        src.connect(analyser);
        analyser.connect(ctx.destination);
      } else {
        src.connect(ctx.destination);
      }
      const startAt = Math.max(ctx.currentTime, playHeadRef.current);
      src.start(startAt);
      playHeadRef.current = startAt + buffer.length / OUTPUT_SAMPLE_RATE;
      activeSourcesRef.current.add(src);
      src.onended = () => {
        activeSourcesRef.current.delete(src);
        try {
          src.disconnect();
        } catch {
          /* already disconnected */
        }
      };
    }
  }, []);

  const stopPlayback = useCallback(() => {
    queueRef.current.flush();
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        /* may not have started */
      }
      try {
        src.disconnect();
      } catch {
        /* ignore */
      }
    }
    activeSourcesRef.current.clear();
    playHeadRef.current = 0;
  }, []);

  // ------------------------------------------------------------------------
  // Amplitude (lip-sync) loop
  // ------------------------------------------------------------------------
  const tickAmplitude = useCallback(() => {
    const analyser = analyserRef.current;
    if (analyser && typeof analyser.getByteTimeDomainData === 'function') {
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(buf);
      let sumSq = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / buf.length);
      // Boost a little; clamp 0..1.
      setAmplitude(Math.min(1, rms * 2.2));
    }
    rafRef.current = requestAnimationFrame(tickAmplitude);
  }, []);

  // ------------------------------------------------------------------------
  // Incoming relay message handler
  // ------------------------------------------------------------------------
  const handleRelayMessage = useCallback(
    (msg: RelayMessage) => {
      switch (msg.type) {
        case 'open':
        case 'ready':
          setConnected(true);
          return;
        case 'error':
          // Surface as a transient — keep the session alive; caller can stop.
          return;
        case 'gemini-close':
          setConnected(false);
          return;
        case 'message':
          break;
        default:
          return;
      }

      const sc = msg.payload?.serverContent;
      if (!sc) return;

      // Audio parts → decode → enqueue → schedule playback.
      const parts = sc.modelTurn?.parts ?? [];
      let enqueuedAudio = false;
      for (const part of parts) {
        const data = part.inlineData?.data;
        if (data) {
          const ab = base64ToArrayBuffer(data);
          const int16 = new Int16Array(ab);
          const float = int16ToFloat32(int16);
          queueRef.current.enqueue(float);
          enqueuedAudio = true;
        }
      }
      if (enqueuedAudio) drainQueue();

      // Transcripts.
      if (sc.inputTranscription?.text) {
        appendPartial('you', sc.inputTranscription.text);
      }
      if (sc.outputTranscription?.text) {
        appendPartial('nicole', sc.outputTranscription.text);
      }

      if (sc.turnComplete) {
        finalizeTurn();
      }
    },
    [appendPartial, drainQueue, finalizeTurn],
  );

  // ------------------------------------------------------------------------
  // Mic capture wiring
  // ------------------------------------------------------------------------
  const sendMicFrame = useCallback((float: Float32Array) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1 /* OPEN */) return;
    if (!wantMicRef.current) return;
    const int16 = floatTo16BitPCM(float);
    // .buffer is typed ArrayBufferLike under strict lib; slice() narrows to a
    // plain ArrayBuffer and yields exactly the bytes backing this view.
    const ab = int16.buffer.slice(
      int16.byteOffset,
      int16.byteOffset + int16.byteLength,
    ) as ArrayBuffer;
    const b64 = arrayBufferToBase64(ab);
    ws.send(
      JSON.stringify({
        type: 'client-msg',
        payload: {
          audio: {
            data: b64,
            mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
          },
        },
      }),
    );
  }, []);

  const wireMic = useCallback(
    (stream: MediaStream) => {
      const Ctor =
        (globalThis as unknown as { AudioContext?: typeof AudioContext })
          .AudioContext ??
        (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;

      let micCtx: AudioContext;
      try {
        micCtx = new Ctor({ sampleRate: INPUT_SAMPLE_RATE });
      } catch {
        micCtx = new Ctor();
      }
      micCtxRef.current = micCtx;

      const source = micCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      // ScriptProcessor is deprecated but adequate and synchronous for now.
      const processor = micCtx.createScriptProcessor
        ? micCtx.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1)
        : null;
      processorRef.current = processor;

      if (processor) {
        processor.onaudioprocess = (ev: AudioProcessingEvent) => {
          const input = ev.inputBuffer.getChannelData(0);
          // Copy out of the live buffer.
          const frame = new Float32Array(input.length);
          frame.set(input);

          // Barge-in gate: only a REAL, SUSTAINED utterance interrupts Nicole.
          // A single loud frame (a cough, a phone buzz, a door, a stray word
          // from someone nearby) is NOT enough — the energy must stay above the
          // noise floor for several consecutive frames before she yields. This
          // makes her a patient listener instead of flinching at every blip.
          let sumSq = 0;
          for (let i = 0; i < frame.length; i++) sumSq += frame[i] * frame[i];
          const rms = Math.sqrt(sumSq / frame.length);

          if (rms > BARGE_IN_RMS_THRESHOLD) {
            sustainedSpeechRef.current += 1;
          } else {
            // Reset on any quiet frame — momentary noise can't accumulate.
            sustainedSpeechRef.current = 0;
          }

          const nicoleIsSpeaking =
            queueRef.current.length > 0 || activeSourcesRef.current.size > 0;
          if (
            wantMicRef.current &&
            nicoleIsSpeaking &&
            sustainedSpeechRef.current >= BARGE_IN_SUSTAIN_FRAMES
          ) {
            stopPlayback();
            sustainedSpeechRef.current = 0;
          }

          sendMicFrame(frame);
        };
        source.connect(processor);
        // Connect to destination to keep the processor pulling in some browsers.
        processor.connect(micCtx.destination);
      }
    },
    [sendMicFrame, stopPlayback],
  );

  // ------------------------------------------------------------------------
  // Playback context + analyser
  // ------------------------------------------------------------------------
  const wirePlayback = useCallback(() => {
    const Ctor =
      (globalThis as unknown as { AudioContext?: typeof AudioContext })
        .AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;

    let playCtx: AudioContext;
    try {
      playCtx = new Ctor({ sampleRate: OUTPUT_SAMPLE_RATE });
    } catch {
      playCtx = new Ctor();
    }
    playCtxRef.current = playCtx;
    playHeadRef.current = playCtx.currentTime;

    if (playCtx.createAnalyser) {
      const analyser = playCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
    }

    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(tickAmplitude);
    }
  }, [tickAmplitude]);

  // ------------------------------------------------------------------------
  // WebSocket open / connect
  // ------------------------------------------------------------------------
  const openSocket = useCallback(
    (url: string) => {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        const cfg = connectCfgRef.current;
        ws.send(
          JSON.stringify({
            type: 'connect',
            config: {
              voiceName: cfg.voiceName,
              mode: cfg.mode,
              ...(cfg.systemOverlay
                ? { systemOverlay: cfg.systemOverlay }
                : {}),
              ...(cfg.stylePrompt ? { stylePrompt: cfg.stylePrompt } : {}),
            },
          }),
        );
        setConnected(true);
      };
      ws.onmessage = (ev: MessageEvent) => {
        let parsed: RelayMessage | null = null;
        try {
          parsed = JSON.parse(ev.data) as RelayMessage;
        } catch {
          return;
        }
        if (parsed) handleRelayMessage(parsed);
      };
      ws.onerror = () => {
        /* keep alive; surfaced via connected=false on close */
      };
      ws.onclose = () => {
        setConnected(false);
      };
    },
    [handleRelayMessage],
  );

  // ------------------------------------------------------------------------
  // Public: start
  // ------------------------------------------------------------------------
  const start = useCallback(async () => {
    const url = serverWs ?? resolveDefaultWs();

    // Mic first so permission prompt happens before we open the socket.
    const md = (
      navigator as unknown as {
        mediaDevices?: {
          getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
        };
      }
    ).mediaDevices;
    if (md?.getUserMedia) {
      // Request the browser's built-in echo cancellation + noise suppression +
      // auto-gain so steady background noise (fans, traffic, hum, room echo) is
      // filtered before it ever reaches us or Gemini. Fall back to plain audio
      // if the constraints aren't supported.
      let stream: MediaStream;
      try {
        stream = await md.getUserMedia(MIC_CONSTRAINTS);
      } catch {
        stream = await md.getUserMedia({ audio: true });
      }
      streamRef.current = stream;
      wantMicRef.current = true;
      setMicOn(true);
      wireMic(stream);
    }

    wirePlayback();
    openSocket(url);
  }, [serverWs, wireMic, wirePlayback, openSocket]);

  // ------------------------------------------------------------------------
  // Teardown (used by stop, setVoice, unmount)
  // ------------------------------------------------------------------------
  const teardown = useCallback(
    (opts2?: { keepTranscript?: boolean }) => {
      // Stop rAF loop.
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      // Stop and clear playback.
      stopPlayback();

      // Close socket.
      const ws = wsRef.current;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }

      // Stop mic tracks.
      const stream = streamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
        streamRef.current = null;
      }

      // Disconnect nodes.
      if (processorRef.current) {
        processorRef.current.onaudioprocess = null;
        try {
          processorRef.current.disconnect();
        } catch {
          /* ignore */
        }
        processorRef.current = null;
      }
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect();
        } catch {
          /* ignore */
        }
        sourceNodeRef.current = null;
      }
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch {
          /* ignore */
        }
        analyserRef.current = null;
      }

      // Close audio contexts.
      const micCtx = micCtxRef.current;
      if (micCtx) {
        try {
          void micCtx.close();
        } catch {
          /* ignore */
        }
        micCtxRef.current = null;
      }
      const playCtx = playCtxRef.current;
      if (playCtx) {
        try {
          void playCtx.close();
        } catch {
          /* ignore */
        }
        playCtxRef.current = null;
      }

      queueRef.current.flush();
      openLineRef.current = { you: null, nicole: null };

      setConnected(false);
      setMicOn(false);
      setAmplitude(0);
      if (!opts2?.keepTranscript) {
        // start() does not clear transcript by default; stop() leaves it.
      }
    },
    [stopPlayback],
  );

  // ------------------------------------------------------------------------
  // Public: stop
  // ------------------------------------------------------------------------
  const stop = useCallback(() => {
    teardown({ keepTranscript: true });
  }, [teardown]);

  // ------------------------------------------------------------------------
  // Public: toggleMic
  // ------------------------------------------------------------------------
  const toggleMic = useCallback(() => {
    const stream = streamRef.current;
    setMicOn((prev) => {
      const nextOn = !prev;
      wantMicRef.current = nextOn;
      if (stream) {
        for (const track of stream.getTracks()) track.enabled = nextOn;
      }
      return nextOn;
    });
  }, []);

  // ------------------------------------------------------------------------
  // Public: setVoice (reconnect with new voice, preserving transcript)
  // ------------------------------------------------------------------------
  const setVoice = useCallback(
    (v: string) => {
      voiceRef.current = v;
      connectCfgRef.current = { ...connectCfgRef.current, voiceName: v };

      // Tear down socket + audio but keep mic stream and transcript so the
      // reconnect is seamless.
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      stopPlayback();

      const oldWs = wsRef.current;
      if (oldWs) {
        oldWs.onopen = null;
        oldWs.onmessage = null;
        oldWs.onerror = null;
        oldWs.onclose = null;
        try {
          oldWs.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }

      const playCtx = playCtxRef.current;
      if (playCtx) {
        try {
          void playCtx.close();
        } catch {
          /* ignore */
        }
        playCtxRef.current = null;
      }
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch {
          /* ignore */
        }
        analyserRef.current = null;
      }

      // Re-open playback + socket with the new voice.
      wirePlayback();
      openSocket(serverWs ?? resolveDefaultWs());
    },
    [stopPlayback, wirePlayback, openSocket, serverWs],
  );

  // ------------------------------------------------------------------------
  // Unmount cleanup
  // ------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      teardown({ keepTranscript: true });
    };
    // teardown is stable (useCallback) — run cleanup only on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    connected,
    micOn,
    transcript,
    amplitude,
    start,
    stop,
    toggleMic,
    setVoice,
  };
}

/** Keep only the most recent MAX_TRANSCRIPT_LINES lines. */
function capLines(lines: TranscriptLine[]): TranscriptLine[] {
  if (lines.length <= MAX_TRANSCRIPT_LINES) return lines;
  return lines.slice(lines.length - MAX_TRANSCRIPT_LINES);
}
