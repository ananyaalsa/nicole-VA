export type ResultKind = 'weather' | 'news' | 'search' | 'products';

export interface WeatherPayload {
  place: string; tempC: number; feelsC: number; condition: string; icon: string;
  forecast: { date: string; hiC: number; loC: number; icon: string }[];
}
export interface NewsItem { title: string; url: string; source: string; }
export interface NewsPayload { items: NewsItem[]; }
export interface SearchResult { url: string; title: string; }
export interface SearchPayload { results: SearchResult[]; }
export interface Product {
  title: string; price: string; image: string | null;
  rating: number | null; reviews: number | null; prime: boolean; url: string;
}
export interface ProductsPayload { query: string; products: Product[]; }

export type ResultPayload = WeatherPayload | NewsPayload | SearchPayload | ProductsPayload;

export interface ResultItem {
  id: string; kind: ResultKind; payload: ResultPayload;
  label: string; icon: string; state: 'overlay' | 'pill';
}
export interface ResultMeta { label: string; icon: string; }
