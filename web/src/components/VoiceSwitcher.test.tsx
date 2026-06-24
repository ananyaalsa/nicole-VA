import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { VoiceSwitcher } from './VoiceSwitcher';
import { VOICES } from '../audio/voices';

afterEach(() => {
  cleanup();
});

describe('VoiceSwitcher', () => {
  it('renders one option per voice (8 total)', () => {
    const { getAllByTestId } = render(
      <VoiceSwitcher value="Aoede" onChange={() => {}} />,
    );
    expect(getAllByTestId('voice-option')).toHaveLength(8);
  });

  it('renders every voice name', () => {
    const { getByText } = render(
      <VoiceSwitcher value="Aoede" onChange={() => {}} />,
    );
    for (const v of VOICES) {
      expect(getByText(v.name)).toBeInTheDocument();
    }
  });

  it('fires onChange with the voice name when clicked', () => {
    const onChange = vi.fn();
    const { container } = render(
      <VoiceSwitcher value="Aoede" onChange={onChange} />,
    );
    const charon = container.querySelector(
      '[data-voice="Charon"]',
    ) as HTMLButtonElement;
    expect(charon).not.toBeNull();
    fireEvent.click(charon);
    expect(onChange).toHaveBeenCalledWith('Charon');
  });

  it('marks the active voice', () => {
    const { container } = render(
      <VoiceSwitcher value="Kore" onChange={() => {}} />,
    );
    const active = container.querySelector('[data-active="true"]');
    expect(active).not.toBeNull();
    expect(active?.getAttribute('data-voice')).toBe('Kore');
    expect(active?.getAttribute('aria-pressed')).toBe('true');
  });

  it('groups voices by gender (Female / Male headers)', () => {
    const { getByText } = render(
      <VoiceSwitcher value="Aoede" onChange={() => {}} />,
    );
    expect(getByText('Female')).toBeInTheDocument();
    expect(getByText('Male')).toBeInTheDocument();
  });

  it('does not fire onChange on render', () => {
    const onChange = vi.fn();
    render(<VoiceSwitcher value="Aoede" onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });
});
