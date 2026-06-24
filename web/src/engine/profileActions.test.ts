import { describe, it, expect } from 'vitest';
import { mergeGoal } from './profileActions';

describe('mergeGoal', () => {
  it('adds a new goal', () => {
    expect(mergeGoal(['Cold calling'], 'add', 'Closing techniques')).toEqual([
      'Cold calling',
      'Closing techniques',
    ]);
  });

  it('does not duplicate an existing goal (case-insensitive)', () => {
    expect(mergeGoal(['Cold calling'], 'add', 'cold calling')).toEqual(['Cold calling']);
  });

  it('removes a goal (case-insensitive)', () => {
    expect(mergeGoal(['Cold calling', 'Closing techniques'], 'remove', 'cold calling')).toEqual([
      'Closing techniques',
    ]);
  });

  it('removing a non-present goal is a no-op', () => {
    expect(mergeGoal(['Cold calling'], 'remove', 'Interview prep')).toEqual(['Cold calling']);
  });

  it('ignores blank goals', () => {
    expect(mergeGoal(['Cold calling'], 'add', '   ')).toEqual(['Cold calling']);
  });
});
