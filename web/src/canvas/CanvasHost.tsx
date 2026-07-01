// web/src/canvas/CanvasHost.tsx
import type { JSX, ReactNode } from 'react';
import type { Panel, PanelType } from './canvasTypes';
import { PANELS } from './panels/registry';
import type { PanelComponentProps } from './panels/registry';
import { PanelFrame } from './PanelFrame';
import './CanvasHost.css';

export interface CanvasHostProps {
  panels: Panel[];
  token: string | null;
  onClose(type: PanelType, provider?: string): void;
  children?: ReactNode;
}

/** Thin wrapper so the factory call happens inside React's reconciler,
 *  letting the ancestor PanelFrame error boundary catch any thrown errors. */
function PanelSlot(props: PanelComponentProps & { type: PanelType }): JSX.Element {
  const { type, ...rest } = props;
  const Render = PANELS[type];
  return Render(rest) as JSX.Element;
}

export function CanvasHost({ panels, token, onClose, children }: CanvasHostProps): JSX.Element {
  if (panels.length === 0) {
    return <div className="canvas-host canvas-host--idle" data-testid="canvas-host">{children}</div>;
  }
  return (
    <div className="canvas-host" data-testid="canvas-host">
      <div className="canvas-host__head">Canvas · what Nicole opened</div>
      {panels.map((p) => {
        const provider = p.type === 'connect' ? String(p.args?.provider ?? '') : undefined;
        return (
          <div className="canvas-host__panel" key={p.key}>
            <PanelFrame>
              <PanelSlot
                type={p.type}
                panel={p}
                token={token}
                onClose={() => onClose(p.type, provider)}
              />
            </PanelFrame>
          </div>
        );
      })}
    </div>
  );
}

export default CanvasHost;
