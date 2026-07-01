// web/src/canvas/PanelFrame.tsx
import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { crashed: boolean; }

/** Wraps one panel so a render error can't take down the canvas or session. */
export class PanelFrame extends Component<Props, State> {
  state: State = { crashed: false };
  static getDerivedStateFromError(): State { return { crashed: true }; }
  componentDidCatch(): void { /* contained; nothing to report to the user */ }
  render(): ReactNode {
    if (this.state.crashed) return <div className="canvas-panel-error">This didn't load.</div>;
    return this.props.children;
  }
}

export default PanelFrame;
