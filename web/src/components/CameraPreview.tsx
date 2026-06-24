import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import './CameraPreview.css';

export interface CameraPreviewProps {
  /** The live camera stream to show. */
  stream: MediaStream | null;
  /** Flip front/back camera. */
  onFlip?: () => void;
  /** Turn the camera off. */
  onClose?: () => void;
}

/**
 * A small floating preview of the user's camera while Nicole is watching.
 * A "live" dot signals that frames are being streamed to her for vision.
 */
export function CameraPreview({ stream, onFlip, onClose }: CameraPreviewProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (v && stream) {
      v.srcObject = stream;
      void v.play().catch(() => {});
    }
    return () => {
      if (v) v.srcObject = null;
    };
  }, [stream]);

  return (
    <div className="camera-preview hud-panel" data-testid="camera-preview">
      <video ref={videoRef} className="camera-preview__video" muted playsInline />
      <div className="camera-preview__bar">
        <span className="camera-preview__live">
          <span className="camera-preview__dot" aria-hidden="true" />
          Nicole is watching
        </span>
        <span className="camera-preview__actions">
          {onFlip && (
            <button type="button" className="camera-preview__btn" onClick={onFlip} title="Flip camera">
              Flip
            </button>
          )}
          {onClose && (
            <button type="button" className="camera-preview__btn" onClick={onClose} title="Turn off camera">
              ✕
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

export default CameraPreview;
