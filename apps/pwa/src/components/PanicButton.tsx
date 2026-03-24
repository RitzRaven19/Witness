import { useCallback, useRef, useState } from 'react';
import { purgeAll } from '../store/evidenceStore';

const HOLD_MS = 3000;

export function PanicButton() {
  const [progress, setProgress] = useState(0); // 0–100
  const [purged, setPurged] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  const begin = useCallback(() => {
    startRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min((elapsed / HOLD_MS) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(intervalRef.current!);
        purgeAll().then(() => setPurged(true));
      }
    }, 50);
  }, []);

  const cancel = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setProgress(0);
  }, []);

  if (purged) {
    return (
      <div className="w-full h-16 flex items-center justify-center bg-black border border-sentry-green/50 text-sentry-green font-display font-bold tracking-[0.2em] relative overflow-hidden text-sm uppercase">
        <div className="absolute inset-0 bg-sentry-green/10"></div>
        SYSTEM PURGED
      </div>
    );
  }

  return (
    <div 
      className="relative w-full h-16 overflow-hidden bg-black border border-sentry-red active:scale-[0.98] transition-all cursor-pointer select-none group"
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerLeave={cancel}
    >
      {/* Background hazard stripes that span the width depending on progress */}
      <div 
        className="absolute inset-y-0 left-0 bg-sentry-red transition-none flex items-center overflow-hidden"
        style={{ width: `${progress}%` }}
      >
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, #000 10px, #000 20px)' }}></div>
      </div>
      
      {/* Text layer over the progress bar */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className={`font-display font-bold text-sm tracking-[0.15em] transition-colors ${progress > 50 ? 'text-black' : 'text-sentry-red'} drop-shadow-md z-10`}>
          {progress > 0 ? 'HOLD TO OVERRIDE...' : 'HOLD 3S TO PURGE ALL DATA'}
        </span>
      </div>
      
      {/* Border glow */}
      <div className="absolute inset-0 border border-sentry-red opacity-0 group-hover:opacity-50 transition-opacity drop-shadow-[0_0_8px_rgba(204,0,0,1)] pointer-events-none"></div>
    </div>
  );
}
