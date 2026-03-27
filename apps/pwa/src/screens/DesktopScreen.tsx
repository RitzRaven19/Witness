import React, { useState, useCallback } from 'react';
import { CaptureScreen } from './CaptureScreen';
import { processUploadQueue } from '../store/uploadQueue';

export function DesktopScreen() {

  const [showCapture, setShowCapture] = useState(false);

  const handleCaptureSaved = useCallback(() => {
    setShowCapture(false);
    processUploadQueue().catch(() => {});
  }, []);

  const [logs] = useState([
    '[ 14:22:01 ] :: NETWORK_OMEGA_STABLE',
    '[ 14:22:04 ] :: ASSET_SYNC: ELENA_S COMPLETE',
    '[ 14:22:09 ] :: GPS_COORD_LOCKED: 45.72 / -122.68',
    '[ 14:22:15 ] :: PERIMETER_ALERT: SECTOR_04_NORTH',
    '[ 14:22:18 ] :: RE-ROUTING SIGNAL THROUGH PROXY_09',
    '[ 14:22:21 ] :: ENCRYPTION_ROTATION_SUCCESS',
    '[ 14:22:30 ] :: SYSTEM_IDLE AWAITING INPUT',
  ]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0d0d0d] text-gray-300 font-sentry overflow-hidden select-none">

      {/* ── TOP HEADER ── */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-[#1e1e1e] bg-[#0a0a0a] shrink-0 z-30">
        <div className="flex items-center gap-4">
          <span className="text-[#00ff33] font-bold text-base tracking-[0.2em]">TACTICAL_INTEL_SYSTEM</span>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-[#00ff33] bg-[#0d1f14] px-2.5 py-1 border border-[#00ff33]/25 tracking-widest">ENCRYPTION: OMEGA</span>
            <span className="text-gray-400 bg-[#141414] px-2.5 py-1 border border-[#2a2a2a] tracking-widest">PPS_LOCKED</span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3 text-[#00ff33]">
            {/* signal bars */}
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <rect x="1" y="12" width="3" height="6" rx="0.5"/>
              <rect x="6" y="8" width="3" height="10" rx="0.5" opacity="0.7"/>
              <rect x="11" y="4" width="3" height="14" rx="0.5" opacity="0.5"/>
              <rect x="16" y="1" width="3" height="17" rx="0.5" opacity="0.3"/>
            </svg>
            {/* crosshair */}
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="10" cy="10" r="4"/>
              <line x1="10" y1="1" x2="10" y2="5"/>
              <line x1="10" y1="15" x2="10" y2="19"/>
              <line x1="1" y1="10" x2="5" y2="10"/>
              <line x1="15" y1="10" x2="19" y2="10"/>
            </svg>
            {/* lock */}
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
            </svg>
            {/* grid */}
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
            </svg>
          </div>
          <span className="text-[#00ff33] font-bold tracking-[0.2em] text-[11px]">SYSTEM_READY</span>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="flex flex-1 overflow-hidden">

        {/* LEFT SIDEBAR */}
        <aside className="w-[268px] flex flex-col bg-[#0a0a0a] border-r border-[#1e1e1e] shrink-0 z-20">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h2 className="text-[#00ff33] font-bold tracking-[0.18em] text-[11px]">COMMS_ASSETS</h2>
            <svg className="w-3.5 h-3.5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd"/>
            </svg>
          </div>

          <div className="px-4 pb-3">
            <input
              type="text"
              placeholder="SEARCH ASSETS..."
              className="w-full bg-[#111] border border-[#1e1e1e] text-[10px] px-3 py-2 text-gray-400 focus:outline-none focus:border-[#00ff33]/40 placeholder:text-gray-600 tracking-widest"
            />
          </div>

          <div className="flex flex-col gap-0 flex-1 overflow-y-auto">
            <AssetItem name="ELENA_S"      status="SECURE"  time="0.4s" dotColor="bg-[#00ff33]" statusColor="text-[#00ff33]" />
            <AssetItem name="YURI_K"       status="STANDBY" time="12m"  dotColor="bg-gray-500"  statusColor="text-gray-400"  />
            <AssetItem name="DOCTOR_V"     status="SECURE"  time="2m"   dotColor="bg-[#00ff33]" statusColor="text-[#00ff33]" />
            <AssetItem name="BASE_COMMAND" status="SECURE"  time="0.1s" dotColor="bg-[#00ff33]" statusColor="text-[#00ff33]" />
          </div>

          <div className="flex gap-0 border-t border-[#1e1e1e] shrink-0">
            <button className="flex-1 bg-[#0d1f14] text-[#00ff33] border-r border-[#1e1e1e] py-3 text-[10px] font-bold tracking-widest hover:bg-[#112a1c] transition-colors">
              ADD ASSET
            </button>
            <button className="flex-1 bg-[#1a0000] text-[#cc3333] py-3 text-[10px] font-bold tracking-widest hover:bg-[#220000] transition-colors">
              PURGE LOGS
            </button>
          </div>
        </aside>

        {/* CENTER MAP */}
        <section className="flex-1 flex flex-col relative bg-[#090909] overflow-hidden">

          {/* Map Background */}
          <div className="absolute inset-0">
            {/* Dark terrain base */}
            <div className="absolute inset-0" style={{background: 'radial-gradient(ellipse at 60% 40%, #1a1f1a 0%, #0d100d 40%, #070907 100%)'}}/>
            {/* Urban road network SVG */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 900 560">
              {/* Building blocks */}
              <g opacity="0.12" fill="#334433">
                <rect x="60"  y="80"  width="70" height="50" rx="1"/>
                <rect x="150" y="60"  width="50" height="60" rx="1"/>
                <rect x="220" y="90"  width="80" height="40" rx="1"/>
                <rect x="70"  y="155" width="55" height="45" rx="1"/>
                <rect x="145" y="145" width="65" height="50" rx="1"/>
                <rect x="240" y="150" width="50" height="55" rx="1"/>
                <rect x="330" y="70"  width="60" height="55" rx="1"/>
                <rect x="410" y="55"  width="75" height="45" rx="1"/>
                <rect x="340" y="145" width="55" height="50" rx="1"/>
                <rect x="415" y="130" width="70" height="55" rx="1"/>
                <rect x="510" y="65"  width="80" height="50" rx="1"/>
                <rect x="510" y="140" width="60" height="55" rx="1"/>
                <rect x="600" y="80"  width="70" height="55" rx="1"/>
                <rect x="690" y="70"  width="80" height="50" rx="1"/>
                <rect x="605" y="155" width="55" height="45" rx="1"/>
                <rect x="680" y="145" width="70" height="55" rx="1"/>
                <rect x="780" y="60"  width="80" height="60" rx="1"/>
                <rect x="790" y="145" width="65" height="50" rx="1"/>
                <rect x="60"  y="260" width="80" height="55" rx="1"/>
                <rect x="160" y="255" width="60" height="50" rx="1"/>
                <rect x="240" y="265" width="75" height="45" rx="1"/>
                <rect x="340" y="250" width="65" height="60" rx="1"/>
                <rect x="425" y="245" width="70" height="55" rx="1"/>
                <rect x="520" y="255" width="55" height="60" rx="1"/>
                <rect x="600" y="250" width="70" height="50" rx="1"/>
                <rect x="690" y="260" width="60" height="55" rx="1"/>
                <rect x="780" y="250" width="80" height="60" rx="1"/>
                <rect x="70"  y="360" width="65" height="50" rx="1"/>
                <rect x="155" y="350" width="75" height="55" rx="1"/>
                <rect x="250" y="365" width="60" height="50" rx="1"/>
                <rect x="340" y="355" width="70" height="55" rx="1"/>
                <rect x="430" y="345" width="65" height="60" rx="1"/>
                <rect x="520" y="360" width="60" height="50" rx="1"/>
                <rect x="605" y="350" width="70" height="60" rx="1"/>
                <rect x="695" y="355" width="75" height="55" rx="1"/>
                <rect x="790" y="360" width="70" height="50" rx="1"/>
                <rect x="70"  y="450" width="70" height="55" rx="1"/>
                <rect x="160" y="455" width="60" height="50" rx="1"/>
                <rect x="250" y="445" width="75" height="60" rx="1"/>
                <rect x="345" y="450" width="65" height="55" rx="1"/>
                <rect x="430" y="445" width="70" height="60" rx="1"/>
                <rect x="520" y="455" width="60" height="55" rx="1"/>
                <rect x="608" y="450" width="68" height="55" rx="1"/>
                <rect x="695" y="445" width="75" height="60" rx="1"/>
                <rect x="790" y="455" width="70" height="55" rx="1"/>
              </g>
              {/* Roads — horizontal */}
              <g stroke="#2a3328" strokeWidth="1.2" fill="none" opacity="0.7">
                <line x1="0" y1="50"  x2="900" y2="50"/>
                <line x1="0" y1="135" x2="900" y2="135"/>
                <line x1="0" y1="215" x2="900" y2="215"/>
                <line x1="0" y1="320" x2="900" y2="320"/>
                <line x1="0" y1="420" x2="900" y2="420"/>
                <line x1="0" y1="510" x2="900" y2="510"/>
              </g>
              {/* Roads — vertical */}
              <g stroke="#2a3328" strokeWidth="1.2" fill="none" opacity="0.7">
                <line x1="55"  y1="0" x2="55"  y2="560"/>
                <line x1="135" y1="0" x2="135" y2="560"/>
                <line x1="215" y1="0" x2="215" y2="560"/>
                <line x1="320" y1="0" x2="320" y2="560"/>
                <line x1="410" y1="0" x2="410" y2="560"/>
                <line x1="500" y1="0" x2="500" y2="560"/>
                <line x1="595" y1="0" x2="595" y2="560"/>
                <line x1="685" y1="0" x2="685" y2="560"/>
                <line x1="775" y1="0" x2="775" y2="560"/>
                <line x1="870" y1="0" x2="870" y2="560"/>
              </g>
              {/* Diagonal arterials */}
              <g stroke="#2f3a2e" strokeWidth="1.5" fill="none" opacity="0.5">
                <line x1="0"   y1="0"   x2="500" y2="560"/>
                <line x1="200" y1="0"   x2="900" y2="470"/>
                <line x1="0"   y1="200" x2="700" y2="560"/>
                <line x1="100" y1="0"   x2="900" y2="560"/>
                <line x1="0"   y1="100" x2="800" y2="560"/>
              </g>
              {/* Highlighted main roads */}
              <g stroke="#3a4d38" strokeWidth="2.5" fill="none" opacity="0.6">
                <line x1="0"   y1="215" x2="900" y2="215"/>
                <line x1="410" y1="0"   x2="410" y2="560"/>
              </g>
            </svg>
          </div>

          {/* Top overlays */}
          <div className="absolute top-3 left-3 right-3 flex justify-between items-start z-10">
            <div className="flex gap-1">
              <div className="bg-[#0a0a0a]/90 border border-[#1e1e1e] px-3 py-2 backdrop-blur-sm">
                <div className="text-[9px] text-[#00ff33] mb-1 tracking-widest">DIAG_STREAM_01</div>
                <div className="text-[13px] text-white tracking-widest font-bold">45.721 / -122.684</div>
              </div>
              <div className="bg-[#0a0a0a]/90 border border-[#1e1e1e] px-3 py-2 backdrop-blur-sm">
                <div className="text-[9px] text-gray-500 mb-1 tracking-widest">HDG</div>
                <div className="text-[13px] text-white tracking-widest font-bold">342° NW</div>
              </div>
            </div>
            <button className="bg-[#cc0000] text-white px-5 py-2.5 text-[11px] font-bold tracking-[0.18em] border border-[#ff4444]/60 hover:bg-[#dd0000] transition-colors shadow-[0_0_12px_rgba(204,0,0,0.4)]">
              LOCATION LOCKED
            </button>
          </div>

          {/* SECTOR_04_HOSP marker */}
          <div className="absolute z-10 flex flex-col items-center" style={{top:'30%', left:'42%', transform:'translate(-50%,-50%)'}}>
            <div className="w-7 h-7 bg-[#00ff33]/15 border border-[#00ff33] flex items-center justify-center mb-1 shadow-[0_0_8px_rgba(0,255,51,0.3)]">
              <div className="w-2.5 h-2.5 border border-[#00ff33]"></div>
            </div>
            <div className="bg-[#0a0a0a]/90 border border-[#00ff33]/60 text-[#00ff33] text-[9px] px-2 py-0.5 tracking-widest backdrop-blur-sm whitespace-nowrap">SECTOR_04_HOSP</div>
          </div>

          {/* BLOCKADE marker */}
          <div className="absolute z-10 flex flex-col items-center" style={{top:'63%', left:'68%', transform:'translate(-50%,-50%)'}}>
            <div className="w-7 h-7 bg-[#cc0000]/20 border border-[#cc0000] flex items-center justify-center mb-1 shadow-[0_0_8px_rgba(204,0,0,0.3)]">
              <svg className="w-4 h-4 text-[#cc0000]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"/>
              </svg>
            </div>
            <div className="bg-[#0a0a0a]/90 border border-[#cc0000]/60 text-[#cc0000] text-[9px] px-2 py-0.5 tracking-widest backdrop-blur-sm">BLOCKADE</div>
          </div>

          {/* Map controls */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-10">
            <button className="w-9 h-9 bg-[#0a0a0a]/90 border border-[#1e1e1e] text-gray-400 flex items-center justify-center hover:text-white hover:border-[#333] transition-colors backdrop-blur-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 4v16m8-8H4"/></svg>
            </button>
            <button className="w-9 h-9 bg-[#0a0a0a]/90 border border-[#1e1e1e] text-gray-400 flex items-center justify-center hover:text-white hover:border-[#333] transition-colors backdrop-blur-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M20 12H4"/></svg>
            </button>
            <button className="w-9 h-9 mt-2 bg-[#0a0a0a]/90 border border-[#00ff33]/40 text-[#00ff33] flex items-center justify-center hover:bg-[#00ff33]/10 transition-colors backdrop-blur-sm shadow-[0_0_6px_rgba(0,255,51,0.15)]">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>
            </button>
          </div>

          {/* BOTTOM PANELS */}
          <div className="absolute bottom-0 left-0 right-0 h-[192px] bg-[#0a0a0a] border-t border-[#1e1e1e] flex z-20">

            {/* Signal Protocols */}
            <div className="w-[230px] shrink-0 p-3 border-r border-[#1e1e1e] flex flex-col">
              <h3 className="text-[9px] text-gray-500 tracking-[0.18em] mb-2.5 uppercase">Signal Protocols</h3>
              <div className="flex flex-col gap-1.5 flex-1">
                <button className="flex items-center justify-between px-2.5 py-2 bg-[#0d0d0d] border border-[#1e1e1e] hover:border-[#00ff33]/30 transition-colors group">
                  <div className="text-left">
                    <div className="text-[11px] text-white tracking-wider group-hover:text-[#00ff33] transition-colors">SILENT ALERT</div>
                    <div className="text-[9px] text-gray-600 tracking-widest">LOW_VISIBILITY_MODE</div>
                  </div>
                  <svg className="w-3.5 h-3.5 text-[#00ff33]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                  </svg>
                </button>
                <button className="flex items-center justify-between px-2.5 py-2 bg-[#0d0d0d] border border-[#1e1e1e] hover:border-[#333] transition-colors">
                  <div className="text-left">
                    <div className="text-[11px] text-white tracking-wider">AUDIO BEACON</div>
                    <div className="text-[9px] text-gray-600 tracking-widest">HIGH_FREQ_PULSE</div>
                  </div>
                  <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
                  </svg>
                </button>
                <button className="flex items-center justify-between px-2.5 py-2 bg-[#1a0000]/60 border border-[#cc0000]/70 hover:bg-[#1a0000] transition-colors">
                  <div className="text-left">
                    <div className="text-[11px] text-white tracking-wider">MEDICAL EMERGENCY</div>
                    <div className="text-[9px] text-[#cc3333] tracking-widest">CRITICAL_PRIORITY</div>
                  </div>
                  <svg className="w-3.5 h-3.5 text-[#cc0000]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
                  </svg>
                </button>
              </div>
              <div className="mt-2.5 pt-2 border-t border-[#1e1e1e] flex items-center justify-between">
                <span className="text-[10px] text-white tracking-widest">SEND LOCATION</span>
                {/* Toggle ON */}
                <div className="w-9 h-5 bg-[#00ff33]/20 rounded-full border border-[#00ff33]/60 flex items-center px-0.5 cursor-pointer relative">
                  <div className="w-4 h-4 bg-[#00ff33] rounded-full shadow ml-auto"></div>
                </div>
              </div>
            </div>

            {/* Secure Vault */}
            <div className="w-[200px] shrink-0 p-3 border-r border-[#1e1e1e] flex flex-col">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-[9px] text-gray-500 tracking-[0.18em] uppercase">Secure Vault</h3>
                <svg className="w-3 h-3 text-[#00ff33]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
                </svg>
              </div>
              <div className="grid grid-cols-2 gap-1.5 flex-1">
                <VaultItem label="SURVIVAL_P"  type="folder" />
                <VaultItem label="INTEL_LOGS"  type="folder" />
                <VaultItem label="BLEED_CTRL"  type="doc"    active />
                <VaultItem label="NEW_FILE"    type="plus"   placeholder onClick={() => setShowCapture(true)} />
              </div>
            </div>

            {/* First Aid */}
            <div className="flex-1 p-3 flex flex-col">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-[11px] text-white font-bold tracking-widest leading-snug">FIRST AID: STOP<br/>BLEEDING</div>
                  <div className="text-[9px] text-gray-600 mt-1 tracking-wider leading-relaxed">VERSION 4.2<br/>// SECURITY CLEARANCE: LEVEL 2</div>
                </div>
                <button className="bg-[#141414] border border-[#222] hover:border-[#444] text-[9px] px-2.5 py-1.5 tracking-widest text-gray-400 transition-colors">
                  DOWNLOAD_SECURE_PDF
                </button>
              </div>
              <div className="flex-1 border-l-2 border-[#cc0000] pl-2.5 bg-[#130808] p-2 mt-1">
                <div className="text-[10px] font-bold text-[#cc3333] mb-1 tracking-widest">CRITICAL WARNING</div>
                <div className="text-[9px] text-gray-400 leading-relaxed">
                  Apply direct pressure immediately. Ensure tactical security of perimeter before initiating detailed medical procedures.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT SIDEBAR */}
        <aside className="w-[290px] flex flex-col bg-[#0a0a0a] border-l border-[#1e1e1e] shrink-0 p-4 z-20">

          {/* Operator */}
          <div className="flex items-center gap-3 border border-[#1e1e1e] p-2.5 bg-[#0d0d0d] mb-5">
            <div className="w-10 h-10 bg-[#00ff33]/10 border border-[#00ff33]/40 flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-[#00ff33]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
            <div>
              <div className="text-[#00ff33] text-[13px] font-bold tracking-widest">OPERATOR_01</div>
              <div className="text-[9px] text-gray-600 tracking-widest mt-0.5">COMMAND_STRAT | GHOST_LEAD</div>
            </div>
          </div>

          {/* Security Encryption */}
          <div className="text-[9px] text-gray-500 tracking-[0.18em] uppercase mb-2">Security Encryption</div>
          <div className="flex items-center justify-between border border-[#1e1e1e] bg-[#0d0d0d] px-3 py-2.5 mb-5">
            <span className="text-[#00ff33] text-[11px] tracking-widest">AES-256-HDM</span>
            <svg className="w-4 h-4 text-[#00ff33]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
            </svg>
          </div>

          {/* Audio Alerts */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] text-gray-500 tracking-[0.18em] uppercase">Audio Alerts</span>
            <span className="text-[9px] text-white tracking-widest">MASTER GAIN &nbsp; 82%</span>
          </div>
          <div className="h-1.5 bg-[#1a1a1a] mb-5">
            <div className="h-full bg-[#00ff33] w-[82%] shadow-[0_0_4px_rgba(0,255,51,0.5)]"></div>
          </div>

          {/* Purge All Data */}
          <button className="w-full bg-[#cc0000] hover:bg-[#dd0000] text-white py-4 mb-5 border border-[#ff4444]/40 transition-colors group shadow-[0_0_16px_rgba(204,0,0,0.25)]">
            <div className="font-bold tracking-[0.18em] text-[12px] mb-0.5">PURGE ALL DATA</div>
            <div className="text-[9px] text-[#ffaaaa] tracking-widest">BIOMETRIC AUTHORIZATION REQUIRED</div>
          </button>

          {/* System Logs */}
          <div className="text-[9px] text-gray-500 tracking-[0.18em] uppercase mb-2">System Logs</div>
          <div className="flex-1 border border-[#1e1e1e] bg-[#060606] p-2.5 overflow-y-auto text-[9px] text-[#00cc28] font-sentry leading-[1.8] tracking-wide">
            {logs.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </aside>
      </main>

      {/* ── BOTTOM NAV ── */}
      <nav className="h-[58px] bg-[#0a0a0a] border-t border-[#1e1e1e] flex shrink-0 z-30">
        <NavBtn icon={<HomeIcon />}     label="HOME"     />
        <NavBtn icon={<CommsIcon />}    label="COMMS"    active />
        <NavBtn icon={<SignalIcon />}   label="SIGNAL"   />
        <NavBtn icon={<ShieldIcon />}   label="SEC"      />
        <NavBtn icon={<LockIcon />}     label="VAULT"    />
        <NavBtn icon={<MapIcon />}      label="MAP"      />
        <NavBtn icon={<SettingsIcon />} label="SETTINGS" />
      </nav>

      {/* ── CAPTURE OVERLAY ── */}
      {showCapture && (
        <div className="absolute inset-0 z-50 bg-[#0d0d0d] flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e1e1e] bg-[#0a0a0a] shrink-0">
            <span className="text-[#00ff33] text-[11px] font-bold tracking-[0.2em]">CAPTURE_TERMINAL</span>
            <button
              onClick={() => setShowCapture(false)}
              className="text-gray-500 hover:text-gray-300 text-[10px] tracking-widest px-3 py-1 border border-[#222] hover:border-[#444]"
            >
              ✕ CLOSE
            </button>
          </div>
          <CaptureScreen onSaved={handleCaptureSaved} />
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function AssetItem({ name, status, time, dotColor, statusColor }: {
  name: string; status: string; time: string; dotColor: string; statusColor: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 border-b border-[#141414] hover:bg-[#0d0d0d] transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-white text-[11px] font-bold tracking-widest">{name}</span>
        <span className={`${statusColor} text-[9px] tracking-widest`}>{status}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></div>
        <span className="text-gray-600 text-[9px] tracking-widest uppercase">LAST SYNC: {time} AGO</span>
      </div>
    </div>
  );
}

function VaultItem({ label, type, active, placeholder, onClick }: {
  label: string; type: 'folder' | 'doc' | 'plus'; active?: boolean; placeholder?: boolean; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center py-2 px-1 border transition-all ${
      active       ? 'border-[#00ff33]/60 bg-[#00ff33]/8 text-[#00ff33]'
      : placeholder ? 'border-dashed border-[#222] text-gray-600 hover:border-[#333] hover:text-gray-400'
      : 'border-[#1e1e1e] bg-[#0d0d0d] text-gray-500 hover:border-[#333] hover:text-gray-300'
    }`}>
      <div className="w-5 h-5 mb-1 flex items-center justify-center">
        {type === 'folder' && (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M2 6a2 2 0 012-2h5l2 2h7a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
          </svg>
        )}
        {type === 'doc' && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        )}
        {type === 'plus' && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
        )}
      </div>
      <span className="text-[8px] tracking-widest uppercase">{label}</span>
    </button>
  );
}

function NavBtn({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button className={`flex-1 flex flex-col items-center justify-center gap-0.5 border-t-2 transition-colors ${
      active
        ? 'border-[#00ff33] text-[#00ff33] bg-[#00ff33]/5'
        : 'border-transparent text-gray-600 hover:text-gray-400 hover:bg-[#111]'
    }`}>
      <div className="w-5 h-5">{icon}</div>
      <span className={`text-[8px] font-bold tracking-[0.15em] ${active ? 'text-[#00ff33]' : ''}`}>{label}</span>
    </button>
  );
}

/* ─── Icons ─── */
function HomeIcon()     { return <svg fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg>; }
function CommsIcon()    { return <svg fill="currentColor" viewBox="0 0 20 20"><path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/><path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/></svg>; }
function SignalIcon()   { return <svg fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>; }
function ShieldIcon()   { return <svg fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z" clipRule="evenodd"/></svg>; }
function LockIcon()     { return <svg fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/></svg>; }
function MapIcon()      { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>; }
function SettingsIcon() { return <svg fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>; }
