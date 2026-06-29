// HTTP API for managing integrations, under /api/integrations.
//
//   GET  /api/integrations            -> list every provider + connected/configured state
//   GET  /api/integrations/:id/connect-> 302 to the provider's OAuth consent (auth required)
//   GET  /api/integrations/callback   -> OAuth redirect target: exchange code, store, bounce to app
//   POST /api/integrations/:id/disconnect -> remove the connection (auth required)
//
// The connect route is hit by the browser as a top-level navigation (it's a
// redirect to the provider), so it accepts the JWT via ?token= as well as the
// Authorization header. The callback is stateless and trusts the signed state.

import type { IncomingMessage, ServerResponse } from 'node:http';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { JWT_SECRET, requireAuth } from '../auth/middleware.js';
import { allAdapters, getAdapter } from './registry.js';
import { signState, verifyState } from './oauthState.js';
import {
  listConnections,
  saveConnection,
  deleteConnection,
  type ProviderId,
} from './db.js';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': config.frontendUrl,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(JSON.stringify(body));
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

/**
 * After the OAuth exchange, send the popup to the frontend's static bridge page
 * (SAME origin as the app — so it can use BroadcastChannel/localStorage, which
 * survive the Cross-Origin-Opener-Policy that the provider's pages set and that
 * otherwise nulls window.opener). The bridge broadcasts the result to the main
 * window — which flips the card to "Connected" in place, no reload — and closes.
 */
function sendCallbackBridge(res: ServerResponse, status: string): void {
  redirect(res, `${config.frontendUrl}/oauth-bridge.html?integration=${encodeURIComponent(status)}`);
}

/** The OAuth redirect URI for a provider (must match the developer console). */
function redirectUri(): string {
  return `${config.serverUrl}/api/integrations/callback`;
}

/** Resolve a userId from Authorization header OR ?token= (for top-level redirects). */
function userIdFromRequest(req: IncomingMessage, url: URL): string | null {
  const header = req.headers.authorization ?? '';
  const headerToken = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = headerToken ?? url.searchParams.get('token');
  if (!token) return null;
  try {
    return (jwt.verify(token, JWT_SECRET) as { sub: string }).sub;
  } catch {
    return null;
  }
}

export async function handleIntegrationsRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/integrations')) return false;

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }

  // GET /api/integrations — status of every provider for the current user.
  if (url.pathname === '/api/integrations' && req.method === 'GET') {
    const userId = await requireAuth(req, res);
    if (!userId) return true;
    const connected = await listConnections(userId);
    const connectedMap = new Map(connected.map((c) => [c.provider, c]));
    const providers = allAdapters().map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      configured: a.isConfigured(),
      connected: connectedMap.has(a.id),
      scopes: connectedMap.get(a.id)?.scopes ?? [],
      connectedAt: connectedMap.get(a.id)?.updatedAt ?? null,
    }));
    sendJson(res, 200, { providers });
    return true;
  }

  // GET /api/integrations/:id/connect — redirect to provider consent.
  const connectMatch = url.pathname.match(/^\/api\/integrations\/([a-z]+)\/connect$/);
  if (connectMatch && req.method === 'GET') {
    const provider = connectMatch[1] as ProviderId;
    const adapter = getAdapter(provider);
    if (!adapter) {
      sendJson(res, 404, { error: 'Unknown integration' });
      return true;
    }
    if (!adapter.isConfigured()) {
      sendJson(res, 503, { error: `${adapter.name} is not configured on the server yet.` });
      return true;
    }
    const userId = userIdFromRequest(req, url);
    if (!userId) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return true;
    }
    const state = signState(userId, provider);
    redirect(res, adapter.getAuthUrl(state, redirectUri()));
    return true;
  }

  // GET /api/integrations/callback — OAuth redirect target.
  if (url.pathname === '/api/integrations/callback' && req.method === 'GET') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauthError = url.searchParams.get('error');

    if (oauthError) {
      sendCallbackBridge(res, `error:${oauthError}`);
      return true;
    }
    const parsed = state ? verifyState(state) : null;
    if (!code || !parsed) {
      sendCallbackBridge(res, 'error:invalid_state');
      return true;
    }
    const adapter = getAdapter(parsed.provider);
    if (!adapter || !adapter.isConfigured()) {
      sendCallbackBridge(res, 'error:not_configured');
      return true;
    }
    try {
      const tokens = await adapter.exchangeCode(code, redirectUri());
      await saveConnection({
        userId: parsed.userId,
        provider: parsed.provider,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? null,
        expiresAt: tokens.expiresAt ?? null,
        scopes: tokens.scopes ?? adapter.scopes,
        meta: tokens.meta ?? {},
      });
      sendCallbackBridge(res, `connected:${parsed.provider}`);
    } catch (err) {
      sendCallbackBridge(res, `error:${(err as Error).message.slice(0, 80)}`);
    }
    return true;
  }

  // POST /api/integrations/:id/disconnect
  const disconnectMatch = url.pathname.match(/^\/api\/integrations\/([a-z]+)\/disconnect$/);
  if (disconnectMatch && req.method === 'POST') {
    const provider = disconnectMatch[1] as ProviderId;
    const userId = await requireAuth(req, res);
    if (!userId) return true;
    await deleteConnection(userId, provider);
    sendJson(res, 200, { ok: true });
    return true;
  }

  sendJson(res, 404, { error: 'not found' });
  return true;
}
