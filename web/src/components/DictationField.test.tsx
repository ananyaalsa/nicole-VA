import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock the dictation hook so no real mic/session is touched.
const dStart = vi.fn(async () => {});
const dStop = vi.fn();
let dictationState = {
  listening: false,
  text: '',
  start: dStart,
  stop: dStop,
  toggle: vi.fn(),
  reset: vi.fn(),
};
vi.mock('../engine/useDictation', () => ({
  useDictation: () => dictationState,
}));

import { DictationField } from './DictationField';

beforeEach(() => {
  dStart.mockClear();
  dStop.mockClear();
  dictationState = { listening: false, text: '', start: dStart, stop: dStop, toggle: vi.fn(), reset: vi.fn() };
});

describe('DictationField', () => {
  it('renders an editable textarea and fires onChange on typing', () => {
    const onChange = vi.fn();
    render(<DictationField value="" onChange={onChange} placeholder="describe…" />);
    const ta = screen.getByTestId('dictation-input') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'a skeptical CFO' } });
    expect(onChange).toHaveBeenCalledWith('a skeptical CFO');
  });

  it('starts dictation when the mic is pressed', () => {
    render(<DictationField value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId('dictation-mic'));
    expect(dStart).toHaveBeenCalled();
  });

  it('stops dictation when the mic is pressed while listening', () => {
    dictationState = { ...dictationState, listening: true };
    render(<DictationField value="hello" onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId('dictation-mic'));
    expect(dStop).toHaveBeenCalled();
  });

  it('merges live dictation onto the text that was present when the mic started', () => {
    const onChange = vi.fn();
    // Drive the realistic flow: render with typed text, press mic (captures base),
    // then a re-render where dictation is listening with transcript text.
    const { rerender } = render(<DictationField value="a CFO" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('dictation-mic')); // base = 'a CFO'
    dictationState = { ...dictationState, listening: true, text: 'who is busy' };
    rerender(<DictationField value="a CFO" onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith('a CFO who is busy');
  });
});
