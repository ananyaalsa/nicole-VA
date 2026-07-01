// web/src/canvas/panels/SearchResultsPanel.tsx
import type { JSX } from 'react';
import { LinkCards } from '../../components/LinkCards';
import type { SearchLink } from '../../engine/useNicoleSession';
import type { PanelComponentProps } from './registry';

export function SearchResultsPanel({ panel, onClose }: PanelComponentProps): JSX.Element {
  const links = (panel.args?.links as SearchLink[] | undefined) ?? [];
  return <LinkCards links={links} onClose={onClose} />;
}
