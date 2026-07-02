import { useEffect, useRef, useState } from 'react';
import { useQrScanner } from '../hooks/useQrScanner';
import { SequenceAssembler, type SequenceProgress } from '../utils/qrSequence';

interface Props {
  onClose: () => void;
  onResult?: (data: string) => void;
}

export function QrScannerModal({ onClose, onResult }: Props) {
  const assemblerRef = useRef(new SequenceAssembler());
  const [progress, setProgress] = useState<SequenceProgress | null>(null);
  const [assembled, setAssembled] = useState<string | null>(null);

  // Multi-frame aware: plain QR codes complete immediately; WTN1 sequence
  // frames accumulate until every part has been scanned.
  const { videoRef, canvasRef, state, result, error, start, reset } = useQrScanner(
    async (data) => {
      if (!SequenceAssembler.isSequenceFrame(data)) return true;
      try {
        const res = await assemblerRef.current.push(data);
        if (res.kind === 'progress') {
          setProgress(res.progress);
          return false;
        }
        if (res.kind === 'complete') {
          setAssembled(res.text);
          setProgress(res.progress);
          return true;
        }
      } catch {
        /* corrupt frame — keep scanning */
      }
      return false;
    },
  );

  const payload = assembled ?? result;

  useEffect(() => {
    start();
    return () => reset();
  }, [start, reset]);

  useEffect(() => {
    if (state === 'found' && payload && onResult) onResult(payload);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, payload]);

  const copyResult = () => {
    if (payload) navigator.clipboard.writeText(payload).catch(() => {});
  };

  const scanAgain = () => {
    assemblerRef.current.reset();
    setProgress(null);
    setAssembled(null);
    void start();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0d0d0d]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] shrink-0">
        <span className="text-[#00ff33] font-bold tracking-[0.15em] text-[13px]">SCAN QR CODE</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1 transition-colors"
          aria-label="Close scanner"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Camera / Result area */}
      <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center">
        {state === 'error' ? (
          <div className="flex flex-col items-center gap-4 px-8 text-center">
            <svg className="w-12 h-12 text-[#cc4444]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
            </svg>
            <p className="text-[#cc4444] font-bold tracking-widest text-[12px]">{error ?? 'CAMERA ERROR'}</p>
            <button
              onClick={scanAgain}
              className="bg-[#1a1a1a] border border-[#333] px-4 py-2 text-white text-[11px] tracking-widest hover:bg-[#222]"
            >
              RETRY
            </button>
          </div>
        ) : state === 'found' ? (
          <div className="flex flex-col items-center gap-4 px-6 text-center w-full">
            <svg className="w-10 h-10 text-[#00ff33]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <div className="text-[#00ff33] font-bold tracking-widest text-[11px]">
              {assembled ? `SEQUENCE COMPLETE · ${progress?.total ?? '?'} FRAMES` : 'QR CODE DETECTED'}
            </div>
            <div className="w-full bg-[#0a0a0a] border border-[#1a1a1a] p-3 max-h-40 overflow-y-auto">
              <p className="text-white text-[12px] font-mono break-all text-left">{payload}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={copyResult}
                className="bg-[#00ff33] text-black font-bold text-[11px] tracking-widest px-4 py-2 hover:bg-[#00cc28] transition-colors"
              >
                COPY
              </button>
              <button
                onClick={scanAgain}
                className="bg-[#1a1a1a] border border-[#333] text-white text-[11px] tracking-widest px-4 py-2 hover:bg-[#222]"
              >
                SCAN AGAIN
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Live camera feed */}
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              muted
              playsInline
            />
            {/* Hidden canvas for jsQR processing */}
            <canvas ref={canvasRef} className="hidden" />
            {/* Scan frame overlay */}
            <div className="relative z-10 flex flex-col items-center gap-4">
              <div className="relative w-56 h-56">
                {/* Corner brackets */}
                <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-[#00ff33]"/>
                <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-[#00ff33]"/>
                <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-[#00ff33]"/>
                <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-[#00ff33]"/>
                {/* Scanning line */}
                <div className="absolute inset-x-2 top-0 h-0.5 bg-[#00ff33]/60 animate-[scan_2s_linear_infinite]"/>
              </div>
              <p className="text-[#00ff33]/70 text-[11px] tracking-widest">
                {state !== 'scanning' ? 'INITIALIZING...' :
                 progress ? `RECEIVING PART ${progress.have}/${progress.total} — KEEP SCANNING` :
                 'POINT AT QR CODE'}
              </p>
              {progress && (
                <div className="flex gap-1 w-56">
                  {Array.from({ length: progress.total }).map((_, i) => (
                    <div key={i} className={`flex-1 h-1 ${i < progress.have ? 'bg-[#00ff33]' : 'bg-[#333]'}`}/>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes scan {
          0%   { transform: translateY(0); }
          50%  { transform: translateY(220px); }
          100% { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
