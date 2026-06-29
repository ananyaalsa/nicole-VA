// GET /api/weather — current weather + short forecast for the ambient widget.
//   ?lat=<n>&lon=<n>   → weather at coordinates (browser geolocation)
//   ?q=<place>         → geocode the place name, then weather there
// No auth required (it's just public weather), no API key (Open-Meteo).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.js';
import { geocodePlace, weatherAt } from './weather.js';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': config.frontendUrl,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(JSON.stringify(body));
}

export async function handleWeatherRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/api/weather') return false;

  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return true; }
  if (req.method !== 'GET') { sendJson(res, 405, { error: 'method not allowed' }); return true; }

  try {
    const q = url.searchParams.get('q');
    const lat = url.searchParams.get('lat');
    const lon = url.searchParams.get('lon');

    if (q) {
      const geo = await geocodePlace(q);
      if (!geo) { sendJson(res, 404, { error: `Couldn't find "${q}".` }); return true; }
      const w = await weatherAt(geo.latitude, geo.longitude, geo.place);
      sendJson(res, 200, w);
      return true;
    }
    if (lat && lon) {
      const w = await weatherAt(Number(lat), Number(lon));
      sendJson(res, 200, w);
      return true;
    }
    sendJson(res, 400, { error: 'provide ?q=place or ?lat=&lon=' });
  } catch {
    sendJson(res, 502, { error: "Couldn't reach the weather service." });
  }
  return true;
}
