// web/src/canvas/panels/registry.test.tsx
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../integrations/useIntegrations', () => ({ useIntegrations: () => ({ statuses: [
  { id: 'slack', name: 'Slack', description: '', configured: true, connected: false, scopes: [], connectedAt: null },
  { id: 'gmail', name: 'Gmail', description: '', configured: true, connected: true, scopes: [], connectedAt: '2026-01-01' },
], loading: false, error: false, refresh: () => {} }) }));
vi.mock('../../integrations/integrationsApi', () => ({
  connectIntegration: vi.fn().mockResolvedValue({ ok: true }),
  disconnectIntegration: vi.fn().mockResolvedValue({}),
}));
import { render, screen } from '@testing-library/react';
import { PANELS } from './registry';

const P = (type: keyof typeof PANELS, args: Record<string, unknown>) =>
  render(PANELS[type]({ panel: { key: type, type, args }, token: 't', onClose: () => {} }));

describe('PANELS registry', () => {
  it('has all three v2 panel types', () => {
    expect(Object.keys(PANELS).sort()).toEqual(['connect','integrations','note']);
  });
  it('note panel shows its text', () => {
    P('note', { text: 'remember this' });
    expect(screen.getByText('remember this')).toBeInTheDocument();
  });
  it('integrations panel lists providers with connected state', () => {
    P('integrations', {});
    expect(screen.getByText('Slack')).toBeInTheDocument();
    expect(screen.getByText('Gmail')).toBeInTheDocument();
    expect(screen.getByText(/connected/i)).toBeInTheDocument();
  });
  it('connect panel renders via createElement without crashing and shows provider button', async () => {
    const { act } = await import('@testing-library/react');
    vi.useFakeTimers();
    await act(async () => {
      render(PANELS.connect({ panel: { key: 'connect:slack', type: 'connect', args: { provider: 'slack' } }, token: 't', onClose: () => {} }));
    });
    expect(screen.getByText(/connect slack/i)).toBeInTheDocument();
    vi.useRealTimers();
  });
});
