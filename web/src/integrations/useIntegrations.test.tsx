// web/src/integrations/useIntegrations.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const fetchIntegrations = vi.fn();
vi.mock('./integrationsApi', () => ({ fetchIntegrations: (t: string) => fetchIntegrations(t) }));

import { useIntegrations } from './useIntegrations';

beforeEach(() => { fetchIntegrations.mockReset(); });

describe('useIntegrations', () => {
  it('loads statuses on mount', async () => {
    fetchIntegrations.mockResolvedValue([{ id: 'slack', name: 'Slack', description: '', configured: true, connected: false, scopes: [], connectedAt: null }]);
    const { result } = renderHook(() => useIntegrations('tok'));
    await waitFor(() => expect(result.current.statuses).toHaveLength(1));
    expect(result.current.statuses[0].id).toBe('slack');
  });

  it('refetches on the nicole:integrations-updated event', async () => {
    fetchIntegrations.mockResolvedValue([]);
    renderHook(() => useIntegrations('tok'));
    await waitFor(() => expect(fetchIntegrations).toHaveBeenCalledTimes(1));
    act(() => window.dispatchEvent(new Event('nicole:integrations-updated')));
    await waitFor(() => expect(fetchIntegrations).toHaveBeenCalledTimes(2));
  });

  it('sets error=true when the fetch fails', async () => {
    fetchIntegrations.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useIntegrations('tok'));
    await waitFor(() => expect(result.current.error).toBe(true));
  });
});
