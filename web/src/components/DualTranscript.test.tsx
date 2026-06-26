import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DualTranscript } from './DualTranscript';

describe('DualTranscript', () => {
  it('renders each speaker in its own lane with a data-speaker marker', () => {
    render(
      <DualTranscript
        repLabel="Marcus"
        lines={[
          { speaker: 'rep', text: 'Why should I care?' },
          { speaker: 'you', text: 'Because it saves you time.' },
          { speaker: 'nicole', text: 'Good pivot.' },
        ]}
      />,
    );
    expect(screen.getByText('Why should I care?').closest('[data-speaker="rep"]')).not.toBeNull();
    expect(screen.getByText('Because it saves you time.').closest('[data-speaker="you"]')).not.toBeNull();
    expect(screen.getByText('Good pivot.').closest('[data-speaker="nicole"]')).not.toBeNull();
    expect(screen.getAllByText('Marcus').length).toBeGreaterThan(0);
  });
});
