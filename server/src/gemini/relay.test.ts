import { describe, it, expect, beforeEach, vi } from 'vitest';

// Config loads at import of modules that pull it transitively; satisfy it.
process.env.GEMINI_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://x';

import { LiveSession, isTerminalClose, type GenAILike, type ClientChannel, type LiveCallbacks } from './relay.js';
import type { SessionConfig } from '../types.js';

/** A fake Gemini that lets a test drive the live callbacks. */
function makeFakeAI() {
  const sessions: Array<{
    callbacks: LiveCallbacks;
    config: Record<string, unknown>;
    closed: boolean;
    sendRealtimeInput: ReturnType<typeof vi.fn>;
    sendToolResponse: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  const ai: GenAILike = {
    live: {
      connect: vi.fn(async ({ config, callbacks }) => {
        const s = {
          callbacks,
          config,
          closed: false,
          sendRealtimeInput: vi.fn(),
          sendToolResponse: vi.fn(),
          close: vi.fn(function (this: any) {
            this.closed = true;
          }),
        };
        sessions.push(s);
        // Simulate the server opening.
        callbacks.onopen?.();
        return s as any;
      }),
    },
  };
  return { ai, sessions };
}

function makeClient() {
  const sent: any[] = [];
  let open = true;
  const client: ClientChannel = {
    send: (m) => sent.push(m),
    isOpen: () => open,
    close: () => {
      open = false;
    },
  };
  return { client, sent, setOpen: (v: boolean) => (open = v) };
}

const CFG: SessionConfig = { voiceName: 'Aoede', mode: 'talk' };

let clock = 0;
const now = () => clock;

beforeEach(() => {
  clock = 1_000_000;
});

describe('isTerminalClose', () => {
  it('is true for 1011 billing/quota reasons', () => {
    expect(isTerminalClose(1011, 'monthly spending cap exceeded')).toBe(true);
    expect(isTerminalClose(1011, 'quota exceeded')).toBe(true);
  });
  it('is false for a bare 1011 rotation', () => {
    expect(isTerminalClose(1011, 'server rotation')).toBe(false);
  });
  it('is false for normal close codes', () => {
    expect(isTerminalClose(1000, 'normal')).toBe(false);
    expect(isTerminalClose(undefined, '')).toBe(false);
  });
});

describe('LiveSession.connect', () => {
  it('opens a Gemini session and sends ready to the client', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client, sent } = makeClient();
    const ls = new LiveSession({
      ai, model: 'm', userId: 'u', client, now,
      loadUserFacts: async () => [],
    });
    await ls.connect(CFG);
    expect(sessions).toHaveLength(1);
    // voice threaded into config
    const cfg: any = sessions[0].config;
    expect(cfg.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede');
    expect(sent).toContainEqual({ type: 'ready' });
    ls.close();
  });
});

describe('LiveSession message relay + transcripts', () => {
  it('relays Gemini messages to the client and records turns on turnComplete', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client, sent } = makeClient();
    const ls = new LiveSession({ ai, model: 'm', userId: 'u', client, now, loadUserFacts: async () => [] });
    await ls.connect(CFG);
    const cb = sessions[0].callbacks;
    cb.onmessage?.({ serverContent: { inputTranscription: { text: 'hello there' } } });
    cb.onmessage?.({ serverContent: { outputTranscription: { text: 'hey you!' } } });
    cb.onmessage?.({ serverContent: { turnComplete: true } });
    // relayed
    expect(sent.some((m) => m.type === 'message')).toBe(true);
    // turns recorded
    const turns = ls.getTurns();
    expect(turns).toEqual([
      { role: 'user', text: 'hello there' },
      { role: 'nicole', text: 'hey you!' },
    ]);
    ls.close();
  });

  it('captures a session-resumption handle from updates', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client } = makeClient();
    const ls = new LiveSession({ ai, model: 'm', userId: 'u', client, now, loadUserFacts: async () => [] });
    await ls.connect(CFG);
    sessions[0].callbacks.onmessage?.({ sessionResumptionUpdate: { newHandle: 'H1', resumable: true } });
    // Drop → reconnect should reuse the handle.
    sessions[0].callbacks.onclose?.({ code: 1000, reason: 'rotation' });
    await Promise.resolve();
    await Promise.resolve();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    const reCfg: any = sessions[sessions.length - 1].config;
    expect(reCfg.sessionResumption).toEqual({ handle: 'H1' });
    ls.close();
  });
});

describe('LiveSession auto-reconnect', () => {
  it('reconnects on a non-terminal close and tells the client it is reconnecting', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client, sent } = makeClient();
    const ls = new LiveSession({ ai, model: 'm', userId: 'u', client, now, loadUserFacts: async () => [] });
    await ls.connect(CFG);
    sessions[0].callbacks.onclose?.({ code: 1006, reason: 'network blip' });
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toContainEqual({ type: 'reconnecting' });
    expect(sessions.length).toBe(2);
    ls.close();
  });

  it('does NOT reconnect on a terminal billing close; relays + closes client', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client, sent } = makeClient();
    const ls = new LiveSession({ ai, model: 'm', userId: 'u', client, now, loadUserFacts: async () => [] });
    await ls.connect(CFG);
    sessions[0].callbacks.onclose?.({ code: 1011, reason: 'monthly spending cap exceeded' });
    await Promise.resolve();
    expect(sent.some((m) => m.type === 'gemini-close')).toBe(true);
    expect(sessions.length).toBe(1); // no reconnect
    ls.close();
  });
});

describe('LiveSession live summarization', () => {
  it('summarizes and reconnects (seeded with [SUMMARY]) when the buffer grows', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client } = makeClient();
    const summarize = vi.fn(async () => 'they discussed launch plans');
    const ls = new LiveSession({
      ai, model: 'm', userId: 'u', client, now,
      loadUserFacts: async () => [],
      summarize,
    });
    await ls.connect(CFG);
    const cb = sessions[0].callbacks;
    // Push 41 turns (over the 40-turn threshold) via transcripts + turnComplete.
    for (let i = 0; i < 41; i++) {
      cb.onmessage?.({ serverContent: { inputTranscription: { text: `line ${i}` } } });
      cb.onmessage?.({ serverContent: { turnComplete: true } });
    }
    // allow the async summarize+reconnect to settle
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(summarize).toHaveBeenCalled();
    // A reconnect happened and the new config carries the [SUMMARY] block.
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    const lastCfg: any = sessions[sessions.length - 1].config;
    expect(String(lastCfg.systemInstruction)).toContain('they discussed launch plans');
    // Buffer trimmed to the kept tail (<= 8).
    expect(ls.getTurns().length).toBeLessThanOrEqual(8);
    ls.close();
  });
});

describe('LiveSession memory tool dispatch', () => {
  it('routes save_memory tool calls to the handler and acks Gemini', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client } = makeClient();
    const onMemoryTool = vi.fn(async () => ({ ok: true }));
    const ls = new LiveSession({
      ai, model: 'm', userId: 'u', client, now,
      loadUserFacts: async () => [],
      onMemoryTool,
    });
    await ls.connect(CFG);
    sessions[0].callbacks.onmessage?.({
      toolCall: { functionCalls: [{ id: '1', name: 'save_memory', args: { fact: 'Gaurav runs Alsatronix' } }] },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(onMemoryTool).toHaveBeenCalledWith('save_memory', { fact: 'Gaurav runs Alsatronix' }, 'u');
    expect(sessions[0].sendToolResponse).toHaveBeenCalled();
    ls.close();
  });
});

describe('LiveSession.sendText (autostart directive)', () => {
  it('sends a text turn via sendClientContent', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client } = makeClient();
    // augment the fake session with sendClientContent
    const ls = new LiveSession({ ai, model: 'm', userId: 'u', client, now, loadUserFacts: async () => [] });
    await ls.connect(CFG);
    const s: any = sessions[0];
    s.sendClientContent = vi.fn();
    ls.sendText('[NEW LESSON] begin now');
    expect(s.sendClientContent).toHaveBeenCalledWith({
      turns: [{ role: 'user', parts: [{ text: '[NEW LESSON] begin now' }] }],
      turnComplete: true,
    });
    ls.close();
  });

  it('is a no-op for empty text', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client } = makeClient();
    const ls = new LiveSession({ ai, model: 'm', userId: 'u', client, now, loadUserFacts: async () => [] });
    await ls.connect(CFG);
    const s: any = sessions[0];
    s.sendClientContent = vi.fn();
    ls.sendText('');
    expect(s.sendClientContent).not.toHaveBeenCalled();
    ls.close();
  });
});

describe('LiveSession setVoice', () => {
  it('reconnects with the new voice', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client } = makeClient();
    const ls = new LiveSession({ ai, model: 'm', userId: 'u', client, now, loadUserFacts: async () => [] });
    await ls.connect(CFG);
    await ls.setVoice('Charon');
    const cfg: any = sessions[sessions.length - 1].config;
    expect(cfg.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Charon');
    ls.close();
  });
});

describe('LiveSession.close', () => {
  it('closes the Gemini session and is idempotent', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client } = makeClient();
    const ls = new LiveSession({ ai, model: 'm', userId: 'u', client, now, loadUserFacts: async () => [] });
    await ls.connect(CFG);
    ls.close();
    expect(sessions[0].close).toHaveBeenCalled();
    // A close after close must not reconnect.
    sessions[0].callbacks.onclose?.({ code: 1006, reason: 'late' });
    await Promise.resolve();
    expect(sessions.length).toBe(1);
  });
});
