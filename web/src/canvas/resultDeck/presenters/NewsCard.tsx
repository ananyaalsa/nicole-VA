import type { JSX } from 'react';
import type { NewsPayload } from '../resultTypes';
import './presenters.css';

export function NewsCard({ payload }: { payload: NewsPayload }): JSX.Element {
  if (!payload.items.length) return <p className="deck-empty">Nothing to show yet.</p>;
  return (
    <ul className="news-list" data-testid="news-list">
      {payload.items.map((n) => (
        <li className="news-item" key={n.url}>
          <a href={n.url} target="_blank" rel="noopener noreferrer">
            <span className="news-item__title">{n.title}</span>
            <span className="news-item__src">{n.source}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
export default NewsCard;
