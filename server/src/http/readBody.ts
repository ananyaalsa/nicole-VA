import type { IncomingMessage } from 'node:http';

/**
 * Read and JSON-parse a request body with a hard size cap.
 *
 * Without a cap, a client can stream an unbounded body and exhaust server memory
 * (a trivial DoS). We abort as soon as the accumulated bytes exceed `maxBytes`,
 * destroy the socket, and resolve `{}` so callers treat it as an empty/invalid
 * body (their field validation then returns a 400). Default cap is 256 KB, which
 * is far above any legitimate JSON payload this API accepts.
 */
export function readJsonBody(
  req: IncomingMessage,
  maxBytes = 256 * 1024,
): Promise<any> {
  return new Promise((resolve) => {
    // Accumulate as a string. Chunks are normally Buffers, but some callers/tests
    // emit strings — coerce so we never throw on Buffer.concat with mixed types.
    let data = '';
    let size = 0;
    let done = false;
    const finish = (value: any) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    req.on('data', (c: Buffer | string) => {
      const chunk = typeof c === 'string' ? c : c.toString('utf8');
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) {
        // Too large — stop reading and drop the connection.
        try { req.destroy(); } catch { /* ignore */ }
        finish({});
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      try { finish(data ? JSON.parse(data) : {}); } catch { finish({}); }
    });
    req.on('error', () => finish({}));
  });
}
