import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('config', () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('defaults the live model to gemini-3.1-flash-live-preview', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.DATABASE_URL = 'postgres://x';
    delete process.env.GEMINI_LIVE_MODEL;
    const { config } = await import('./config.js');
    expect(config.liveModel).toBe('gemini-3.1-flash-live-preview');
  });

  it('defaults the summarizer model to gemini-2.5-flash', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.DATABASE_URL = 'postgres://x';
    delete process.env.GEMINI_SUMMARIZER_MODEL;
    const { config } = await import('./config.js');
    expect(config.summarizerModel).toBe('gemini-2.5-flash');
  });

  it('throws when GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.DATABASE_URL = 'postgres://x';
    await expect(import('./config.js')).rejects.toThrow(/GEMINI_API_KEY/);
  });
});
