import { useCallback, useRef, useState } from 'react';
import jsQR from 'jsqr';

export type QrScanState = 'idle' | 'scanning' | 'found' | 'error';

export interface QrScannerControls {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  state: QrScanState;
  result: string | null;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

/**
 * @param onDetect Optional handler called for each decoded QR. Return true to
 * finish (camera stops, state → 'found'); return false to keep scanning —
 * used for multi-frame sequences. Without it, the first code finishes the scan.
 */
export function useQrScanner(
  onDetect?: (data: string) => boolean | Promise<boolean>,
): QrScannerControls {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDataRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  const [state, setState] = useState<QrScanState>('idle');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setState('idle');
  }, []);

  const reset = useCallback(() => {
    stop();
    setResult(null);
    setError(null);
  }, [stop]);

  const start = useCallback(async () => {
    reset();
    lastDataRef.current = null;
    busyRef.current = false;
    setState('scanning');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
    } catch {
      setError('Camera permission denied');
      setState('error');
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const { videoWidth: w, videoHeight: h } = video;
      if (w === 0 || h === 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const code = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' });

      if (code?.data && !busyRef.current && code.data !== lastDataRef.current) {
        lastDataRef.current = code.data;
        const finish = () => {
          if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          setResult(code!.data);
          setState('found');
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        };
        const handler = onDetectRef.current;
        if (!handler) {
          finish();
          return; // single-shot mode: stop after the first code
        }
        // Multi-frame mode: the handler decides when the scan is complete.
        busyRef.current = true;
        Promise.resolve(handler(code.data))
          .then((done) => {
            busyRef.current = false;
            if (done) finish();
          })
          .catch(() => {
            busyRef.current = false;
          });
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [reset]);

  return { videoRef, canvasRef, state, result, error, start, stop, reset };
}
