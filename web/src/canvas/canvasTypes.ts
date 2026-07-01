export type PanelType = 'connect' | 'note' | 'integrations';

export interface Panel {
  /** Unique key: the type for singletons, `connect:<provider>` for connect cards. */
  key: string;
  type: PanelType;
  args?: Record<string, unknown>;
  /** Monotonic version bumped on each (re)open. Used by CanvasHost/PanelFrame to
   *  reset a once-crashed error boundary when the panel reopens with fresh data. */
  nonce?: number;
}
