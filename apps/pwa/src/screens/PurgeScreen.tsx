import React, { useState } from 'react';

interface Props {
  pin: string;
  onClose: () => void;
  onActivateDecoy: () => void;
}

type Stage = 'warning' | 'confirm' | 'wiping' | 'done';

export function PurgeScreen({ pin, onClose, onActivateDecoy }: Props) {
  const [stage, setStage] = useState<Stage>('warning');
  const [wipeProgress, setWipeProgress] = useState(0);

  function handlePurgeClick() {
    setStage('confirm');
  }

  function handleConfirm() {
    setStage('wiping');
    // Simulate wipe progress
    let p = 0;
    const interval = setInterval(() => {
      p += Math.random() * 18 + 5;
      if (p >= 100) {
        p = 100;
        clearInterval(interval);
        setWipeProgress(100);
        setTimeout(() => {
          setStage('done');
          // After showing done screen briefly, switch to decoy
          setTimeout(onActivateDecoy, 2200);
        }, 400);
      } else {
        setWipeProgress(Math.min(p, 100));
      }
    }, 120);
  }

  return (
    <div className="absolute inset-0 bg-[#0a0a0a] flex flex-col z-50 overflow-y-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#0a0a0a] border-b border-[#1a1a1a] shrink-0">
        <div className="flex items-center gap-3">
          {stage === 'warning' && (
            <button onClick={onClose} className="flex flex-col gap-1 p-1">
              <span className="w-5 h-0.5 bg-[#00ff33]"/>
              <span className="w-5 h-0.5 bg-[#00ff33]"/>
              <span className="w-5 h-0.5 bg-[#00ff33]"/>
            </button>
          )}
          <span className="text-[#00ff33] font-bold tracking-[0.15em] text-[13px]">TACTICAL_NET</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-gray-400 tracking-widest">ENCR_LEVEL: OMEGA</span>
          <WaveIcon />
        </div>
      </header>

      {/* ── WIPING STAGE ── */}
      {stage === 'wiping' && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
          <div className="w-24 h-24 border-2 border-[#cc0000]/40 flex items-center justify-center relative">
            <svg className="w-12 h-12 text-[#cc0000] animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
          <div className="text-center">
            <div className="text-[#cc0000] font-bold tracking-[0.2em] text-[13px] mb-1">PURGING DATA</div>
            <div className="text-gray-500 text-[10px] tracking-widest">DO NOT INTERRUPT</div>
          </div>
          <div className="w-full bg-[#1a1a1a] h-1.5">
            <div
              className="h-full bg-[#cc0000] transition-all duration-150"
              style={{ width: `${wipeProgress}%` }}
            />
          </div>
          <div className="text-[#cc4444] font-bold text-[11px] tracking-widest">{Math.floor(wipeProgress)}%</div>
          <div className="text-[9px] text-gray-600 tracking-widest text-center leading-relaxed">
            OVERWRITING: EVIDENCE VAULT · KEYS · LOGS · GPS HISTORY · CONTACTS
          </div>
        </div>
      )}

      {/* ── DONE STAGE ── */}
      {stage === 'done' && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-5">
          <svg className="w-16 h-16 text-[#00ff33]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
          </svg>
          <div className="text-[#00ff33] font-bold tracking-[0.2em] text-xl">PURGE COMPLETE</div>
          <div className="text-gray-500 text-[10px] tracking-widest text-center leading-loose">
            ALL LOCAL DATA WIPED<br/>ACTIVATING COVER MODE...
          </div>
        </div>
      )}

      {/* ── WARNING / CONFIRM STAGES ── */}
      {(stage === 'warning' || stage === 'confirm') && (
        <div className="flex flex-col items-center px-5 pt-4 pb-5 flex-1">

          {/* Signal status */}
          <div className="self-end flex flex-col items-end gap-0.5 mb-5">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-[#cc0000] rounded-full animate-pulse"/>
              <span className="text-[#cc4444] text-[9px] tracking-widest font-bold">SIGNAL_VULNERABLE</span>
            </div>
            <span className="text-gray-500 text-[9px] tracking-widest">LAT: 51.5074 N</span>
            <span className="text-gray-500 text-[9px] tracking-widest">LNG: 0.1278 W</span>
          </div>

          {/* Warning triangle */}
          <svg className="w-24 h-24 text-[#cc0000] mb-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
          </svg>

          <h2 className="text-[26px] font-bold text-white text-center tracking-widest leading-tight mb-3">
            CRITICAL SYSTEM<br/>OVERRIDE
          </h2>
          <p className="text-[12px] text-gray-300 text-center leading-relaxed mb-5 max-w-xs">
            Are you sure you want to purge all secure data? This action cannot be undone.
          </p>

          {/* Recovery notice */}
          <div className="w-full bg-[#0d1a0d] border border-[#00ff33]/20 p-3 mb-5">
            <div className="flex items-center gap-2 mb-1.5">
              <svg className="w-3.5 h-3.5 text-[#00ff33] shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              <span className="text-[#00ff33] text-[9px] font-bold tracking-widest">RECOVERY INFO</span>
            </div>
            <p className="text-[9px] text-gray-400 leading-relaxed">
              Evidence already <span className="text-[#00ff33]">synced to secure server</span> is recoverable via your operator credentials.
              Local-only files will be <span className="text-[#cc4444]">permanently destroyed</span> and cannot be retrieved.
            </p>
          </div>

          {/* Stats */}
          <div className="flex gap-2 w-full mb-5">
            <div className="flex-1 bg-[#141414] border border-[#1e1e1e] p-3">
              <div className="text-[9px] text-gray-500 tracking-widest uppercase mb-1">Files Targeted</div>
              <div className="text-[#cc4444] font-bold text-xl tracking-wider">42,891</div>
            </div>
            <div className="flex-1 bg-[#141414] border border-[#1e1e1e] p-3">
              <div className="text-[9px] text-gray-500 tracking-widest uppercase mb-1">Location Data</div>
              <div className="text-[#cc4444] font-bold text-xl tracking-wider">WIPED</div>
            </div>
          </div>

          {stage === 'warning' && (
            <>
              <button
                onClick={handlePurgeClick}
                className="w-full py-5 bg-[#cc0000] hover:bg-[#dd0000] text-white font-bold tracking-[0.3em] text-[14px] transition-colors mb-2 border border-dashed border-[#ff4444]/60 shadow-[0_0_20px_rgba(204,0,0,0.3)]"
              >
                PURGE DATA
              </button>
              <p className="text-[8px] text-gray-600 tracking-[0.15em] uppercase mb-5 text-center">
                Biometric Authorization Required to Proceed
              </p>
              <button className="w-full py-3.5 bg-[#1a1a1a] border border-[#333] text-gray-400 font-bold tracking-[0.2em] text-[12px] mb-3">
                CONFIRM
              </button>
              <button onClick={onClose} className="text-[11px] text-gray-500 tracking-[0.2em] uppercase hover:text-gray-300 py-2">
                CANCEL OPERATION
              </button>
            </>
          )}

          {stage === 'confirm' && (
            <>
              {/* Cover mode + PIN display */}
              <div className="w-full bg-[#0a0a14] border border-[#4444aa]/40 p-4 mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-3.5 h-3.5 text-[#8888ff] shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                  </svg>
                  <span className="text-[#8888ff] text-[9px] font-bold tracking-widest">COVER MODE WILL ACTIVATE</span>
                </div>
                <p className="text-[9px] text-gray-400 leading-relaxed mb-4">
                  App will display as a <span className="text-white">calculator</span>. Anyone who picks up your phone sees only that. Type your PIN into the calculator to silently restore access.
                </p>
                {/* PIN display */}
                <div className="border border-[#8888ff]/30 bg-[#0d0d1a] p-3 text-center">
                  <div className="text-[8px] text-[#8888ff] tracking-[0.25em] uppercase mb-2">Your Recovery PIN — memorize this</div>
                  <div className="flex items-center justify-center gap-3">
                    {pin.split('').map((digit, i) => (
                      <div key={i} className="w-10 h-12 border border-[#00ff33]/50 bg-[#0d1a0d] flex items-center justify-center">
                        <span className="text-[#00ff33] text-2xl font-bold">{digit}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[8px] text-gray-600 tracking-widest mt-2">TYPE THIS INTO THE CALCULATOR TO UNLOCK</div>
                </div>
              </div>

              <button
                onClick={handleConfirm}
                className="w-full py-5 bg-[#cc0000] hover:bg-[#ee0000] text-white font-bold tracking-[0.3em] text-[14px] transition-colors mb-3 border border-[#ff4444]/60 shadow-[0_0_24px_rgba(204,0,0,0.5)] animate-pulse"
              >
                EXECUTE PURGE
              </button>
              <button onClick={() => setStage('warning')} className="text-[11px] text-gray-500 tracking-[0.2em] uppercase hover:text-gray-300 py-2">
                CANCEL OPERATION
              </button>
            </>
          )}
        </div>
      )}

      {/* Watermark */}
      {(stage === 'warning' || stage === 'confirm') && (
        <div className="text-center py-3 overflow-hidden shrink-0">
          <div className="text-[24px] font-bold text-[#161616] tracking-[0.3em] whitespace-nowrap select-none">
            DATA PURGE! // SAFE WORK
          </div>
        </div>
      )}
    </div>
  );
}

function WaveIcon() {
  return (
    <svg className="w-5 h-5 text-[#00ff33]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"/>
    </svg>
  );
}
