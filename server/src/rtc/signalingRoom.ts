// WebRTC signaling rooms.
//
// Two peers (the PC and the phone) join the same room code and relay their
// WebRTC handshake to each other — SDP offer/answer + ICE candidates. This
// server NEVER touches the media; it only passes signaling messages. No Gemini,
// no audio, no video here.
//
// Pure + injectable (peers are just objects with send()/an id) so the whole
// thing is unit-testable with fakes — no real WebSocket, no network.

/** The minimal peer interface the room needs. */
export interface SignalPeer {
  id: string;
  send: (msg: unknown) => void;
}

interface Room {
  peers: Map<string, SignalPeer>;
}

/**
 * Holds all active rooms and routes signaling between the two peers in a room.
 */
/** A signaling room only ever holds the two intended peers (PC + phone). */
const MAX_PEERS_PER_ROOM = 2;
/** Hard cap on concurrent rooms so an attacker can't open unbounded rooms and
 *  exhaust server memory. Far above any realistic concurrent-pairing load. */
const MAX_ROOMS = 10_000;

export class SignalingRooms {
  private rooms = new Map<string, Room>();

  /** Add a peer to a room (creating it if needed). Returns false if rejected
   *  (room already has both peers, or the global room cap is hit). */
  join(roomCode: string, peer: SignalPeer): boolean {
    let room = this.rooms.get(roomCode);
    if (!room) {
      if (this.rooms.size >= MAX_ROOMS) {
        peer.send({ type: 'error', message: 'Too many active rooms' });
        return false;
      }
      room = { peers: new Map() };
      this.rooms.set(roomCode, room);
    }
    // Refuse a third peer: only the PC and the phone belong in a room. Without
    // this, anyone who guesses the code could join and receive the WebRTC
    // signaling (offer/answer/ICE) for someone else's camera handshake.
    if (!room.peers.has(peer.id) && room.peers.size >= MAX_PEERS_PER_ROOM) {
      peer.send({ type: 'room-full', room: roomCode });
      if (room.peers.size === 0) this.rooms.delete(roomCode);
      return false;
    }
    room.peers.set(peer.id, peer);
    // Tell the joining peer how many others are already here, and notify the
    // others that a peer joined (so the phone, joining second, knows to offer).
    const others = [...room.peers.values()].filter((p) => p.id !== peer.id);
    peer.send({ type: 'joined', room: roomCode, peers: others.length });
    for (const other of others) {
      other.send({ type: 'peer-joined', room: roomCode });
    }
    return true;
  }

  /**
   * Relay a signal (offer/answer/ICE) from `fromId` to the OTHER peer(s) in the
   * room. Never echoes back to the sender; never crosses rooms.
   */
  relay(roomCode: string, fromId: string, payload: unknown): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    for (const peer of room.peers.values()) {
      if (peer.id !== fromId) peer.send({ type: 'signal', room: roomCode, payload });
    }
  }

  /** Remove a peer (on disconnect). Notifies the other peer; GCs empty rooms. */
  leave(roomCode: string, peerId: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    room.peers.delete(peerId);
    for (const peer of room.peers.values()) {
      peer.send({ type: 'peer-left', room: roomCode });
    }
    if (room.peers.size === 0) this.rooms.delete(roomCode);
  }

  /** Number of peers in a room (for tests/diagnostics). */
  size(roomCode: string): number {
    return this.rooms.get(roomCode)?.peers.size ?? 0;
  }

  /** Number of active rooms (for tests/diagnostics). */
  roomCount(): number {
    return this.rooms.size;
  }
}

/** Generate a short, URL-safe, unambiguous room code (no 0/O/1/I/l).
 *  Defaults to a CRYPTO-secure RNG and length 8 (~40 bits) so an unauthenticated
 *  room code can't be brute-forced before the short-lived pairing completes. A
 *  custom `rand` (e.g. a seeded fn) can still be injected for deterministic tests. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generateRoomCode(rand?: () => number, length = 8): string {
  const next =
    rand ??
    (() => cryptoRandomInt() / 0xffffffff);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(next() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  }
  return code;
}

/** A 32-bit unsigned int from the crypto RNG (Node + browser both expose it). */
function cryptoRandomInt(): number {
  const g = globalThis as unknown as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } };
  if (g.crypto?.getRandomValues) {
    return g.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  // Node without global crypto (older): fall back to node:crypto.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  return require('node:crypto').randomBytes(4).readUInt32BE(0);
}
