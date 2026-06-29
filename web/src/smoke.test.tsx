import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The 3D avatar mounts a WebGL canvas jsdom can't run — stub it for the smoke test.
vi.mock('./avatar3d/SophiaAvatar', () => ({
  default: () => <div data-testid="sophia-avatar" />,
}));

import App from './App';

// On mount AuthProvider probes /api/auth/refresh (the httpOnly-cookie session
// restore). Stub it to reject → logged out → the AuthScreen (with the "Nicole"
// heading) renders. Without a stub the provider would hang on the loading spinner.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no session'); }) as unknown as typeof fetch);
  localStorage.clear();
});

describe('App smoke test', () => {
  it('renders the Nicole heading once the auth check settles', async () => {
    render(<App />);
    expect(await screen.findByText('Nicole')).toBeInTheDocument();
  });
});
