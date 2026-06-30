import { describe, it, expect } from 'vitest';
import { assessTeachingStyle } from './teachingStyle';
import type { TranscriptLine } from '../engine/types';

const you = (text: string): TranscriptLine => ({ id: `y${Math.random()}`, speaker: 'you', text, streaming: false });
const nic = (text: string): TranscriptLine => ({ id: `n${Math.random()}`, speaker: 'nicole', text, streaming: false });

describe('assessTeachingStyle', () => {
  it('defaults to direct with no learner turns', () => {
    expect(assessTeachingStyle([nic('Welcome!')])).toBe('direct');
  });

  it('uses worked_example when the learner is confused', () => {
    expect(assessTeachingStyle([nic('Try a pattern interrupt.'), you("wait, i don't understand")])).toBe('worked_example');
  });

  it('uses worked_example for very terse / one-word answers', () => {
    expect(assessTeachingStyle([you('ok'), you('yeah'), you('sure')])).toBe('worked_example');
  });

  it('uses socratic when the learner asks their own question', () => {
    expect(assessTeachingStyle([you('So how would I handle it if they push back on price right away?')])).toBe('socratic');
  });

  it('uses socratic for substantive, engaged answers', () => {
    expect(assessTeachingStyle([you('I would open by acknowledging their time and then give one sharp reason to keep listening before asking for a small next step')])).toBe('socratic');
  });

  it('uses direct for medium, plain answers', () => {
    expect(assessTeachingStyle([you('I would say hello and introduce myself')])).toBe('direct');
  });
});
