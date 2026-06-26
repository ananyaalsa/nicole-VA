import type { JSX, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import type { TranscriptLine } from '../engine/types';
import { ChatTranscript } from './ChatTranscript';
import './LiveRoom.css';

export interface LiveRoomProps {
  lines: TranscriptLine[];
  realtime: { you: string; nicole: string };
  labels?: { you?: string; nicole?: string };
  rail: ReactNode;
}

/** Full-width live room: a Talk-style transcript feed that uses the whole left
 *  area + a right anchor rail. Replaces the narrow centered stage so the sides
 *  are no longer blank. Collapses to one column on mobile (rail on top). */
export function LiveRoom({ lines, realtime, labels, rail }: LiveRoomProps): JSX.Element {
  const feedRef = useRef<HTMLDivElement | null>(null);
  // Stick to the newest line as the conversation grows.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length, realtime.you, realtime.nicole]);

  return (
    <div className="live-room" data-testid="live-room">
      <aside className="live-room__rail">{rail}</aside>
      <div className="live-room__feed" ref={feedRef}>
        <ChatTranscript lines={lines} realtime={realtime} labels={labels} />
      </div>
    </div>
  );
}

export default LiveRoom;
