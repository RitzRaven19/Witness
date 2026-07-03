import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { encodeQrSequence } from '../utils/qrSequence';

interface Props {
  /** Text payload to transmit (JSON in practice). Encoded into a QR sequence. */
  payload: string;
  title?: string;
  onClose: () => void;
  /** Render only the QR body (no fixed overlay/header) inside a host container. */
  embedded?: boolean;
}

const FRAME_INTERVAL_MS = 900;

/**
 * Displays a payload as a looping QR frame sequence for device-to-device
 * air-gap transfer. The receiving device scans with the standard scanner,
 * which reassembles frames in any order (utils/qrSequence.ts).
 */
export function QrShareModal({ payload, title = 'SHARE VIA QR', onClose, embedded = false }: Props) {
  const [frames, setFrames] = useState<string[] | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Encode payload → frames → QR data-URLs once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const f = await encodeQrSequence(payload);
        const imgs = await Promise.all(
          f.map((frame) =>
            QRCode.toDataURL(frame, {
              errorCorrectionLevel: 'M',
              margin: 2,
              width: 560,
              color: { dark: '#000000', light: '#ffffff' },
            }),
          ),
        );
        if (!cancelled) {
          setFrames(f);
          setImages(imgs);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Encoding failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  // Auto-advance loop.
  useEffect(() => {
    if (!playing || images.length <= 1) return;
    timerRef.current = setInterval(
      () => setIndex((i) => (i + 1) % images.length),
      FRAME_INTERVAL_MS,
    );
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, images.length]);

  const total = frames?.length ?? 0;

  const body = (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
        {error ? (
          <p className="text-[#cc4444] font-bold tracking-widest text-[12px] text-center">{error}</p>
        ) : !frames ? (
          <p className="text-[#00ff33]/70 text-[11px] tracking-widest">ENCODING…</p>
        ) : (
          <>
            {/* QR frame — white quiet zone is required for scanning */}
            <div className="bg-white p-3">
              <img
                src={images[index]}
                alt={`QR frame ${index + 1} of ${total}`}
                className="w-64 h-64 [image-rendering:pixelated]"
              />
            </div>

            <div className="text-[#00ff33] font-bold tracking-widest text-[12px] tabular-nums">
              FRAME {index + 1}/{total}
            </div>

            {/* Frame progress */}
            {total > 1 && (
              <div className="flex gap-1 w-64">
                {Array.from({ length: total }).map((_, i) => (
                  <div key={i} className={`flex-1 h-1 ${i === index ? 'bg-[#00ff33]' : 'bg-[#333]'}`}/>
                ))}
              </div>
            )}

            {/* Controls */}
            {total > 1 && (
              <div className="flex gap-2">
                <button
                  onClick={() => { setPlaying(false); setIndex((i) => (i - 1 + total) % total); }}
                  className="w-12 h-10 bg-[#1a1a1a] border border-[#333] text-white text-sm hover:bg-[#222]"
                  aria-label="Previous frame"
                >‹</button>
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="px-4 h-10 bg-[#1a1a1a] border border-[#333] text-[10px] tracking-widest text-white hover:bg-[#222]"
                >
                  {playing ? 'PAUSE' : 'PLAY'}
                </button>
                <button
                  onClick={() => { setPlaying(false); setIndex((i) => (i + 1) % total); }}
                  className="w-12 h-10 bg-[#1a1a1a] border border-[#333] text-white text-sm hover:bg-[#222]"
                  aria-label="Next frame"
                >›</button>
              </div>
            )}

            <p className="text-[9px] text-gray-600 tracking-wide text-center max-w-64 leading-relaxed">
              On the receiving device open SCAN QR and hold it here until every frame is captured.
              Frames can be scanned in any order.
            </p>
          </>
        )}
      </div>
  );

  if (embedded) return body;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0d0d0d]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] shrink-0">
        <span className="text-[#00ff33] font-bold tracking-[0.15em] text-[13px]">{title}</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1 transition-colors"
          aria-label="Close share screen"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      {body}
    </div>
  );
}
