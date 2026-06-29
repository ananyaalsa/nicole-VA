import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DimensionBars, ScoreTrend } from './ResultCharts';

afterEach(() => cleanup());

describe('DimensionBars', () => {
  it('renders one labelled bar per dimension with its score', () => {
    render(<DimensionBars items={[{ label: 'Acknowledge', score: 3, max: 3, band: 'strong' }, { label: 'Explore', score: 1, max: 3, band: 'emerging' }]} />);
    const bars = screen.getByTestId('dimension-bars');
    expect(bars.querySelectorAll('.dimbar')).toHaveLength(2);
    expect(bars.textContent).toContain('Acknowledge');
    expect(bars.textContent).toContain('3/3');
    expect(bars.textContent).toContain('1/3');
  });
});

describe('ScoreTrend', () => {
  it('draws a line with multiple points and labels the latest', () => {
    render(<ScoreTrend points={[4, 6, 7.5]} />);
    const svg = screen.getByTestId('score-trend');
    expect(svg.querySelectorAll('circle')).toHaveLength(3);
    expect(svg.querySelector('.trend-line')).not.toBeNull();
    expect(svg.textContent).toContain('7.5');
  });

  it('handles a single point (no line, one dot)', () => {
    render(<ScoreTrend points={[5]} />);
    const svg = screen.getByTestId('score-trend');
    expect(svg.querySelectorAll('circle')).toHaveLength(1);
    expect(svg.querySelector('.trend-line')).toBeNull();
  });
});
