// web/src/canvas/resultDeck/ResultDeck.tsx
import { Component, type JSX, type ReactNode } from 'react';
import type { ResultItem } from './resultTypes';
import { OverlayFrame } from './OverlayFrame';
import { WeatherCard } from './presenters/WeatherCard';
import { NewsCard } from './presenters/NewsCard';
import { SearchCard } from './presenters/SearchCard';
import { ProductGrid } from './presenters/ProductGrid';
import { friendlyError } from '../../ui/friendlyError';
import './ResultDeck.css';

export class PresenterBoundary extends Component<{ resetKey: string; children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.crashed) this.setState({ crashed: false }); }
  render() { return this.state.crashed ? <p className="deck-empty">{friendlyError('generic')}</p> : this.props.children; }
}

function presenterFor(item: ResultItem): JSX.Element {
  switch (item.kind) {
    case 'weather': return <WeatherCard payload={item.payload as never} />;
    case 'news': return <NewsCard payload={item.payload as never} />;
    case 'search': return <SearchCard payload={item.payload as never} />;
    case 'products': return <ProductGrid payload={item.payload as never} />;
  }
}

export interface ResultDeckProps {
  items: ResultItem[];
  onCollapse(id: string): void;
  onExpand(id: string): void;
  onDismiss(id: string): void;
}

export function ResultDeck({ items, onCollapse, onExpand, onDismiss }: ResultDeckProps): JSX.Element {
  const overlays = items.filter((i) => i.state === 'overlay');
  const pills = items.filter((i) => i.state === 'pill');
  return (
    <div className="result-deck" data-testid="result-deck">
      {overlays.map((item) => (
        // Key by id:version so a re-push (weather singleton reuses its id but bumps
        // version, or an expand after collapse) REMOUNTS the frame and re-arms the
        // 10s auto-collapse timer — the timer effect only runs on mount.
        <OverlayFrame key={`${item.id}:${item.version}`} label={item.label} icon={item.icon}
          onCollapse={() => onCollapse(item.id)} onDismiss={() => onDismiss(item.id)}>
          <PresenterBoundary resetKey={String(item.version)}>{presenterFor(item)}</PresenterBoundary>
        </OverlayFrame>
      ))}
      {pills.length > 0 && (
        <div className="result-deck__pills">
          {pills.map((item) => (
            <button type="button" key={item.id} className="result-pill" onClick={() => onExpand(item.id)}>
              <span aria-hidden="true">{item.icon}</span> {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export default ResultDeck;
