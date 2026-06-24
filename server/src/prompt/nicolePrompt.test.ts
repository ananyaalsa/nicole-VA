import { describe, it, expect } from 'vitest';
import { NICOLE_BASE_PROMPT, buildSystemPrompt } from './nicolePrompt.js';

describe('NICOLE_BASE_PROMPT', () => {
  it('establishes Nicole identity and the no-Gemini rule', () => {
    expect(NICOLE_BASE_PROMPT).toContain('You are Nicole');
    expect(NICOLE_BASE_PROMPT).toContain('CRITICAL IDENTITY RULE');
    expect(NICOLE_BASE_PROMPT).toMatch(/NOT Gemini/i);
  });

  it('keeps the personality / speech sections', () => {
    expect(NICOLE_BASE_PROMPT).toContain('SPEECH RULES');
    expect(NICOLE_BASE_PROMPT).toContain('VOICE & PERSONALITY');
    expect(NICOLE_BASE_PROMPT).toContain('YOUR VOICE CHARACTER');
    expect(NICOLE_BASE_PROMPT).toContain('HOW REAL HUMANS TALK');
    expect(NICOLE_BASE_PROMPT).toContain('NOISE & BACKGROUND VOICE HANDLING');
  });

  it('mentions the memory tools and proactive remembering', () => {
    expect(NICOLE_BASE_PROMPT).toContain('save_memory');
    expect(NICOLE_BASE_PROMPT).toContain('forget_memory');
    expect(NICOLE_BASE_PROMPT).toMatch(/remember/i);
  });

  it('tells her she can see through the camera and to describe in detail', () => {
    expect(NICOLE_BASE_PROMPT).toContain('CAMERA / VISION');
    expect(NICOLE_BASE_PROMPT).toMatch(/you can see/i);
    expect(NICOLE_BASE_PROMPT).toMatch(/what do you see/i);
    expect(NICOLE_BASE_PROMPT).toMatch(/detail/i);
  });

  it('enables proactive, silent web search', () => {
    expect(NICOLE_BASE_PROMPT).toContain('WEB SEARCH');
    expect(NICOLE_BASE_PROMPT).toMatch(/google search/i);
    expect(NICOLE_BASE_PROMPT).toMatch(/let me google|let me search/i); // names the banned phrases
  });

  it('lets the user direct her delivery / tone (slower, calmer, frustrated, excited)', () => {
    expect(NICOLE_BASE_PROMPT).toContain('VOICE & DELIVERY CONTROL');
    expect(NICOLE_BASE_PROMPT).toMatch(/slow down/i);
    expect(NICOLE_BASE_PROMPT).toMatch(/calm/i);
    expect(NICOLE_BASE_PROMPT).toMatch(/frustrated/i);
    expect(NICOLE_BASE_PROMPT).toMatch(/excited|energetic/i);
  });

  it('strips out all phone / document / persona / premium tooling', () => {
    expect(NICOLE_BASE_PROMPT).not.toContain('make_phone_call');
    expect(NICOLE_BASE_PROMPT).not.toContain('business plan');
    expect(NICOLE_BASE_PROMPT).not.toContain('generate_presentation');
    expect(NICOLE_BASE_PROMPT).not.toContain('switch_persona');
    expect(NICOLE_BASE_PROMPT).not.toContain('toggle_premium_mode');
    expect(NICOLE_BASE_PROMPT).not.toContain('add_session_note');
    expect(NICOLE_BASE_PROMPT).not.toContain('start_camera');
    expect(NICOLE_BASE_PROMPT).not.toContain('get_contacts');
  });
});

describe('buildSystemPrompt', () => {
  it('returns just the base prompt when no options are given', () => {
    const out = buildSystemPrompt({});
    expect(out).toBe(NICOLE_BASE_PROMPT);
    // No injected blocks beyond the base prompt itself.
    expect(out).not.toContain('Things you already know about this user');
    expect(out).not.toContain('Earlier in this conversation');
  });

  it('injects the memory block when provided', () => {
    const out = buildSystemPrompt({
      memoryBlock: '[MEMORY] Things you already know about this user:\n- name: Sam',
    });
    expect(out).toContain(NICOLE_BASE_PROMPT);
    expect(out).toContain('[MEMORY]');
    expect(out).toContain('name: Sam');
  });

  it('injects a [SUMMARY] block when a summary is provided', () => {
    const out = buildSystemPrompt({ summary: 'Sam runs a coffee shop.' });
    expect(out).toContain('[SUMMARY] Earlier in this conversation: Sam runs a coffee shop.');
  });

  it('omits empty memory and summary blocks', () => {
    const out = buildSystemPrompt({ memoryBlock: '', summary: '' });
    expect(out).toBe(NICOLE_BASE_PROMPT);
    expect(out).not.toContain('Earlier in this conversation');
  });

  it('appends the overlay and stylePrompt when present', () => {
    const out = buildSystemPrompt({
      overlay: 'TRAINING OVERLAY: act as a tough prospect.',
      stylePrompt: 'Speak with warm, excited energy.',
    });
    expect(out).toContain('TRAINING OVERLAY: act as a tough prospect.');
    expect(out).toContain('Speak with warm, excited energy.');
  });

  it('orders blocks: base, memory, summary, overlay, style', () => {
    const out = buildSystemPrompt({
      memoryBlock: '[MEMORY] block',
      summary: 'the summary',
      overlay: 'the overlay',
      stylePrompt: 'the style',
    });
    const iBase = out.indexOf('You are Nicole');
    const iMem = out.indexOf('[MEMORY] block');
    const iSum = out.indexOf('the summary');
    const iOverlay = out.indexOf('the overlay');
    const iStyle = out.indexOf('the style');
    expect(iBase).toBeLessThan(iMem);
    expect(iMem).toBeLessThan(iSum);
    expect(iSum).toBeLessThan(iOverlay);
    expect(iOverlay).toBeLessThan(iStyle);
  });
});
