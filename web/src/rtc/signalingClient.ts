/**
 * Thin WebSocket wrapper for the WebRTC signaling room at `/rtc-signal`.
 *
 * A signaling room relays the WebRTC handshake between exactly two peers: the
 * PHONE (offerer) and the PC (answerer). This client only knows the relay
 * protocol — it carries opaque `payload`s (SDP / ICE) between the peers and
 * never inspects them.
 *
 * Protocol (see backend contract):
 *  - Client -> server: `{type:'join', room}` then `{type:'signal', payload}`.
 *  - Server -> client: `{type:'joined', room, peers}`,
 *    `{type:'peer-joined', room}`, `{type:'signal', room, payload}`,
 *    `{type:'peer-left', room}`.
 *
 * The WebSocket is injectable so tests can drive it with a fake; in production
 * it defaults to the global `WebSocket`.
 */

/** Minimal surface of a WebSocket this client depends on (for test fakes). */
export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  readyState: number;
}

/** Factory that produces a WebSocketLike for a given URL. */
export type MakeWebSocket = (url: string) => WebSocketLike;

const OPEN = 1;

export class SignalingClient {
  private ws: WebSocketLike | null = null;

  private joinedCb: ((peers: number) => void) | null = null;
  private peerJoinedCb: (() => void) | null = null;
  private signalCb: ((payload: unknown) => void) | null = null;
  private peerLeftCb: (() => void) | null = null;
  private closeCb: (() => void) | null = null;

  constructor(
    private readonly url: string,
    private readonly room: string,
    private readonly makeWs: MakeWebSocket = (u) =>
      new WebSocket(u) as unknown as WebSocketLike,
  ) {}

  /** Open the socket; sends `{type:'join', room}` once it's open. */
  connect(): void {
    const ws = this.makeWs(this.url);
    this.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', room: this.room }));
    };
    ws.onmessage = (ev) => {
      this.handleMessage(ev.data);
    };
    ws.onclose = () => {
      this.closeCb?.();
    };
    ws.onerror = () => {
      /* surfaced via onclose; nothing actionable here */
    };
  }

  private handleMessage(data: unknown): void {
    let msg: {
      type?: string;
      peers?: number;
      payload?: unknown;
    } | null = null;
    try {
      msg = JSON.parse(typeof data === 'string' ? data : String(data));
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'joined':
        this.joinedCb?.(typeof msg.peers === 'number' ? msg.peers : 0);
        return;
      case 'peer-joined':
        this.peerJoinedCb?.();
        return;
      case 'signal':
        this.signalCb?.(msg.payload);
        return;
      case 'peer-left':
        this.peerLeftCb?.();
        return;
      default:
        return;
    }
  }

  /** Relay an opaque signaling payload (SDP / ICE) to the other peer. */
  sendSignal(payload: unknown): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== OPEN) return;
    ws.send(JSON.stringify({ type: 'signal', payload }));
  }

  onJoined(cb: (peers: number) => void): void {
    this.joinedCb = cb;
  }
  onPeerJoined(cb: () => void): void {
    this.peerJoinedCb = cb;
  }
  onSignal(cb: (payload: unknown) => void): void {
    this.signalCb = cb;
  }
  onPeerLeft(cb: () => void): void {
    this.peerLeftCb = cb;
  }
  onClose(cb: () => void): void {
    this.closeCb = cb;
  }

  /** Close the socket. Safe to call more than once. */
  close(): void {
    const ws = this.ws;
    if (!ws) return;
    this.ws = null;
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  }
}

export default SignalingClient;
