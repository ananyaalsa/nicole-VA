import { describe, it, expect, beforeEach, vi } from 'vitest';

// Config loads at import of modules that pull it transitively; satisfy it.
process.env.GEMINI_API_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://x';

// The activity digest hits the training-history DB; stub it so relay reconnect
// tests don't touch Postgres.
vi.mock('../memory/activityDigest.js', () => ({ buildActivityDigest: async () => [] }));

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

/** Pump several microtask ticks so async reconnect/buildConfig chains settle
 *  regardless of how many awaits they contain. */
async function flushMicrotasks(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

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
      loadUserFacts: async () => [], loadDisplayName: async () => null, loadLiveStatus: async () => null,
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
    const ls = new LiveSession({ ai, model: 'm', userId: 'u', client, now, loadUserFacts: async () => [], loadDisplayName: async () => null, loadLiveStatus: async () => null });
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

  it('keeps the conversation language across a voice-change reconnect', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client } = makeClient();
    const ls = new LiveSession({ ai, model: 'm', userId: 'u', client, now, loadUserFacts: async () => [], loadDisplayName: async () => null, loadLiveStatus: async () => null });
    await ls.connect(CFG);
    const cb = sessions[0].callbacks;
    // The conversation switches to Hindi (romanized, as STT delivers it).
    cb.onmessage?.({ serverContent: { inputTranscription: { text: 'chalo Hindi mein baat karte hain' } } });
    cb.onmessage?.({ serverContent: { outputTranscription: { text: 'Haan bilkul, main aapki madad kar sakti hoon' } } });
    cb.onmessage?.({ serverContent: { turnComplete: true } });
    // The first config (before the switch) carries no language anchor.
    expect(String(sessions[0].config.systemInstruction)).not.toContain('[LANGUAGE]');
    // Now the user changes the VOICE — this reconnects with a new session.
    await ls.setVoice('Leda');
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    const newSys = String(sessions[sessions.length - 1].config.systemInstruction);
    // The rebuilt prompt re-anchors Hindi so the next reply won't revert to English.
    expect(newSys).toContain('[LANGUAGE]');
    expect(newSys).toContain('Hindi');
    ls.close();
  });

  it('captures a session-resumption handle from updates', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client } = makeClient();
    const ls = new LiveSession({ ai, model: 'm', userId: 'u', client, now, loadUserFacts: async () => [], loadDisplayName: async () => null, loadLiveStatus: async () => null });
    await ls.connect(CFG);
    sessions[0].callbacks.onmessage?.({ sessionResumptionUpdate: { newHandle: 'H1', resumable: true } });
    // Drop → reconnect should reuse the handle.
    sessions[0].callbacks.onclose?.({ code: 1000, reason: 'rotation' });
    await flushMicrotasks();
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
    const ls = new LiveSession({ ai, model: 'm', userId: 'u', client, now, loadUserFacts: async () => [], loadDisplayName: async () => null, loadLiveStatus: async () => null });
    await ls.connect(CFG);
    sessions[0].callbacks.onclose?.({ code: 1006, reason: 'network blip' });
    await flushMicrotasks();
    expect(sent).toContainEqual({ type: 'reconnecting' });
    expect(sessions.length).toBe(2);
    ls.close();
  });

  it('does NOT reconnect on a terminal billing close; relays + closes client', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client, sent } = makeClient();
    const ls = new LiveSession({ ai, model: 'm', userId: 'u', client, now, loadUserFacts: async () => [], loadDisplayName: async () => null, loadLiveStatus: async () => null });
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
      loadUserFacts: async () => [], loadDisplayName: async () => null, loadLiveStatus: async () => null,
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
    await flushMicrotasks();
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
      loadUserFacts: async () => [], loadDisplayName: async () => null, loadLiveStatus: async () => null,
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

describe('LiveSession memory_disabled (global memory OFF)', () => {
  it('drops every stored fact from the prompt when memory_disabled is set', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client } = makeClient();
    const ls = new LiveSession({
      ai, model: 'm', userId: 'u', client, now,
      // The user has facts AND the off-flag. Off must win: no fact text leaks.
      loadUserFacts: async () => [
        { key: 'memory_disabled', fact: 'off', factType: 'setting', userId: 'u', source: 'settings' },
        { key: 'home_city', fact: 'Lives in Zorbathania', factType: 'identity', userId: 'u', source: 'settings' },
        { key: 'fav_team', fact: 'Supports Quibblewick FC', factType: 'preference', userId: 'u', source: 'inferred' },
      ],
      loadDisplayName: async () => null, loadLiveStatus: async () => null,
    });
    await ls.connect(CFG);
    const sys = String(sessions[0].config.systemInstruction);
    expect(sys).not.toContain('Zorbathania');
    expect(sys).not.toContain('Quibblewick');
    // The flag itself must never appear as a fact, either.
    expect(sys).not.toContain('memory_disabled');
    ls.close();
  });

  it('uses stored facts normally when memory_disabled is absent', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client } = makeClient();
    const ls = new LiveSession({
      ai, model: 'm', userId: 'u', client, now,
      loadUserFacts: async () => [
        { key: 'home_city', fact: 'Lives in Zorbathania', factType: 'identity', userId: 'u', source: 'settings' },
      ],
      loadDisplayName: async () => null, loadLiveStatus: async () => null,
    });
    await ls.connect(CFG);
    expect(String(sessions[0].config.systemInstruction)).toContain('Zorbathania');
    ls.close();
  });
});

describe('LiveSession.sendText (autostart directive)', () => {
  it('sends a text turn via sendClientContent', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client } = makeClient();
    // augment the fake session with sendClientContent
    const ls = new LiveSession({ ai, model: 'm', userId: 'u', client, now, loadUserFacts: async () => [], loadDisplayName: async () => null, loadLiveStatus: async () => null });
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
    const ls = new LiveSession({ ai, model: 'm', userId: 'u', client, now, loadUserFacts: async () => [], loadDisplayName: async () => null, loadLiveStatus: async () => null });
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
    const ls = new LiveSession({ ai, model: 'm', userId: 'u', client, now, loadUserFacts: async () => [], loadDisplayName: async () => null, loadLiveStatus: async () => null });
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
    const ls = new LiveSession({ ai, model: 'm', userId: 'u', client, now, loadUserFacts: async () => [], loadDisplayName: async () => null, loadLiveStatus: async () => null });
    await ls.connect(CFG);
    ls.close();
    expect(sessions[0].close).toHaveBeenCalled();
    // A close after close must not reconnect.
    sessions[0].callbacks.onclose?.({ code: 1006, reason: 'late' });
    await Promise.resolve();
    expect(sessions.length).toBe(1);
  });
});

describe('LiveSession result-tool dispatch (search_products)', () => {
  it('runs the injected searchProducts and sends a data-carrying tool-result to the browser', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client, sent } = makeClient();
    const searchProducts = vi.fn(async () => ({
      blocked: false,
      products: [
        { title: 'Sony XM5', price: '$328.00', image: null, rating: 4.6, reviews: 12, prime: true, url: 'https://a.com/1' },
      ],
    }));
    const ls = new LiveSession({
      ai, model: 'm', userId: 'u', client, now,
      loadUserFacts: async () => [], loadDisplayName: async () => null, loadLiveStatus: async () => null,
      searchProducts: searchProducts as any,
    });
    await ls.connect(CFG);
    sessions[0].callbacks.onmessage?.({
      toolCall: { functionCalls: [{ id: '1', name: 'search_products', args: { query: 'headset' } }] },
    });
    await flushMicrotasks();
    expect(searchProducts).toHaveBeenCalledWith('headset', { limit: 5 });
    expect(sessions[0].sendToolResponse).toHaveBeenCalled();
    const toolResult = sent.find((m) => m.type === 'tool-result' && m.name === 'search_products');
    expect(toolResult).toBeTruthy();
    expect(toolResult.ok).toBe(true);
    expect(toolResult.data.kind).toBe('products');
    expect(toolResult.data.payload.products[0].title).toBe('Sony XM5');
    ls.close();
  });

  it('sends NO data on an empty (non-blocked) product result so no empty overlay opens (fix I)', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client, sent } = makeClient();
    // The scrape SUCCEEDS but returns zero products — not blocked, just empty.
    const searchProducts = vi.fn(async () => ({ blocked: false, products: [] }));
    const ls = new LiveSession({
      ai, model: 'm', userId: 'u', client, now,
      loadUserFacts: async () => [], loadDisplayName: async () => null, loadLiveStatus: async () => null,
      searchProducts: searchProducts as any,
    });
    await ls.connect(CFG);
    sessions[0].callbacks.onmessage?.({
      toolCall: { functionCalls: [{ id: '1', name: 'search_products', args: { query: 'unobtainium' } }] },
    });
    await flushMicrotasks();
    const toolResult = sent.find((m) => m.type === 'tool-result' && m.name === 'search_products');
    expect(toolResult).toBeTruthy();
    expect(toolResult.ok).toBe(false);
    // No `data` → the client never opens an empty products overlay; Nicole speaks
    // the "No products found — want me to try again?" summary instead.
    expect(toolResult.data).toBeUndefined();
    ls.close();
  });
});

describe('LiveSession result-tool dispatch (web_search)', () => {
  it('maps presentation "links" → deck kind "search" (fix C)', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client, sent } = makeClient();
    const ls = new LiveSession({
      ai, model: 'm', userId: 'u', client, now,
      loadUserFacts: async () => [], loadDisplayName: async () => null, loadLiveStatus: async () => null,
    });
    await ls.connect(CFG);
    sessions[0].callbacks.onmessage?.({
      toolCall: { functionCalls: [{ id: '1', name: 'web_search', args: { query: 'best laptops', presentation: 'links' } }] },
    });
    await flushMicrotasks();
    const toolResult = sent.find((m) => m.type === 'tool-result' && m.name === 'web_search');
    expect(toolResult).toBeTruthy();
    expect(toolResult.ok).toBe(true);
    // Server maps the model-facing 'links' presentation to the client deck kind
    // 'search' (the client never branches on 'links' → results were dropped).
    expect(toolResult.data.kind).toBe('search');
    // Neutral summary — no false "on your screen" claim (fix B).
    expect(toolResult.summary.toLowerCase()).not.toContain('on your screen');
    ls.close();
  });

  it('maps presentation "news" → deck kind "news"', async () => {
    const { ai, sessions } = makeFakeAI();
    const { client, sent } = makeClient();
    const ls = new LiveSession({
      ai, model: 'm', userId: 'u', client, now,
      loadUserFacts: async () => [], loadDisplayName: async () => null, loadLiveStatus: async () => null,
    });
    await ls.connect(CFG);
    sessions[0].callbacks.onmessage?.({
      toolCall: { functionCalls: [{ id: '1', name: 'web_search', args: { query: 'today headlines', presentation: 'news' } }] },
    });
    await flushMicrotasks();
    const toolResult = sent.find((m) => m.type === 'tool-result' && m.name === 'web_search');
    expect(toolResult.data.kind).toBe('news');
    ls.close();
  });
});

describe('tool declarations', () => {
  it('declares training_mark_progress to Gemini', async () => {
    // buildConfig is private; assert via the declarations export instead.
    const { TRAINING_TOOL_DECLS } = await import('./uiControlTools.js');
    expect(TRAINING_TOOL_DECLS.some((d) => d.name === 'training_mark_progress')).toBe(true);
  });
});
