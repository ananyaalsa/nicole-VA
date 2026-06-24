// Shared types for the Nicole 2.0 backend. Every workstream imports from here.

/** A single conversational turn, used for summarization + context. */
export interface Turn {
  role: 'user' | 'nicole';
  text: string;
}

/** A durable memory fact stored in nicole2_memory. */
export interface MemoryFact {
  id?: number;
  userId: string;
  key: string;
  fact: string;
  factType: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Per-session config the client requests when connecting to the relay. */
export interface SessionConfig {
  /** Selected Gemini voice name (e.g. 'Aoede', 'Charon'). */
  voiceName: string;
  /** 'talk' for normal Nicole, 'coach' / 'prospect' for training. */
  mode: 'talk' | 'coach' | 'prospect';
  /** Optional system-prompt overlay (used by training phase overlays). */
  systemOverlay?: string;
  /** Optional voice style/emotion prompt appended to the system prompt. */
  stylePrompt?: string;
}

/** Client -> relay messages over the WebSocket. */
export type RelayClientMsg =
  | { type: 'connect'; config: SessionConfig }
  | { type: 'client-msg'; payload: unknown }
  | { type: 'tool-response'; payload: unknown }
  | { type: 'set-voice'; voiceName: string };

/** Relay -> client messages over the WebSocket. */
export type RelayServerMsg =
  | { type: 'ready' }
  | { type: 'reconnecting' }
  | { type: 'message'; data: unknown }
  | { type: 'error'; message: string };
