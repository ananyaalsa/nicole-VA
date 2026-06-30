import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ token: 'test-token', user: null }) }));

import { MemoryPanel } from './MemoryPanel';

const FACTS = [
  { key: 'user_about', fact: 'Runs a coffee shop', factType: 'preference', source: 'settings' },
  { key: 'biz-1', fact: 'Building an AI sales tool', factType: 'business', source: 'inferred', updatedAt: '2026-06-28T00:00:00Z' },
  { key: 'biz-2', fact: 'Targeting SMB customers', factType: 'business', source: 'inferred', updatedAt: '2026-06-29T00:00:00Z' },
  { key: 'wx-1', fact: 'Lives in Pune', factType: 'weather', source: 'inferred', updatedAt: '2026-06-27T00:00:00Z' },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: { method?: string }) => {
    if (opts?.method === 'DELETE') return { ok: true, json: async () => ({ ok: true }) };
    return { ok: true, json: async () => ({ facts: FACTS }) };
  }) as unknown as typeof fetch);
});
afterEach(() => cleanup());

describe('MemoryPanel', () => {
  it('shows profile facts and learned facts GROUPED by topic', async () => {
    render(<MemoryPanel />);
    // Profile section
    expect(await screen.findByTestId('memory-profile')).toBeInTheDocument();
    expect(screen.getByText('Runs a coffee shop')).toBeInTheDocument();
    // Topic sections (Business + Weather), Business before Weather
    const topics = screen.getAllByTestId('memory-topic');
    const labels = topics.map((t) => t.querySelector('.mem-group__title')?.textContent);
    expect(labels).toContain('Business');
    expect(labels).toContain('Weather');
    expect(labels.indexOf('Business')).toBeLessThan(labels.indexOf('Weather'));
    // Both business facts accumulate under Business
    expect(screen.getByText('Building an AI sales tool')).toBeInTheDocument();
    expect(screen.getByText('Targeting SMB customers')).toBeInTheDocument();
  });

  it('deletes a fact (optimistic) and calls DELETE', async () => {
    const fetchSpy = vi.mocked(fetch);
    render(<MemoryPanel />);
    await screen.findByText('Lives in Pune');
    const card = screen.getByText('Lives in Pune').closest('.mem-card')!;
    fireEvent.click(card.querySelector('.mem-card__delete')!);
    await waitFor(() => expect(screen.queryByText('Lives in Pune')).toBeNull());
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/api/memory/wx-1'), expect.objectContaining({ method: 'DELETE' }));
  });

  it('shows an empty message when nothing is stored', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ facts: [] }) })) as unknown as typeof fetch);
    render(<MemoryPanel />);
    expect(await screen.findByTestId('memory-empty')).toBeInTheDocument();
  });

  it('calls onClose from the close button', async () => {
    const onClose = vi.fn();
    render(<MemoryPanel onClose={onClose} />);
    await screen.findByTestId('memory-profile');
    fireEvent.click(screen.getByTestId('memory-close-button'));
    expect(onClose).toHaveBeenCalled();
  });
});
