import { describe, it, expect, vi } from 'vitest';
import { SignalingRooms, generateRoomCode, type SignalPeer } from './signalingRoom.js';

function fakePeer(id: string): SignalPeer & { sent: any[] } {
  const sent: any[] = [];
  return { id, send: (m) => sent.push(m), sent };
}

describe('SignalingRooms', () => {
  it('relays a signal from one peer to the OTHER peer in the room', () => {
    const rooms = new SignalingRooms();
    const a = fakePeer('a');
    const b = fakePeer('b');
    rooms.join('R1', a);
    rooms.join('R1', b);
    rooms.relay('R1', 'a', { sdp: 'offer' });
    // b receives it; a does NOT get its own signal back.
    expect(b.sent).toContainEqual({ type: 'signal', room: 'R1', payload: { sdp: 'offer' } });
    expect(a.sent.some((m) => m.type === 'signal')).toBe(false);
  });

  it('does NOT cross rooms', () => {
    const rooms = new SignalingRooms();
    const a = fakePeer('a');
    const c = fakePeer('c');
    rooms.join('R1', a);
    rooms.join('R2', c);
    rooms.relay('R1', 'a', { sdp: 'x' });
    expect(c.sent.some((m) => m.type === 'signal')).toBe(false);
  });

  it('notifies existing peers when a second peer joins', () => {
    const rooms = new SignalingRooms();
    const a = fakePeer('a');
    const b = fakePeer('b');
    rooms.join('R1', a);
    rooms.join('R1', b);
    expect(a.sent).toContainEqual({ type: 'peer-joined', room: 'R1' });
    // The joiner is told how many peers were already present.
    expect(b.sent).toContainEqual({ type: 'joined', room: 'R1', peers: 1 });
  });

  it('removes a peer on leave, notifies the other, and GCs empty rooms', () => {
    const rooms = new SignalingRooms();
    const a = fakePeer('a');
    const b = fakePeer('b');
    rooms.join('R1', a);
    rooms.join('R1', b);
    rooms.leave('R1', 'a');
    expect(b.sent).toContainEqual({ type: 'peer-left', room: 'R1' });
    expect(rooms.size('R1')).toBe(1);
    rooms.leave('R1', 'b');
    expect(rooms.roomCount()).toBe(0);
  });

  it('relay to a non-existent room is a no-op', () => {
    const rooms = new SignalingRooms();
    expect(() => rooms.relay('NOPE', 'a', {})).not.toThrow();
  });
});

describe('generateRoomCode', () => {
  it('produces a code of the requested length from the safe alphabet', () => {
    const code = generateRoomCode(() => 0, 6);
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z2-9]+$/);
    expect(code).not.toMatch(/[01OIL]/); // no ambiguous chars
  });

  it('varies with the RNG', () => {
    const a = generateRoomCode(() => 0);
    const b = generateRoomCode(() => 0.99);
    expect(a).not.toBe(b);
  });
});
