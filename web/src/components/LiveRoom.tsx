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
  /** Optional call-presence panel shown above the feed (avatar + status). It is
   *  what makes the room feel like a live call rather than a blank transcript. */
  presence?: ReactNode;
  /** Optional bottom action/status bar (mute, end, turn state, primary CTA). */
  footer?: ReactNode;
  /** Shown in the feed before any line arrives — an invitation, not a void. */
  emptyState?: ReactNode;
}

/**
 * Full-width live room shell used by BOTH Training and Roleplay. A call-presence
 * panel + a Talk-style transcript feed fill the main column, an anchor rail sits
 * to the right, and a footer bar holds the live controls — so the screen reads as
 * "you're on a live call," never a blank centered stage.
 */
export function LiveRoom({
  lines, realtime, labels, rail, presence, footer, emptyState,
}: LiveRoomProps): JSX.Element {
  const feedRef = useRef<HTMLDivElement | null>(null);
  // Stick to the newest line as the conversation grows.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length, realtime.you, realtime.nicole]);

  const hasAny = lines.length > 0 || !!realtime.you || !!realtime.nicole;

  return (
    <div className="live-room" data-testid="live-room">
      <div className="live-room__main">
        {presence && <div className="live-room__presence">{presence}</div>}
        <div className="live-room__feed" ref={feedRef}>
          {hasAny ? (
            <ChatTranscript lines={lines} realtime={realtime} labels={labels} />
          ) : (
            <div className="live-room__empty">{emptyState}</div>
          )}
        </div>
      </div>
      <aside className="live-room__rail">{rail}</aside>
      {footer && <div className="live-room__footer">{footer}</div>}
    </div>
  );
}

export default LiveRoom;
