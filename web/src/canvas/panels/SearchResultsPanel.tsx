// web/src/canvas/panels/SearchResultsPanel.tsx
import type { JSX } from 'react';
import { LinkCards } from '../../components/LinkCards';
import type { SearchLink } from '../../engine/useNicoleSession';
import type { PanelComponentProps } from './registry';

export function SearchResultsPanel({ panel, onClose }: PanelComponentProps): JSX.Element {
  const links = (panel.args?.links as SearchLink[] | undefined) ?? [];
  // With no links, LinkCards renders nothing → an empty labeled "Canvas" box. Show
  // an explicit friendly empty state instead (e.g. if the panel is opened before
  // any results arrive). Real results come from the internal search effect.
  if (links.length === 0) {
    return <div className="canvas-panel-empty">No results to show yet.</div>;
  }
  return <LinkCards links={links} onClose={onClose} />;
}
