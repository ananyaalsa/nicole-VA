// Nicole 2.0 backend entrypoint.
//   - HTTP: GET /health, and the memory API under /api/memory
//   - WS:   /ai-live — the Gemini Live relay (one LiveSession per connection)
// The Gemini API key lives only here, never in the browser.

import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI } from '@google/genai';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { JWT_SECRET } from './auth/middleware.js';
import { handleMemoryRoute } from './memory/routes.js';
import { handleTrainingRoute } from './training/routes.js';
import { handleAuthRoute } from './auth/routes.js';
import { handleSessionRoute } from './session/routes.js';
import { handleIntegrationsRoute } from './integrations/routes.js';
import { handleBriefRoute } from './integrations/briefRoute.js';
import { handleWeatherRoute } from './weather/routes.js';
import { ensureSchema } from './memory/db.js';
import { ensureTrainingSchema } from './training/historyDb.js';
import { ensureAuthSchema } from './auth/migrate.js';
import { ensureIntegrationsSchema } from './integrations/db.js';
import { LiveSession, type ClientChannel, type GenAILike } from './gemini/relay.js';
import { SignalingRooms } from './rtc/signalingRoom.js';
import type { SessionConfig } from './types.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey }) as unknown as GenAILike;

/** Verify a client-supplied JWT and return its userId (sub), or null if invalid. */
function userIdFromToken(token: unknown): string | null {
  if (typeof token !== 'string' || !token) return null;
  try {
    return (jwt.verify(token, JWT_SECRET) as { sub: string }).sub;
  } catch {
    return null;
  }
}

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, model: config.liveModel }));
    return;
  }

  if (url.pathname.startsWith('/api/auth')) {
    void handleAuthRoute(req, res).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    });
    return;
  }

  if (url.pathname.startsWith('/api/memory')) {
    void handleMemoryRoute(req, res).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    });
    return;
  }

  if (url.pathname.startsWith('/api/training')) {
    void handleTrainingRoute(req, res).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    });
    return;
  }

  if (url.pathname.startsWith('/api/session')) {
    void handleSessionRoute(req, res).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    });
    return;
  }

  if (url.pathname.startsWith('/api/integrations')) {
    void handleIntegrationsRoute(req, res).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    });
    return;
  }

  if (url.pathname === '/api/brief') {
    void handleBriefRoute(req, res).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    });
    return;
  }

  if (url.pathname === '/api/weather') {
    void handleWeatherRoute(req, res).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

// WebSocket relay on /ai-live.
const wss = new WebSocketServer({ noServer: true });
// WebRTC signaling on /rtc-signal (phone <-> PC handshake; no media).
const rtcWss = new WebSocketServer({ noServer: true });
const rtcRooms = new SignalingRooms();
let rtcPeerSeq = 0;

httpServer.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  if (pathname === '/ai-live') {
    wss.handleUpgrade(request, socket, head, (ws) => handleAiLive(ws));
  } else if (pathname === '/rtc-signal') {
    rtcWss.handleUpgrade(request, socket, head, (ws) => handleRtcSignal(ws));
  } else {
    socket.destroy();
  }
});

/** One phone/PC peer on the signaling channel. Relays its WebRTC handshake. */
function handleRtcSignal(ws: WebSocket): void {
  const id = `peer-${++rtcPeerSeq}`;
  let room: string | null = null;
  const peer = {
    id,
    send: (m: unknown) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
    },
  };

  ws.on('message', (raw: Buffer) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === 'join' && typeof msg.room === 'string') {
      room = msg.room;
      rtcRooms.join(msg.room, peer);
    } else if (msg.type === 'signal') {
      const r = room;
      if (r) rtcRooms.relay(r, id, msg.payload);
    }
  });

  ws.on('close', () => {
    if (room) rtcRooms.leave(room, id);
  });
  ws.on('error', () => {
    if (room) rtcRooms.leave(room, id);
  });
}

function handleAiLive(ws: WebSocket): void {
  const client: ClientChannel = {
    send: (m) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
    },
    isOpen: () => ws.readyState === WebSocket.OPEN,
    close: () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };

  // The session is created on the connect message, once we know WHICH user this
  // is (derived from the JWT they send) — so the live session runs as them:
  // their memory and their connected integrations. Falls back to the server
  // default user only when no/invalid token is sent (e.g. local dev).
  let session: LiveSession | null = null;
  let connected = false;

  ws.on('message', (raw: Buffer) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'connect' && !connected) {
      connected = true;
      const userId = userIdFromToken(msg.authToken) ?? config.userId;
      session = new LiveSession({ ai, model: config.liveModel, userId, client });
      const cfg: SessionConfig = {
        voiceName: msg.config?.voiceName ?? 'Aoede',
        mode: msg.config?.mode ?? 'talk',
        systemOverlay: msg.config?.systemOverlay,
        stylePrompt: msg.config?.stylePrompt,
      };
      void session.connect(cfg).catch((err) => {
        client.send({ type: 'error', message: String(err?.message ?? err) });
        client.close();
      });
      return;
    }

    // All other messages need an established session.
    if (!session) return;

    if (msg.type === 'client-msg') {
      session.forwardClientMessage(msg.payload);
      return;
    }

    // Silent text directive (e.g. training autostart "[NEW LESSON] begin now").
    if (msg.type === 'client-text' && typeof msg.text === 'string') {
      session.sendText(msg.text);
      return;
    }

    if (msg.type === 'tool-response') {
      session.forwardToolResponse(msg.payload);
      return;
    }

    if (msg.type === 'set-voice' && msg.voiceName) {
      void session.setVoice(msg.voiceName);
      return;
    }
  });

  ws.on('close', () => session?.close());
  ws.on('error', () => session?.close());
}

async function main(): Promise<void> {
  // Make sure the nicole2_memory + nicole2_training_history + nicole2_users tables
  // exist before serving (best-effort).
  try {
    await ensureSchema();
    await ensureTrainingSchema();
    await ensureAuthSchema();
    await ensureIntegrationsSchema();
  } catch (err) {
    console.warn('[server] ensureSchema failed (continuing):', (err as Error).message);
  }
  httpServer.listen(config.port, () => {
    console.log(`[server] Nicole 2.0 backend on http://localhost:${config.port}`);
    console.log(`[server] WS relay:  ws://localhost:${config.port}/ai-live`);
    console.log(`[server] live model: ${config.liveModel}`);
  });
}

void main();
