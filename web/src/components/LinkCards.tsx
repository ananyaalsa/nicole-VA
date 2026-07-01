import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { SearchLink } from '../engine/useNicoleSession';
import { useAuth } from '../auth/AuthContext';
import './LinkCards.css';

/** A link enriched with Open Graph preview data from the server. */
interface Preview {
  url: string;
  title: string;
  image: string | null;
  site: string | null;
}

export interface LinkCardsProps {
  /** The source links from Nicole's latest web-searched answer. */
  links: SearchLink[];
  /** Dismiss the cards. */
  onClose?: () => void;
}

/**
 * On-screen result CARDS for a web-searched answer — thumbnail (Open Graph
 * image), title, and the site, each a tappable link. Appears when Nicole answers
 * a shoppable/actionable query (products, flights, hotels) so the user gets the
 * actual links "with pictures" alongside her spoken summary.
 */
export function LinkCards({ links, onClose }: LinkCardsProps): JSX.Element | null {
  const { token } = useAuth();
  const [previews, setPreviews] = useState<Preview[]>([]);

  useEffect(() => {
    if (!links.length) { setPreviews([]); return; }
    let alive = true;
    // Seed with title-only cards immediately, then enrich with images.
    setPreviews(links.map((l) => ({ url: l.url, title: l.title, image: null, site: hostOf(l.url) })));
    fetch('/api/links/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ urls: links.map((l) => l.url) }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { previews?: Preview[] }) => { if (alive && d.previews?.length) setPreviews(d.previews); })
      .catch(() => { /* keep the seed cards */ });
    return () => { alive = false; };
  }, [links, token]);

  if (!previews.length) return null;

  return (
    <section className="link-cards" data-testid="link-cards" aria-label="Search results">
      <div className="link-cards__head">
        <span className="link-cards__title">Results</span>
        {onClose && (
          <button type="button" className="link-cards__close" onClick={onClose} aria-label="Dismiss results">✕</button>
        )}
      </div>
      <div className="link-cards__row">
        {previews.map((p) => (
          <a
            key={p.url}
            className="link-card"
            data-testid="link-card"
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="link-card__thumb">
              {p.image
                ? <img src={p.image} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                : <span className="link-card__thumb-fallback" aria-hidden="true">{(p.site ?? '?').charAt(0).toUpperCase()}</span>}
            </div>
            <div className="link-card__body">
              <span className="link-card__title">{p.title}</span>
              <span className="link-card__site">{p.site ?? hostOf(p.url)}</span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export default LinkCards;
