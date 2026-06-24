import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import type { TranscriptLine } from '../engine/types';
import './Transcript.css';

export interface TranscriptProps {
  /** Full transcript history (oldest first). */
  lines: TranscriptLine[];
  /**
   * Maximum number of lines actually rendered to the DOM. Older lines roll
   * off (they are not in the DOM at all) to keep the node count bounded.
   */
  maxRendered?: number;
}

const SPEAKER_LABEL: Record<TranscriptLine['speaker'], string> = {
  you: 'You',
  nicole: 'Nicole',
};

/**
 * Scrollable transcript of the conversation.
 *
 * Only the most recent `maxRendered` lines are rendered to the DOM — older
 * bubbles are dropped from the render output entirely so a long session never
 * grows an unbounded number of DOM nodes. Auto-scrolls to the bottom whenever
 * a new line arrives.
 */
export function Transcript({
  lines,
  maxRendered = 120,
}: TranscriptProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Only render the tail of the conversation.
  const visible =
    lines.length > maxRendered
      ? lines.slice(lines.length - maxRendered)
      : lines;

  // Auto-scroll to the bottom whenever the line count changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <div className="transcript" ref={scrollRef} data-testid="transcript">
      {visible.map((line) => (
        <div
          key={line.id}
          className={`transcript-line transcript-line--${line.speaker}`}
          data-testid="transcript-line"
          data-speaker={line.speaker}
        >
          <span className="transcript-speaker">
            {SPEAKER_LABEL[line.speaker]}
          </span>
          <span className="transcript-text">{line.text}</span>
        </div>
      ))}
    </div>
  );
}

export default Transcript;
