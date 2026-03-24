import { useCallback, useEffect, useRef, useState, ReactNode } from 'react';
import { useCapture } from '../hooks/useCapture';

interface Props {
  onSaved: () => void;
}

function useTimer(active: boolean, startedAt: number) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => clearInterval(id);
  }, [active, startedAt]);
  const s = Math.floor(elapsed / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function CaptureScreen({ onSaved }: Props) {
  const { state, startPhotoPreview, snapPhoto, startVideo, startAudio, stopRecording, dismiss } =
    useCapture(onSaved);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeRecordType, setActiveRecordType] = useState<'video' | 'audio' | null>(null);

  const timerStr = useTimer(
    state.phase === 'recording',
    state.phase === 'recording' ? state.startedAt : 0
  );

  useEffect(() => {
    if (state.phase === 'previewing' && videoRef.current) {
      videoRef.current.srcObject = state.stream;
    }
    if (state.phase === 'recording' && videoRef.current && activeRecordType === 'video') {
      videoRef.current.srcObject = state.stream;
    }
  }, [state, activeRecordType]);

  const handleVideo = useCallback(async () => {
    setActiveRecordType('video');
    await startVideo();
  }, [startVideo]);

  const handleAudio = useCallback(async () => {
    setActiveRecordType('audio');
    await startAudio();
  }, [startAudio]);

  const handleStop = useCallback(() => {
    if (activeRecordType) stopRecording(activeRecordType);
  }, [activeRecordType, stopRecording]);

  const handleDismiss = useCallback(() => {
    setActiveRecordType(null);
    dismiss();
  }, [dismiss]);

  // If in idle state, show the main dashboard
  if (state.phase === 'idle') {
    return (
      <div className="flex flex-col flex-1 pb-[72px] overflow-y-auto w-full px-4 pt-4 pb-12 gap-6 pb-24 relative">
        
        {/* Background Watermark */}
        <div className="absolute inset-0 z-0 flex flex-col items-center pt-8 pointer-events-none">
          <h1 
            className="text-[120px] leading-none font-bold text-white/40 tracking-tighter drop-shadow-md select-none mt-4 transition-all duration-300"
            style={{ textShadow: '2px 4px 10px rgba(0,0,0,0.1)' }}
          >
            CAPTURE
          </h1>
          <div className="flex items-center gap-4 mt-8 w-full max-w-sm px-6 opacity-30">
             <div className="h-[1px] flex-1 bg-black"></div>
             <span className="text-[10px] font-sentry tracking-widest text-black">
               SYSTEM READOUT // ACTIVE_TERMINAL
             </span>
          </div>
        </div>

        {/* Top Status Readout */}
        <div className="bg-[#595d5a]/90 backdrop-blur-sm border-l-4 border-l-sentry-red p-4 shadow-lg flex-shrink-0 relative z-10">
          <div className="grid grid-cols-2 gap-y-4 gap-x-2">
            <div>
              <p className="text-[9px] font-sentry text-black/60 font-bold tracking-widest uppercase mb-0.5">Storage</p>
              <p className="text-sm font-bold tracking-wide text-white">1.4TB FREE</p>
            </div>
            <div>
              <p className="text-[9px] font-sentry text-black/60 font-bold tracking-widest uppercase mb-0.5">Battery</p>
              <p className="text-sm font-bold tracking-wide text-sentry-green drop-shadow-[0_0_5px_rgba(0,255,51,0.5)]">88% POWER</p>
            </div>
            <div>
              <p className="text-[9px] font-sentry text-black/60 font-bold tracking-widest uppercase mb-0.5">Encryption</p>
              <p className="text-sm font-bold tracking-wide text-white">AES-256</p>
            </div>
            <div>
              <p className="text-[9px] font-sentry text-black/60 font-bold tracking-widest uppercase mb-0.5">Signal</p>
              <p className="text-sm font-bold tracking-wide text-white">LTE_TX_09</p>
            </div>
          </div>
        </div>

        {/* Capture Buttons Stack */}
        <div className="flex flex-col gap-4 flex-1">
          {/* SENTRY huge background watermark inside the buttons area, we simulate it by placing it absolutely behind the buttons */}
          <div className="relative flex-1 flex flex-col gap-4">
            <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden mix-blend-overlay pointer-events-none opacity-20">
               <h2 className="text-[180px] font-display font-black text-sentry-red leading-none select-none" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                 SENTRY
               </h2>
            </div>
            
            <CaptureModule 
              id="F_01" 
              label="PHOTO" 
              icon={<CameraApertureIcon />} 
              onClick={startPhotoPreview} 
              active={false} 
            />
            <CaptureModule 
              id="F_02" 
              label="VIDEO" 
              icon={<VideoCameraIcon />} 
              onClick={handleVideo} 
              active={false} 
              color="text-sentry-red"
              badge="REC_ENABLED"
            />
            <CaptureModule 
              id="F_03" 
              label="AUDIO" 
              icon={<MicIcon />} 
              onClick={handleAudio} 
              active={false} 
            />
          </div>
        </div>

        {/* System Log Module */}
        <div className="bg-[#111] border border-[#333] p-3 shadow-lg flex-shrink-0 relative">
           <div className="flex justify-between items-center mb-2">
             <span className="text-[10px] font-sentry font-bold text-sentry-green drop-shadow-[0_0_2px_rgba(0,255,51,0.5)]">SYSTEM_BOOT_SUCCESSFUL</span>
             <span className="text-[9px] font-sentry text-zinc-500">SECURE_LINK: ESTABLISHED</span>
           </div>
           <div className="text-[10px] font-sentry text-zinc-400 font-mono leading-relaxed space-y-0.5">
             <p>[LOG] 14:02:11 Initialize SENTRY_OS Core...</p>
             <p>[LOG] 14:02:12 Validating hardware peripherals...</p>
             <p className="text-zinc-500">CAMERA[OK], MIC[OK]</p>
             <p>[LOG] 14:02:14 Encrypted vault pinged...</p>
             <p className="text-zinc-500">VAULT_HANDSHAKE[COMPLETE]</p>
             <p>[LOG] 14:02:15 Monitoring for capture trigger...</p>
           </div>
        </div>
        
        {/* Bottom Bar attached to layout */}
        <div className="absolute bottom-0 left-0 w-full bg-black border-t border-[#333] px-2 py-1.5 flex items-center gap-2 z-30">
          <span className="text-[9px] font-sentry font-bold text-sentry-green drop-shadow-[0_0_2px_rgba(0,255,51,0.5)]">SYS_LOG:</span>
          <span className="text-[9px] font-sentry text-zinc-500 truncate">AUTHENTICATED // CAPTURE TERMINAL MOUNTED ...</span>
        </div>
      </div>
    );
  }

  // ── Modals / Overlays for actual capture (Keep simple matching sci-fi UI) ──
  
  // ── Camera preview ───────────────────────────────────────────────────────
  if (state.phase === 'previewing') {
    return (
      <div className="flex flex-col flex-1 relative bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="flex-1 object-cover" />
        
        {/* Sci-fi Overlay Elements */}
        <div className="absolute inset-0 pointer-events-none p-4 pb-24 flex flex-col justify-between">
           <div className="flex justify-between items-start">
             <div className="w-8 h-8 border-t-2 border-l-2 border-sentry-red"></div>
             <div className="text-sentry-red font-sentry text-xs">[ REC_STANDBY ]</div>
             <div className="w-8 h-8 border-t-2 border-r-2 border-sentry-red"></div>
           </div>
           <div className="flex justify-between items-end">
             <div className="w-8 h-8 border-b-2 border-l-2 border-sentry-red"></div>
             <div className="w-8 h-8 border-b-2 border-r-2 border-sentry-red"></div>
           </div>
        </div>

        <div className="absolute bottom-6 w-full flex items-center justify-between px-8 z-10 pb-[72px]">
          <button onClick={handleDismiss} className="text-zinc-400 font-sentry text-xs px-4 py-2 border border-zinc-700 bg-black/50">
            [ CANCEL ]
          </button>
          <button
            onClick={() => videoRef.current && snapPhoto(videoRef.current)}
            className="w-16 h-16 rounded-full border-4 border-sentry-red bg-black/50 active:scale-95 flex items-center justify-center"
          >
             <div className="w-12 h-12 rounded-full bg-sentry-red/50"></div>
          </button>
          <div className="w-20" />
        </div>
      </div>
    );
  }

  // ── Recording ────────────────────────────────────────────────────────────
  if (state.phase === 'recording') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 relative bg-black px-6">
        {activeRecordType === 'video' && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        
        <div className="absolute top-8 w-full px-8 flex justify-between items-center z-10">
           <div className="flex items-center gap-3 bg-black/60 px-4 py-2 border border-sentry-red">
             <span className="w-3 h-3 rounded-full bg-sentry-red animate-pulse shadow-[0_0_10px_rgba(204,0,0,0.8)]" />
             <span className="text-sentry-red font-sentry font-bold text-lg">{timerStr}</span>
           </div>
           <span className="text-sentry-red font-sentry text-xs animate-pulse">[ ACTIVE ]</span>
        </div>

        {activeRecordType === 'audio' && (
          <div className="flex flex-col items-center gap-6 z-10">
            <div className="relative w-32 h-32 rounded-full border border-sentry-red flex items-center justify-center bg-sentry-red/10">
              <div className="absolute inset-0 rounded-full border-2 border-sentry-red animate-ping opacity-20"></div>
              <MicIcon className="w-12 h-12 text-sentry-red animate-pulse" />
            </div>
            <p className="text-sentry-red font-sentry text-sm tracking-widest">AUDIO_CAPTURE_ENGAGED</p>
          </div>
        )}

        <div className="absolute bottom-12 w-full flex flex-col items-center gap-6 z-10 pb-[72px]">
          <button
            onClick={handleStop}
            className="flex items-center gap-3 px-8 py-4 bg-sentry-red text-white font-sentry font-bold border-2 border-white active:scale-95 shadow-[0_0_15px_rgba(204,0,0,0.5)]"
          >
            <StopIcon /> STOP & SECURE
          </button>
          <button onClick={handleDismiss} className="text-zinc-500 font-sentry text-xs hover:text-white">
            [ DISCARD_THREAT_DATA ]
          </button>
        </div>
      </div>
    );
  }

  // ── Processing ───────────────────────────────────────────────────────────
  if (state.phase === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-6 bg-sentry-dark">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 border-4 border-zinc-800 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-sentry-red border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="text-sentry-red font-sentry text-sm tracking-widest animate-pulse">ENCRYPTING & SECURING ARCHIVE...</p>
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  if (state.phase === 'done') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 px-6 bg-sentry-dark">
        <div className="w-20 h-20 rounded-full bg-sentry-green/10 border-2 border-sentry-green flex items-center justify-center shadow-[0_0_20px_rgba(0,255,51,0.2)]">
          <CheckIcon className="w-10 h-10 text-sentry-green drop-shadow-[0_0_8px_rgba(0,255,51,0.8)]" />
        </div>
        <p className="text-sentry-green font-sentry text-lg font-bold tracking-widest mt-4">SECURED_PROTOCOL</p>
        <div className="bg-black border border-zinc-800 p-4 font-sentry w-full max-w-xs text-center">
           <p className="text-zinc-400 text-[10px] mb-1">HASH_IDENTIFIER:</p>
           <p className="text-zinc-300 text-xs break-all">{state.hash.slice(0, 32)}…</p>
        </div>
        <p className="text-zinc-500 font-sentry text-[10px] tracking-widest">TRANSMISSION_QUEUED</p>
        <button
          onClick={handleDismiss}
          className="mt-8 px-8 py-3 bg-black border border-zinc-700 text-zinc-300 font-sentry text-xs active:bg-zinc-800"
        >
          [ INITIALIZE NEW CAPTURE ]
        </button>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (state.phase === 'error') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-6 px-6 bg-sentry-dark">
         <div className="text-sentry-red text-5xl mb-4">⚠</div>
        <p className="text-sentry-red font-sentry text-sm text-center tracking-widest leading-loose">CRITICAL_ERROR<br/>{state.message}</p>
        <button
          onClick={handleDismiss}
          className="px-8 py-3 bg-black border border-sentry-red text-sentry-red font-sentry text-xs active:bg-sentry-red/20 shadow-[0_0_10px_rgba(204,0,0,0.2)]"
        >
          [ ACKNOWLEDGE ]
        </button>
      </div>
    );
  }

  return null;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function CaptureModule({
  label,
  icon,
  onClick,
  active,
  id,
  color = "text-white",
  badge
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active: boolean;
  id: string;
  color?: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative z-10 flex flex-col items-center justify-center gap-2 bg-sentry-panel flex-1 min-h-[90px] px-4 py-3 border-b-2 border-[#151515] active:bg-[#282828] active:translate-y-[1px] transition-all`}
    >
      <span className="absolute top-2 right-4 text-[10px] font-sentry text-zinc-500 tracking-widest">{id}</span>
      <div className={`${color} scale-75`}>
         {icon}
      </div>
      <span className={`text-lg font-display font-bold tracking-tighter ${color}`}>{label}</span>
      {badge && (
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] font-sentry text-white bg-sentry-red px-2 py-0.5 tracking-wider truncate">
          {badge}
        </span>
      )}
    </button>
  );
}

// Complex customized SCIFI icons to match screenshots
function CameraApertureIcon() {
  return (
    <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="14.31" y1="8" x2="20.05" y2="17.94"></line>
      <line x1="9.69" y1="8" x2="21.17" y2="8"></line>
      <line x1="7.38" y1="12" x2="13.12" y2="2.06"></line>
      <line x1="9.69" y1="16" x2="3.95" y2="6.06"></line>
      <line x1="14.31" y1="16" x2="2.83" y2="16"></line>
      <line x1="16.62" y1="12" x2="10.88" y2="21.94"></line>
    </svg>
  );
}

function VideoCameraIcon() {
  return (
    <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"></polygon>
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" fill="currentColor"></rect>
    </svg>
  );
}

function MicIcon({ className = 'w-12 h-12' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="23"></line>
      <line x1="8" y1="23" x2="16" y2="23"></line>
    </svg>
  );
}

function StopIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <rect x="5" y="5" width="14" height="14" />
    </svg>
  );
}

function CheckIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
