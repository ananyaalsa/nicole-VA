import { describe, it, expect } from 'vitest';
import { PlaybackQueue } from './playbackQueue';

describe('PlaybackQueue', () => {
  it('enqueues and dequeues in FIFO order', () => {
    const q = new PlaybackQueue<number>();
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    expect(q.length).toBe(3);
    expect(q.dequeue()).toBe(1);
    expect(q.dequeue()).toBe(2);
    expect(q.dequeue()).toBe(3);
    expect(q.dequeue()).toBeUndefined();
    expect(q.length).toBe(0);
  });

  it('flush empties the queue', () => {
    const q = new PlaybackQueue<number>();
    q.enqueue(1);
    q.enqueue(2);
    q.flush();
    expect(q.length).toBe(0);
    expect(q.dequeue()).toBeUndefined();
  });

  it('drops oldest items beyond maxLength and stays capped', () => {
    const q = new PlaybackQueue<number>(3);
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    q.enqueue(4); // drops 1
    q.enqueue(5); // drops 2
    expect(q.length).toBe(3);
    expect(q.dequeue()).toBe(3);
    expect(q.dequeue()).toBe(4);
    expect(q.dequeue()).toBe(5);
  });

  it('defaults to a maxLength of 50', () => {
    const q = new PlaybackQueue<number>();
    for (let i = 0; i < 100; i++) q.enqueue(i);
    expect(q.length).toBe(50);
    // Oldest retained should be 50 (0..49 dropped).
    expect(q.dequeue()).toBe(50);
  });

  it('defaults the generic type to ArrayBuffer', () => {
    const q = new PlaybackQueue();
    const buf = new ArrayBuffer(8);
    q.enqueue(buf);
    expect(q.dequeue()).toBe(buf);
  });
});
