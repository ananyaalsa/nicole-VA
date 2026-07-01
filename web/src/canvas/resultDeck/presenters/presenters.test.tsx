import { render, screen } from '@testing-library/react';
import { WeatherCard } from './WeatherCard';
import { NewsCard } from './NewsCard';
import { ProductGrid } from './ProductGrid';

vi.mock('../../../auth/AuthContext', () => ({ useAuth: () => ({ token: 't' }) }));

it('WeatherCard shows temp, place, feels-like', () => {
  render(<WeatherCard payload={{ place: 'Chicago', tempC: 26, feelsC: 30, condition: 'Clear sky', icon: '☀️',
    forecast: [{ date: '2026-07-02', hiC: 37, loC: 25, icon: '⛈️' }] }} />);
  expect(screen.getByText(/26/)).toBeInTheDocument();
  expect(screen.getByText('Chicago')).toBeInTheDocument();
  expect(screen.getByText(/Clear sky/)).toBeInTheDocument();
});

it('NewsCard lists headlines', () => {
  render(<NewsCard payload={{ items: [{ title: 'Big headline', url: 'https://x.com', source: 'x.com' }] }} />);
  expect(screen.getByText('Big headline')).toBeInTheDocument();
});

it('ProductGrid renders a real product card', () => {
  render(<ProductGrid payload={{ query: 'headset', products: [
    { title: 'Sony XM5', price: '$328.00', image: null, rating: 4.6, reviews: 1200, prime: true, url: 'https://a.com/1' }] }} />);
  expect(screen.getByText('Sony XM5')).toBeInTheDocument();
  expect(screen.getByText('$328.00')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /view.*on amazon/i })).toHaveAttribute('href', 'https://a.com/1');
});

it('ProductGrid shows friendly empty state with no products', () => {
  render(<ProductGrid payload={{ query: 'headset', products: [] }} />);
  expect(screen.getByText(/no products/i)).toBeInTheDocument();
});
