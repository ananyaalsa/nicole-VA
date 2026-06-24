// Nicole 2.0 backend entrypoint.
//   - HTTP: GET /health, and the memory API under /api/memory
//   - WS:   /ai-live — the Gemini Live relay (one LiveSession per connection)
// The Gemini API key lives only here, never in the browser.

import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';
import { handleMemoryRoute } from './memory/routes.js';
import { ensureSchema } from './memory/db.js';
import { LiveSession, type ClientChannel, type GenAILike } from './gemini/relay.js';
import type { SessionConfig } from './types.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey }) as unknown as GenAILike;

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, model: config.liveModel }));
    return;
  }

  if (url.pathname.startsWith('/api/memory')) {
    void handleMemoryRoute(req, res).catch((err) => {
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

httpServer.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  if (pathname !== '/ai-live') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => handleAiLive(ws));
});

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

  const session = new LiveSession({ ai, model: config.liveModel, userId: config.userId, client });
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

  ws.on('close', () => session.close());
  ws.on('error', () => session.close());
}

async function main(): Promise<void> {
  // Make sure the nicole2_memory table exists before serving (best-effort).
  try {
    await ensureSchema();
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
