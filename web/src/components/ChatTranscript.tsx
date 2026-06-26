// web/src/components/ChatTranscript.tsx
import type { JSX } from 'react';
import type { TranscriptLine } from '../engine/types';

export interface ChatTranscriptProps {
  lines: TranscriptLine[];
  realtime: { you: string; nicole: string };
  labels?: { you?: string; nicole?: string };
}

/** The Talk chat feed, extracted so Talk, Training, and Roleplay render
 *  transcripts identically. Committed bubbles + one live in-progress bubble per
 *  speaker. `labels` overrides the displayed name (e.g. the rep's alias). */
export function ChatTranscript({ lines, realtime, labels }: ChatTranscriptProps): JSX.Element {
  const youLabel = labels?.you ?? 'You';
  const nicoleLabel = labels?.nicole ?? 'Nicole';
  return (
    <div className="chat-messages">
      {lines.map((line) => (
        <div key={line.id} className={`chat-bubble chat-bubble--${line.speaker === 'you' ? 'user' : 'nicole'}`}>
          <span className="chat-who">{line.speaker === 'you' ? youLabel : nicoleLabel}</span>
          <p className="chat-text">{line.text}</p>
        </div>
      ))}
      {realtime.you && (
        <div className="chat-bubble chat-bubble--user is-streaming">
          <span className="chat-who">{youLabel}</span>
          <p className="chat-text">{realtime.you}</p>
        </div>
      )}
      {realtime.nicole && (
        <div className="chat-bubble chat-bubble--nicole is-streaming">
          <span className="chat-who">{nicoleLabel}</span>
          <p className="chat-text">{realtime.nicole}</p>
        </div>
      )}
    </div>
  );
}

export default ChatTranscript;
