/**
 * Pure audio conversion utilities for PCM data and base64 transport.
 * No DOM / Node dependencies beyond btoa/atob (available in browsers and jsdom).
 */

/**
 * Convert a Float32Array of audio samples in the range [-1, 1] to 16-bit PCM.
 * Out-of-range values are clamped. Negative values scale by 0x8000 (32768),
 * positive values scale by 0x7FFF (32767), preserving full int16 range.
 */
export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    let s = input[i];
    // clamp to [-1, 1]
    if (s > 1) s = 1;
    else if (s < -1) s = -1;
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

/**
 * Convert a 16-bit PCM Int16Array back to Float32Array in the range [-1, 1].
 * Divides by 0x8000 (32768) so int16 min (-32768) maps to exactly -1.
 */
export function int16ToFloat32(input: Int16Array): Float32Array {
  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    output[i] = input[i] / 0x8000;
  }
  return output;
}

// Process the binary string in chunks to avoid call-stack overflow from
// String.fromCharCode.apply on very large buffers.
const CHUNK_SIZE = 0x8000; // 32768 bytes per chunk

/**
 * Convert an ArrayBuffer to a base64 string using a chunked binary string.
 */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Convert a base64 string back to an ArrayBuffer.
 */
export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
