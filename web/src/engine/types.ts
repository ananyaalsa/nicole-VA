/**
 * Shared types for the live Nicole session engine.
 *
 * Kept in a standalone module (no React / DOM imports) so UI components such as
 * the Transcript can import the `TranscriptLine` shape without pulling in the
 * whole session hook.
 */

/** Who spoke a given transcript line. */
export type Speaker = 'you' | 'nicole';

/** A single line of conversation transcript. */
export interface TranscriptLine {
  /** Stable unique id (used as a React key). */
  id: string;
  /** Which side of the conversation produced this line. */
  speaker: Speaker;
  /** The (possibly still-streaming) text of the line. */
  text: string;
  /** True while this line is still being streamed (drives the typing caret). */
  streaming?: boolean;
}
