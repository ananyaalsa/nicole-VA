import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseAmazonHtml } from './amazonScraper.js';

const dir = dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => readFileSync(join(dir, 'fixtures', n), 'utf8');

describe('parseAmazonHtml', () => {
  it('parses product tiles into structured products', () => {
    const { blocked, products } = parseAmazonHtml(fx('amazon-headsets.html'));
    expect(blocked).toBe(false);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      title: 'Sony WH-1000XM5 Wireless Headphones',
      price: '$328.00', rating: 4.6, reviews: 12431, prime: true,
      image: 'https://m.media-amazon.com/img/A1.jpg',
    });
    expect(products[0].url).toContain('/dp/A1');
    expect(products[1]).toMatchObject({ price: '$79.99', prime: false, rating: 4.4, reviews: 21067 });
  });

  it('detects a robot/CAPTCHA page as blocked', () => {
    const { blocked, products } = parseAmazonHtml(fx('amazon-blocked.html'));
    expect(blocked).toBe(true);
    expect(products).toHaveLength(0);
  });
});
