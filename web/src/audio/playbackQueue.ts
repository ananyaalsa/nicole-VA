/**
 * A bounded FIFO queue for audio playback buffers.
 *
 * Keeps memory leak-safe by dropping the oldest item when capacity is exceeded,
 * and supports a flush() for barge-in (interrupting playback).
 */
export class PlaybackQueue<T = ArrayBuffer> {
  private items: T[] = [];
  private readonly maxLength: number;

  constructor(maxLength = 50) {
    this.maxLength = maxLength;
  }

  /**
   * Add an item to the back of the queue. If the queue is at (or over)
   * capacity, the oldest item is dropped first to stay bounded.
   */
  enqueue(item: T): void {
    while (this.items.length >= this.maxLength) {
      this.items.shift();
    }
    this.items.push(item);
  }

  /**
   * Remove and return the oldest item, or undefined if empty.
   */
  dequeue(): T | undefined {
    return this.items.shift();
  }

  /**
   * Empty the queue. Used for barge-in to stop pending playback.
   */
  flush(): void {
    this.items.length = 0;
  }

  get length(): number {
    return this.items.length;
  }
}
