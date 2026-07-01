// web/src/canvas/panels/NotePanel.tsx
import { useState } from 'react';
import type { JSX } from 'react';
import type { PanelComponentProps } from './registry';

export function NotePanel({ panel }: PanelComponentProps): JSX.Element {
  const text = String(panel.args?.text ?? '');
  const [copied, setCopied] = useState(false);
  const copy = () => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };
  return (
    <div className="canvas-note" data-testid="note-panel">
      <button type="button" className="canvas-note__copy" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
      <pre className="canvas-note__body">{text}</pre>
    </div>
  );
}
