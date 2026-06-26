import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveRoom } from './LiveRoom';

describe('LiveRoom', () => {
  it('renders the transcript feed and the rail', () => {
    render(
      <LiveRoom
        lines={[{ id: '1', speaker: 'you', text: 'hello' }]}
        realtime={{ you: '', nicole: '' }}
        rail={<div data-testid="rail">RAIL</div>}
      />,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByTestId('rail')).toBeInTheDocument();
    expect(screen.getByTestId('live-room')).toBeInTheDocument();
  });
});
