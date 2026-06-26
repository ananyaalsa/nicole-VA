import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatTranscript } from './ChatTranscript';

describe('ChatTranscript', () => {
  it('renders committed and realtime bubbles with custom labels', () => {
    render(
      <ChatTranscript
        lines={[{ id: '1', speaker: 'you', text: 'hello' }, { id: '2', speaker: 'nicole', text: 'hi' }]}
        realtime={{ you: 'typing', nicole: '' }}
        labels={{ nicole: 'Rep' }}
      />,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
    expect(screen.getByText('typing')).toBeInTheDocument(); // realtime user bubble
    expect(screen.getAllByText('Rep').length).toBeGreaterThan(0); // custom nicole label
  });
});
