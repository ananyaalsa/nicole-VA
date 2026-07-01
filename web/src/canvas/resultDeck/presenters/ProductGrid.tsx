import type { JSX } from 'react';
import type { ProductsPayload } from '../resultTypes';
import './presenters.css';

function stars(rating: number | null): string {
  if (rating == null) return '';
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
}

export function ProductGrid({ payload }: { payload: ProductsPayload }): JSX.Element {
  if (!payload.products.length) {
    return <p className="deck-empty" data-testid="products-empty">No products found — want me to try again?</p>;
  }
  return (
    <div className="product-grid" data-testid="product-grid">
      {payload.products.map((p) => (
        <a
          className="pcard"
          key={p.url}
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${p.title} on Amazon`}
        >
          <div className="pcard__img">
            {p.image
              ? <img src={p.image} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
              : <span aria-hidden="true">🛒</span>}
          </div>
          <div className="pcard__body">
            <span className="pcard__title">{p.title}</span>
            {p.rating != null && (
              <span className="pcard__rating">{stars(p.rating)} {p.reviews != null && <small>({p.reviews.toLocaleString()})</small>}</span>
            )}
            <span className="pcard__price">{p.price}{p.prime && <span className="pcard__prime">✓prime</span>}</span>
            <span className="pcard__buy" aria-hidden="true">View on Amazon</span>
          </div>
        </a>
      ))}
    </div>
  );
}
export default ProductGrid;
