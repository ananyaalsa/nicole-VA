import type { JSX } from 'react';
import type { ResultLine } from '../training/scoreApi';
import './DualTranscript.css';

export interface DualTranscriptProps {
  lines: ResultLine[];
  /** Display name for the rep/character lane (defaults to "Rep"). */
  repLabel?: string;
}

const LABEL = { you: 'You', rep: 'Rep', nicole: 'Nicole' } as const;

/** The annotated post-rep transcript: the rep, you, and (in training) Nicole each
 *  in a visually distinct lane — alignment + color + label, never color alone. */
export function DualTranscript({ lines, repLabel }: DualTranscriptProps): JSX.Element {
  return (
    <div className="dual-transcript" data-testid="dual-transcript">
      {lines.map((l, i) => {
        const name = l.speaker === 'rep' ? (repLabel ?? LABEL.rep) : LABEL[l.speaker];
        return (
          <div key={i} className={`dual-line dual-line--${l.speaker}`} data-speaker={l.speaker}>
            <span className="dual-line__who">{name}</span>
            <p className="dual-line__text">{l.text}</p>
          </div>
        );
      })}
    </div>
  );
}

export default DualTranscript;
