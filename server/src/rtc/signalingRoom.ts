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
export class SignalingRooms {
  private rooms = new Map<string, Room>();

  /** Add a peer to a room (creating it if needed). */
  join(roomCode: string, peer: SignalPeer): void {
    let room = this.rooms.get(roomCode);
    if (!room) {
      room = { peers: new Map() };
      this.rooms.set(roomCode, room);
    }
    room.peers.set(peer.id, peer);
    // Tell the joining peer how many others are already here, and notify the
    // others that a peer joined (so the phone, joining second, knows to offer).
    const others = [...room.peers.values()].filter((p) => p.id !== peer.id);
    peer.send({ type: 'joined', room: roomCode, peers: others.length });
    for (const other of others) {
      other.send({ type: 'peer-joined', room: roomCode });
    }
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

/** Generate a short, URL-safe, unambiguous room code (no 0/O/1/I/l). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generateRoomCode(rand: () => number = Math.random, length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  }
  return code;
}
