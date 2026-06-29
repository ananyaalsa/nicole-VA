import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignalingClient, type WebSocketLike } from './signalingClient';

/** A controllable fake WebSocket implementing WebSocketLike. */
class FakeWs implements WebSocketLike {
  sent: string[] = [];
  closed = false;
  readyState = 0; // CONNECTING
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
    this.onclose?.(null);
  }

  // --- Test helpers -------------------------------------------------------
  open(): void {
    this.readyState = 1; // OPEN
    this.onopen?.(null);
  }
  receive(obj: unknown): void {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }

  /** Parsed view of the last sent frame. */
  lastSent(): unknown {
    return JSON.parse(this.sent[this.sent.length - 1]);
  }
}

let fake: FakeWs;
let makeWs: (url: string) => WebSocketLike;

beforeEach(() => {
  fake = new FakeWs();
  makeWs = vi.fn(() => fake);
});

describe('SignalingClient', () => {
  it('connect() opens the socket and sends a join on open', () => {
    const client = new SignalingClient('ws://x/rtc-signal', 'ABCD', makeWs);
    client.connect();
    expect(makeWs).toHaveBeenCalledWith('ws://x/rtc-signal');
    // Nothing sent until the socket opens.
    expect(fake.sent).toHaveLength(0);
    fake.open();
    expect(fake.lastSent()).toEqual({ type: 'join', room: 'ABCD' });
  });

  it('fires onJoined with the peer count from a joined message', () => {
    const client = new SignalingClient('ws://x', 'R', makeWs);
    const onJoined = vi.fn();
    client.onJoined(onJoined);
    client.connect();
    fake.open();
    fake.receive({ type: 'joined', room: 'R', peers: 1 });
    expect(onJoined).toHaveBeenCalledWith(1);
  });

  it('fires onPeerJoined on a peer-joined message', () => {
    const client = new SignalingClient('ws://x', 'R', makeWs);
    const onPeerJoined = vi.fn();
    client.onPeerJoined(onPeerJoined);
    client.connect();
    fake.open();
    fake.receive({ type: 'peer-joined', room: 'R' });
    expect(onPeerJoined).toHaveBeenCalledTimes(1);
  });

  it('fires onSignal with the relayed payload', () => {
    const client = new SignalingClient('ws://x', 'R', makeWs);
    const onSignal = vi.fn();
    client.onSignal(onSignal);
    client.connect();
    fake.open();
    const payload = { sdp: { type: 'offer', sdp: 'v=0...' } };
    fake.receive({ type: 'signal', room: 'R', payload });
    expect(onSignal).toHaveBeenCalledWith(payload);
  });

  it('fires onPeerLeft on a peer-left message', () => {
    const client = new SignalingClient('ws://x', 'R', makeWs);
    const onPeerLeft = vi.fn();
    client.onPeerLeft(onPeerLeft);
    client.connect();
    fake.open();
    fake.receive({ type: 'peer-left', room: 'R' });
    expect(onPeerLeft).toHaveBeenCalledTimes(1);
  });

  it('sendSignal sends the correct {type:signal, payload} shape', () => {
    const client = new SignalingClient('ws://x', 'R', makeWs);
    client.connect();
    fake.open();
    const payload = { candidate: { candidate: 'a=...' } };
    client.sendSignal(payload);
    expect(fake.lastSent()).toEqual({ type: 'signal', payload });
  });

  it('sendSignal is a no-op when the socket is not open', () => {
    const client = new SignalingClient('ws://x', 'R', makeWs);
    client.connect();
    // socket still CONNECTING (readyState 0)
    client.sendSignal({ candidate: 'x' });
    // Only nothing has been sent (join not yet fired either).
    expect(fake.sent).toHaveLength(0);
  });

  it('close() closes the underlying socket', () => {
    const client = new SignalingClient('ws://x', 'R', makeWs);
    client.connect();
    fake.open();
    client.close();
    expect(fake.closed).toBe(true);
  });

  it('fires onClose when the socket closes', () => {
    const client = new SignalingClient('ws://x', 'R', makeWs);
    const onClose = vi.fn();
    client.onClose(onClose);
    client.connect();
    fake.open();
    fake.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed (non-JSON) messages', () => {
    const client = new SignalingClient('ws://x', 'R', makeWs);
    const onSignal = vi.fn();
    client.onSignal(onSignal);
    client.connect();
    fake.open();
    fake.onmessage?.({ data: 'not json{' });
    expect(onSignal).not.toHaveBeenCalled();
  });
});
