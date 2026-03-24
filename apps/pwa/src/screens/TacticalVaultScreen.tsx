import React from 'react';

export function TacticalVaultScreen() {
  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-y-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#0d0d0d] border-b border-[#1a1a1a] shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[#00ff33]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
          </svg>
          <span className="text-[#00ff33] font-bold tracking-[0.15em] text-[13px]">TACTICAL_NET_SECURE</span>
        </div>
        <GridIcon />
      </header>

      {/* Protocol Info */}
      <div className="mx-4 mt-4 mb-4 bg-[#111] border border-[#1e1e1e] p-4">
        <div className="mb-3">
          <div className="text-[9px] text-gray-500 tracking-widest">PROTOCOL_ID</div>
          <div className="text-[#00ff33] font-bold tracking-widest text-[14px]">ALPHA-6-MED</div>
        </div>
        <div className="mb-3">
          <div className="text-[9px] text-gray-500 tracking-widest">CLEARANCE LEVEL</div>
          <div className="text-white font-bold tracking-widest text-[13px]">LVL_5_CLEARANCE</div>
        </div>
        <div>
          <div className="text-[9px] text-gray-500 tracking-widest">STATUS</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="w-2 h-2 bg-[#00ff33]"/>
            <span className="text-[#00ff33] font-bold tracking-widest text-[12px]">ACTIVE_DEPLOAYMENT</span>
          </div>
        </div>
      </div>

      {/* System Diagnostics */}
      <div className="mx-4 mb-4 bg-[#111] border border-[#1e1e1e] p-3">
        <div className="text-[9px] text-gray-500 tracking-[0.18em] uppercase mb-2">System_Diagnostics</div>
        <div className="flex gap-1 mb-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-2 ${
                i < 7 ? 'bg-[#00ff33]' : i < 9 ? 'bg-[#aacc00]' : 'bg-[#1e1e1e]'
              }`}
            />
          ))}
        </div>
        <div className="text-[9px] text-gray-500 tracking-widest">ENCRYPTION: 256-BIT_AES_LOCKED</div>
      </div>

      {/* Hero Card */}
      <div className="mx-4 mb-4 relative overflow-hidden bg-[#111]" style={{ height: 200 }}>
        {/* Dark medical-kit background using CSS */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#141414] to-[#0a0a0a]"/>
        {/* Medical cross pattern */}
        <div className="absolute inset-0 flex items-center justify-center opacity-10">
          <svg className="w-48 h-48 text-[#00ff33]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
          </svg>
        </div>
        {/* Bag silhouette using CSS shapes */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-36 h-28 bg-[#222] rounded-sm opacity-80"/>
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-12 h-6 bg-[#222] rounded-t-sm opacity-80"/>
        {/* Text overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-[#000] to-transparent">
          <h3 className="text-xl font-bold text-white leading-tight">FIRST AID: STOP<br/>BLEEDING</h3>
        </div>
      </div>

      {/* Steps */}
      <div className="px-4 flex flex-col gap-3 mb-4">
        <Step num="01" label="DIRECT PRESSURE" numColor="text-[#00ff33]" borderColor="border-[#00ff33]/30">
          {[
            'LOCATE SOURCE OF HEMORRHAGE IMMEDIATELY.',
            'APPLY FIRM, STEADY PRESSURE WITH CLEAN GAUZE.',
            'IF GAUZE SOAKS THROUGH, DO NOT REMOVE; ADD MORE LAYERS.',
            'MAINTAIN PRESSURE FOR AT LEAST 5 MINUTES WITHOUT INTERRUPTION.',
          ]}
        </Step>
        <Step num="02" label="ELEVATION" numColor="text-[#00ff33]" borderColor="border-[#00ff33]/30">
          {[
            'ELEVATE THE WOUNDED LIMB ABOVE HEART LEVEL.',
            'ENSURE NO SECONDARY FRACTURES PREVENT MOVEMENT.',
            'MONITOR DISTAL PULSE AND SKIN TEMPERATURE.',
          ]}
        </Step>
        <Step num="03" label="TOURNIQUET USE" numColor="text-[#cc4444]" borderColor="border-[#cc0000]/40">
          {[
            'APPLY ONLY IF DIRECT PRESSURE FAILS TO STOP LIFE-THREATENING BLEEDING.',
            'POSITION 2-3 INCHES ABOVE THE WOUND (NOT ON A JOINT).',
            'TIGHTEN UNTIL BLEEDING COMPLETELY STOPS.',
            'MARK TIME OF APPLICATION ON PATIENT\'S FOREHEAD: [T: HH:MM].',
          ]}
        </Step>

        {/* Critical Warning */}
        <div className="bg-[#1a0505] border border-[#cc0000]/40 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <svg className="w-3.5 h-3.5 text-[#cc4444]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
            </svg>
            <span className="text-[9px] text-[#cc4444] font-bold tracking-[0.2em]">CRITICAL_WARNING</span>
          </div>
          <p className="text-[10px] text-gray-400 leading-relaxed tracking-wide">
            NEURAL SHOCK IMMINENT. ADMINISTER HYDRATION AND MAINTAIN BODY CORE TEMPERATURE. DO NOT REMOVE TOURNIQUET ONCE APPLIED.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mx-4 mb-4 flex justify-between items-center border-t border-[#1e1e1e] pt-3">
        <div>
          <div className="text-[9px] text-gray-600 tracking-widest">TIMESTAMP</div>
          <div className="text-[9px] text-gray-400 tracking-widest">2023-10-24 14:32:01 ZULU</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-gray-600 tracking-widest">ENCRYPTION</div>
          <div className="text-[9px] text-[#00ff33] tracking-widest">SIG_DELTA_VERIFIED</div>
        </div>
      </div>

      {/* Download button */}
      <div className="px-4 pb-5">
        <button className="w-full py-3.5 bg-[#0d0d0d] border border-[#00ff33]/30 text-[#00ff33] text-[11px] font-bold tracking-[0.2em] hover:bg-[#0d1f10] hover:border-[#00ff33]/60 transition-all">
          DOWNLOAD_SECURE_PDF
        </button>
      </div>
    </div>
  );
}

function Step({ num, label, numColor, borderColor, children }: {
  num: string; label: string; numColor: string; borderColor: string; children: string[];
}) {
  return (
    <div className={`bg-[#111] border ${borderColor} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-[10px] font-bold tracking-widest border ${borderColor} px-1.5 py-0.5 ${numColor}`}>{num}</span>
        <span className="text-white font-bold tracking-widest text-[12px]">{label}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {children.map((line, i) => (
          <p key={i} className="text-[10px] text-gray-400 tracking-wide leading-relaxed">
            &gt; {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function GridIcon() {
  return (
    <svg className="w-5 h-5 text-[#00ff33]" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.2}>
      <rect x="2" y="2" width="6" height="6"/>
      <rect x="12" y="2" width="6" height="6"/>
      <rect x="2" y="12" width="6" height="6"/>
      <rect x="12" y="12" width="6" height="6"/>
    </svg>
  );
}
