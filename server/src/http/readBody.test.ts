import { describe, it, expect } from 'vitest';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { readJsonBody } from './readBody.js';

/** Build a fake IncomingMessage and emit the given chunks on next tick. */
function fakeReq(chunks: Array<Buffer | string>): IncomingMessage {
  const req = new IncomingMessage(new Socket());
  process.nextTick(() => {
    for (const c of chunks) req.emit('data', c);
    req.emit('end');
  });
  return req;
}

describe('readJsonBody', () => {
  it('parses a JSON body delivered as a string chunk', async () => {
    const body = await readJsonBody(fakeReq([JSON.stringify({ a: 1, b: 'x' })]));
    expect(body).toEqual({ a: 1, b: 'x' });
  });

  it('parses a JSON body delivered as Buffer chunks', async () => {
    const body = await readJsonBody(fakeReq([Buffer.from('{"a":'), Buffer.from('2}')]));
    expect(body).toEqual({ a: 2 });
  });

  it('returns {} for an empty body', async () => {
    expect(await readJsonBody(fakeReq([]))).toEqual({});
  });

  it('returns {} for malformed JSON (never throws)', async () => {
    expect(await readJsonBody(fakeReq(['{not json']))).toEqual({});
  });

  it('rejects an over-cap body with {} (DoS guard)', async () => {
    const huge = 'x'.repeat(2000);
    // Cap at 1000 bytes — the body exceeds it, so we get {} not a parsed value.
    const body = await readJsonBody(fakeReq([JSON.stringify({ s: huge })]), 1000);
    expect(body).toEqual({});
  });

  it('accepts a body exactly at the cap', async () => {
    const payload = JSON.stringify({ s: 'y'.repeat(50) });
    const body = await readJsonBody(fakeReq([payload]), Buffer.byteLength(payload));
    expect(body).toEqual({ s: 'y'.repeat(50) });
  });
});
