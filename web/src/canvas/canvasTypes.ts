export type PanelType = 'connect' | 'weather' | 'search_results' | 'note' | 'integrations';

export interface Panel {
  /** Unique key: the type for singletons, `connect:<provider>` for connect cards. */
  key: string;
  type: PanelType;
  args?: Record<string, unknown>;
}
