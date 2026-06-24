# Phone Camera via QR + WebRTC (LAN) — Design Spec

**Date:** 2026-06-24
**Status:** Approved by user

## Purpose

Let the user point their **phone's camera** at something and have Nicole "see" it
on the PC web app. A **"Connect phone"** button shows a QR code; scanning it on
the phone (Android **or** iOS) opens a tiny page that streams the phone's camera
to the PC over **WebRTC, peer-to-peer on the same Wi-Fi (LAN)**. The phone feed
appears in the PC's camera preview and flows into the existing Gemini vision
pipeline (so "what do you see?" sees through the phone). A **Web / Phone camera
toggle** switches the source. The user keeps talking through the PC mic — the
**phone is camera-only**.

Single-user / local for now. Multi-user + public hosting is a SEPARATE future
project (noted, not built here).

## Goals

1. "Connect phone" button → QR code + short LAN link.
2. Scan on Android or iOS → phone page captures the (back) camera.
3. Phone → PC video over LAN WebRTC (no cloud, no TURN).
4. Phone feed shown in the PC camera preview + sent to Nicole's vision (reusing
   the existing frame-capture → JPEG → Gemini path).
5. Web / Phone camera source toggle; clean teardown either way.
6. Works on **iOS Safari + Android Chrome** (requires HTTPS — see below).

## Non-Goals (YAGNI)

No STUN/TURN/cloud relay, no public hosting, no accounts/auth, no phone audio, no
multi-viewer, no off-Wi-Fi use. Phone is camera-only.

## The iOS / HTTPS requirement

iOS Safari only grants `getUserMedia` (camera) over **HTTPS** (Android allows it
on a LAN IP over http, but we serve both the same way for consistency). So the
dev servers (Vite web + phone page, and the backend WS) run over **HTTPS with a
local self-signed certificate**. On first connect the phone shows a one-time
"not trusted — continue anyway?" warning; tapping through it once enables the
camera. This is the standard minimal way to do LAN WebRTC across iOS + Android
with no cloud.

- Generate a self-signed cert (e.g. via `mkcert` if available, else a bundled
  openssl-generated cert) covering the PC's LAN IP.
- Vite served with `https` + the cert; the phone link is
  `https://<LAN-IP>:5173/phone?room=<code>`.
- Backend WS upgraded to `wss://<LAN-IP>:<port>` using the same cert.

## Architecture

Small, isolated pieces; the existing vision pipeline is reused unchanged.

### Backend — signaling room (new, ~80 lines, no Gemini)

A WebSocket signaling relay so two peers in the same `room` exchange the WebRTC
handshake (SDP offer/answer + ICE candidates).
- New WS path `/rtc-signal` on the existing HTTP server (same cert).
- A `room` map: `roomCode -> Set<socket>`. Messages `{ type:'join', room }`,
  then any `{ type:'signal', room, payload }` is relayed to the *other* peer(s)
  in that room. Rooms are isolated; a peer leaving cleans up.
- Pure message-passing — unit-testable with fake sockets, no network.

### Web (PC side)

- `usePhoneCamera(room)` hook: creates an `RTCPeerConnection`, connects to
  `/rtc-signal`, performs the offer/answer + ICE exchange (PC is the *answerer*;
  phone is the *offerer*), and exposes the received remote video track as a
  `MediaStream` — the SAME shape `useCamera` already produces. Leak-safe teardown
  (close pc, close ws, stop tracks).
- **Camera source switch:** a thin layer so the frame-capture pipeline reads from
  EITHER the local `getUserMedia` stream (`useCamera`) OR the phone's WebRTC
  stream (`usePhoneCamera`). Cleanest: a `useVisionCamera` wrapper exposing
  `{ source: 'web'|'phone', stream, on, start, stop, frames }` that owns both and
  routes the active stream's frames to `session.sendVideoFrame`. The existing
  per-frame capture logic (canvas → JPEG → base64) is shared by both sources.
- **QR display:** the "Connect phone" button generates a `room` code and renders
  a QR (small `qrcode` dep) of the phone URL, plus the link text. Shows
  "waiting for phone…" → "phone connected ✓".
- **Toggle:** Web camera / Phone camera in the controls; switching tears down the
  inactive source.

### Phone page (new route `/phone`)

A minimal standalone page (no avatar, no audio):
- Reads `room` from the query string.
- `getUserMedia({ video: { facingMode: 'environment' } })` (back camera).
- Creates an `RTCPeerConnection` (phone is the *offerer*), connects to
  `/rtc-signal`, sends its video track to the PC.
- Shows "Connected ✓ — point at what you want Nicole to see" + a flip-camera
  button. Clear error messages on permission denial / wrong network.

## Data flow

```
Phone camera ─getUserMedia─▶ RTCPeerConnection ──LAN──▶ PC RTCPeerConnection
                                  ▲   SDP/ICE via WS     │
                       backend /rtc-signal room ◀────────┘
PC: phone MediaStream ─▶ shared frame capture ─JPEG─▶ Nicole (vision)
                     └─▶ CameraPreview (phone feed shown)
```

## Error handling

- Phone camera denied / not HTTPS → phone page shows a clear, specific message.
- Both not on same Wi-Fi / WebRTC can't connect → PC shows "Couldn't reach the
  phone — make sure both are on the same Wi-Fi" after a timeout, with retry.
- Phone page closed or toggled back to Web → peer connection + tracks torn down
  cleanly (no leaks; same discipline as the rest of the app).
- Signaling room: a peer disconnect removes it from the room; stale rooms GC.

## Testing

- **Signaling room (backend):** two fake sockets join a room → a signal from one
  is relayed to the other but NOT to a peer in a different room; disconnect
  cleanup. TDD, pure.
- **Room-code generation:** produces distinct, URL-safe codes.
- **`usePhoneCamera` (web):** mock `RTCPeerConnection` + WebSocket — join sends
  `join`; an incoming offer triggers an answer; ICE candidates relayed; a
  received track is exposed as a stream; teardown closes pc + ws + stops tracks.
- **`useVisionCamera` source switch:** active source's frames reach the
  `onFrame` callback; switching sources stops the previous one.
- Existing capture pipeline already tested; only the source feeding it changes.

## Tech / Constraints

- WebRTC (`RTCPeerConnection`), no TURN, LAN only.
- Self-signed HTTPS for Vite + backend (mkcert if present, else openssl).
- `qrcode` dependency (small) for the QR.
- React 19, TS strict, vitest; backend Node/TS, `ws`, vitest — same as the app.
- The Gemini key stays server-side; signaling carries no Gemini data.

## Future (separate project, not built here)

Multi-user / "used by everyone": public hosting (deploy frontend+backend),
accounts + per-user memory/history isolation (replace the single
`NICOLE_USER_ID`), public WebRTC (STUN + TURN), and cost/rate-limit handling for
concurrent Gemini sessions.
