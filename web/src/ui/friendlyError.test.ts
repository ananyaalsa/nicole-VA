// web/src/ui/friendlyError.test.ts
import { describe, it, expect } from 'vitest';
import { friendlyError } from './friendlyError';

describe('friendlyError', () => {
  it('names the provider for a connect failure and offers a retry', () => {
    const msg = friendlyError('connect', 'Slack');
    expect(msg).toBe("Couldn't connect Slack — want to try again?");
  });
  it('gives a short integrations-load message', () => {
    expect(friendlyError('integrations_load')).toBe("Couldn't load your integrations. Retry?");
  });
  it('gives a short generic action message', () => {
    expect(friendlyError('action')).toBe("That didn't go through. Try once more?");
  });
  it('every message is short (<= 8 words) and has no error codes', () => {
    for (const kind of ['connect','integrations_load','action','weather','search','generic'] as const) {
      const m = friendlyError(kind, 'X');
      expect(m.split(/\s+/).length).toBeLessThanOrEqual(8);
      expect(m).not.toMatch(/error:|http|\b\d{3}\b|undefined/i);
    }
  });
});
