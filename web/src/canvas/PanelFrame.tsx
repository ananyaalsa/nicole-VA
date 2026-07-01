// web/src/canvas/PanelFrame.tsx
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Bumped each time this panel is (re)opened. When it changes, the boundary
   *  clears its crashed state so a once-failed panel recovers on reopen (instead
   *  of staying stuck on "This didn't load." forever because singletons keep a
   *  stable React key). */
  resetKey?: number | string;
}
interface State { crashed: boolean; lastResetKey?: number | string; }

/** Wraps one panel so a render error can't take down the canvas or session. */
export class PanelFrame extends Component<Props, State> {
  state: State = { crashed: false, lastResetKey: this.props.resetKey };
  static getDerivedStateFromError(): Partial<State> { return { crashed: true }; }
  /** When the reset key changes (panel reopened with fresh data), drop the crashed
   *  flag so the children get a fresh render attempt. */
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.lastResetKey) {
      return { crashed: false, lastResetKey: props.resetKey };
    }
    return null;
  }
  componentDidCatch(): void { /* contained; nothing to report to the user */ }
  render(): ReactNode {
    if (this.state.crashed) return <div className="canvas-panel-error">This didn't load.</div>;
    return this.props.children;
  }
}

export default PanelFrame;
