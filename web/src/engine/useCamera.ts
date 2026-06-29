import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Manages the user's camera for Nicole's vision.
 *
 * Opens the front ('user') camera, exposes the live stream for a preview, and
 * captures JPEG frames at a steady interval — each frame is handed to
 * `onFrame(base64Jpeg)` so the caller can stream them to Gemini Live. Nicole
 * then "sees" the latest frame and can describe it when asked.
 *
 * Leak-safe: stopping (or unmount) stops every track, clears the interval, and
 * releases the canvas/video elements.
 */

export interface UseCameraOptions {
  /** Called with each captured frame as a base64 JPEG (no data: prefix). */
  onFrame: (base64Jpeg: string) => void;
  /** Capture interval in ms. Default 1000 (one frame per second). */
  intervalMs?: number;
  /** JPEG quality 0..1. Default 0.6 (small frames keep latency/bandwidth low). */
  quality?: number;
  /** Max captured width in px (frame is downscaled to this). Default 640. */
  maxWidth?: number;
}

export interface UseCameraResult {
  /** Is the camera currently on? */
  on: boolean;
  /** The live MediaStream (for a <video> preview), or null. */
  stream: MediaStream | null;
  /** Which camera is active. */
  facing: 'user' | 'environment';
  /** Turn the camera on (prompts for permission). */
  start: () => Promise<void>;
  /** Turn the camera off and release it. */
  stop: () => void;
  /** Flip between front and back camera. */
  flip: () => Promise<void>;
  /** Any error message from the last start attempt. */
  error: string | null;
}

const DATA_URL_PREFIX = /^data:image\/jpeg;base64,/;

export function useCamera(opts: UseCameraOptions): UseCameraResult {
  const { onFrame, intervalMs = 1000, quality = 0.6, maxWidth = 640 } = opts;

  const [on, setOn] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const teardown = useCallback(() => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Null out srcObject first so the browser releases the indicator immediately.
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
    const s = streamRef.current;
    if (s) {
      for (const t of s.getTracks()) {
        t.enabled = false;
        t.stop();
      }
      streamRef.current = null;
    }
    canvasRef.current = null;
    setStream(null);
    setOn(false);
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 /* HAVE_CURRENT_DATA */) return;
    const vw = video.videoWidth || maxWidth;
    const vh = video.videoHeight || Math.round((maxWidth * 3) / 4);
    if (!vw || !vh) return;
    const scale = Math.min(1, maxWidth / vw);
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const b64 = dataUrl.replace(DATA_URL_PREFIX, '');
    if (b64) onFrameRef.current(b64);
  }, [maxWidth, quality]);

  const openWith = useCallback(
    async (mode: 'user' | 'environment') => {
      setError(null);
      const md = navigator.mediaDevices;
      if (!md?.getUserMedia) {
        setError('Camera not supported in this browser.');
        return;
      }
      // Release any prior stream before opening a new one (flip).
      const prev = streamRef.current;
      if (prev) for (const t of prev.getTracks()) t.stop();

      let s: MediaStream;
      try {
        s = await md.getUserMedia({ video: { facingMode: mode }, audio: false });
      } catch (e) {
        setError((e as Error)?.message ?? 'Could not open the camera.');
        return;
      }
      streamRef.current = s;

      // A detached <video> drives the frame capture (preview <video> in the UI
      // can share the same stream).
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = s;
      try {
        await video.play();
      } catch {
        /* autoplay can reject silently; frames still capture once ready */
      }
      videoRef.current = video;
      if (!canvasRef.current) canvasRef.current = document.createElement('canvas');

      if (timerRef.current != null) clearInterval(timerRef.current);
      timerRef.current = setInterval(captureFrame, intervalMs);

      setStream(s);
      setFacing(mode);
      setOn(true);
    },
    [captureFrame, intervalMs],
  );

  const start = useCallback(() => openWith(facing), [openWith, facing]);
  const flip = useCallback(
    () => openWith(facing === 'user' ? 'environment' : 'user'),
    [openWith, facing],
  );

  // Always release the camera on unmount.
  useEffect(() => () => teardown(), [teardown]);

  return { on, stream, facing, start, stop: teardown, flip, error };
}
