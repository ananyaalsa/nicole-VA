import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// The 3D avatar mounts a WebGL canvas jsdom can't run — stub it for the smoke test.
vi.mock('./avatar3d/SophiaAvatar', () => ({
  default: () => <div data-testid="sophia-avatar" />,
}));

import App from './App';

describe('App smoke test', () => {
  it('renders the Nicole heading', () => {
    render(<App />);
    expect(screen.getByText('Nicole')).toBeInTheDocument();
  });
});
