import type { IncomingMessage, ServerResponse } from 'node:http';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'nicole-dev-secret';

export interface AuthedRequest extends IncomingMessage {
  userId: string;
}

export async function requireAuth(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<string | null> {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return null;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    return payload.sub;
  } catch {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid token' }));
    return null;
  }
}

export { JWT_SECRET };
