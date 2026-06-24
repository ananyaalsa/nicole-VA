import { describe, it, expect } from 'vitest';
import {
  floatTo16BitPCM,
  int16ToFloat32,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from './pcm';

describe('floatTo16BitPCM / int16ToFloat32', () => {
  it('round-trips representative values within tolerance', () => {
    const input = new Float32Array([0.0, 0.5, -0.5, 1.0, -1.0]);
    const pcm = floatTo16BitPCM(input);
    const back = int16ToFloat32(pcm);

    // Tolerance accounts for int16 quantization (~1/32768).
    const tol = 1e-4;
    for (let i = 0; i < input.length; i++) {
      expect(Math.abs(back[i] - input[i])).toBeLessThan(tol);
    }
  });

  it('maps boundary values to expected int16 values', () => {
    const pcm = floatTo16BitPCM(new Float32Array([0.0, 1.0, -1.0]));
    expect(pcm[0]).toBe(0);
    expect(pcm[1]).toBe(0x7fff); // 32767
    expect(pcm[2]).toBe(-0x8000); // -32768
  });

  it('clamps out-of-range input', () => {
    const pcm = floatTo16BitPCM(new Float32Array([2.0, -2.0, 1.5, -1.5]));
    expect(pcm[0]).toBe(0x7fff);
    expect(pcm[1]).toBe(-0x8000);
    expect(pcm[2]).toBe(0x7fff);
    expect(pcm[3]).toBe(-0x8000);
  });

  it('int16ToFloat32 divides by 0x8000', () => {
    const f = int16ToFloat32(new Int16Array([0, -32768, 16384]));
    expect(f[0]).toBe(0);
    expect(f[1]).toBe(-1);
    expect(f[2]).toBeCloseTo(0.5, 5);
  });
});

describe('arrayBufferToBase64 / base64ToArrayBuffer', () => {
  it('round-trips a known byte sequence', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 254, 255, 128, 127]);
    const b64 = arrayBufferToBase64(bytes.buffer);
    const out = new Uint8Array(base64ToArrayBuffer(b64));
    expect(Array.from(out)).toEqual(Array.from(bytes));
  });

  it('encodes a known string to expected base64', () => {
    // "Man" -> "TWFu"
    const bytes = new Uint8Array([0x4d, 0x61, 0x6e]);
    expect(arrayBufferToBase64(bytes.buffer)).toBe('TWFu');
  });

  it('round-trips a large buffer (exceeds chunk size)', () => {
    const n = 0x8000 * 2 + 123; // larger than CHUNK_SIZE
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = i & 0xff;
    const b64 = arrayBufferToBase64(bytes.buffer);
    const out = new Uint8Array(base64ToArrayBuffer(b64));
    expect(out.length).toBe(n);
    expect(Array.from(out.subarray(0, 10))).toEqual(
      Array.from(bytes.subarray(0, 10)),
    );
    expect(out[n - 1]).toBe(bytes[n - 1]);
  });

  it('round-trips an empty buffer', () => {
    const b64 = arrayBufferToBase64(new ArrayBuffer(0));
    expect(b64).toBe('');
    expect(new Uint8Array(base64ToArrayBuffer(b64)).length).toBe(0);
  });
});
