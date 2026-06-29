// AES-256-GCM encryption for OAuth tokens at rest.
//
// The key comes from INTEGRATIONS_ENC_KEY (32 bytes, hex or base64). If it's
// absent we fall back to a key DERIVED from JWT_SECRET so local dev still works
// without extra setup — but production should set a dedicated key (noted in the
// morning checklist). The stored format is `v1:<iv_b64>:<tag_b64>:<ct_b64>`.

import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';

/** Resolve a 32-byte key from env, deriving a stable fallback for dev. */
function resolveKey(): Buffer {
  const raw = process.env.INTEGRATIONS_ENC_KEY;
  if (raw && raw.trim()) {
    // Accept hex (64 chars) or base64; fall back to sha256 of the string.
    if (/^[0-9a-f]{64}$/i.test(raw.trim())) return Buffer.from(raw.trim(), 'hex');
    const b64 = Buffer.from(raw.trim(), 'base64');
    if (b64.length === 32) return b64;
    return crypto.createHash('sha256').update(raw.trim()).digest();
  }
  // Dev fallback: derive from JWT secret so tokens are still encrypted locally.
  const seed = process.env.JWT_SECRET ?? 'nicole-dev-secret';
  return crypto.createHash('sha256').update(`nicole-integrations:${seed}`).digest();
}

const KEY = resolveKey();

/** Encrypt a UTF-8 string → `v1:iv:tag:ciphertext` (all base64). */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/** Decrypt a `v1:...` string back to UTF-8. Throws if tampered or wrong key. */
export function decryptSecret(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Malformed encrypted secret');
  }
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ct = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
