import React from 'react';

export function TacticalMapScreen() {
  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#0d0d0d] border-b border-[#1a1a1a] shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button className="flex flex-col gap-1 p-1">
            <span className="w-5 h-0.5 bg-[#00ff33]"/>
            <span className="w-5 h-0.5 bg-[#00ff33]"/>
            <span className="w-5 h-0.5 bg-[#00ff33]"/>
          </button>
          <span className="text-[#00ff33] font-bold tracking-[0.15em] text-[13px]">TACTICAL_NET</span>
        </div>
        <WaveIcon />
      </header>

      {/* Map Title Row */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0d0d0d] shrink-0 z-10">
        <h2 className="text-2xl font-bold text-white tracking-widest">EMERGENCY MAP</h2>
        <button className="flex items-center gap-2 bg-[#b8860b] hover:bg-[#d4a017] px-3 py-2 transition-colors">
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
          </svg>
          <span className="text-white font-bold tracking-widest text-[10px]">LOCATION LOCKED</span>
        </button>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Light gray city map background */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(135deg, #d8d8d8 0%, #c8c8c8 50%, #d0d0d0 100%)'
        }}/>

        {/* Road network SVG approximating London */}
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 400 500">
          {/* Background city blocks */}
          <rect width="400" height="500" fill="#c8c8c8"/>

          {/* Parks/green areas */}
          <rect x="20" y="30"  width="80"  height="60"  rx="2" fill="#b8c8b0"/>
          <rect x="220" y="20" width="60"  height="50"  rx="2" fill="#b8c8b0"/>
          <rect x="310" y="80" width="50"  height="40"  rx="2" fill="#b8c8b0"/>
          <rect x="60"  y="320" width="40" height="30"  rx="2" fill="#b8c8b0"/>

          {/* Main roads — thick white */}
          <g fill="white" stroke="#bbb" strokeWidth="0.5">
            {/* Horizontal arterials */}
            <rect x="0"   y="95"  width="400" height="10"/>
            <rect x="0"   y="185" width="400" height="8"/>
            <rect x="0"   y="270" width="400" height="10"/>
            <rect x="0"   y="360" width="400" height="8"/>
            <rect x="0"   y="440" width="400" height="8"/>
            {/* Vertical arterials */}
            <rect x="60"  y="0"   width="8"   height="500"/>
            <rect x="150" y="0"   width="10"  height="500"/>
            <rect x="260" y="0"   width="8"   height="500"/>
            <rect x="340" y="0"   width="8"   height="500"/>
          </g>

          {/* Secondary roads */}
          <g stroke="white" strokeWidth="4" fill="none">
            <line x1="0" y1="145" x2="400" y2="145"/>
            <line x1="0" y1="230" x2="400" y2="230"/>
            <line x1="0" y1="320" x2="400" y2="320"/>
            <line x1="0" y1="415" x2="400" y2="415"/>
            <line x1="110" y1="0" x2="110" y2="500"/>
            <line x1="200" y1="0" x2="200" y2="500"/>
            <line x1="305" y1="0" x2="305" y2="500"/>
          </g>

          {/* Diagonal roads */}
          <g stroke="white" strokeWidth="3.5" fill="none">
            <line x1="0"   y1="150" x2="180" y2="0"/>
            <line x1="0"   y1="300" x2="260" y2="50"/>
            <line x1="100" y1="500" x2="380" y2="100"/>
            <line x1="0"   y1="420" x2="200" y2="220"/>
          </g>

          {/* City block fills */}
          <g fill="#bebebe" opacity="0.6">
            <rect x="70"  y="105" width="35" height="35" rx="1"/>
            <rect x="115" y="105" width="30" height="35" rx="1"/>
            <rect x="160" y="105" width="35" height="35" rx="1"/>
            <rect x="210" y="100" width="40" height="40" rx="1"/>
            <rect x="270" y="105" width="30" height="35" rx="1"/>
            <rect x="315" y="105" width="20" height="35" rx="1"/>
            <rect x="70"  y="155" width="35" height="25" rx="1"/>
            <rect x="115" y="155" width="30" height="25" rx="1"/>
            <rect x="160" y="155" width="40" height="25" rx="1"/>
            <rect x="215" y="155" width="35" height="25" rx="1"/>
            <rect x="270" y="150" width="25" height="30" rx="1"/>
            <rect x="315" y="150" width="20" height="30" rx="1"/>
            <rect x="70"  y="195" width="30" height="30" rx="1"/>
            <rect x="115" y="195" width="35" height="30" rx="1"/>
            <rect x="165" y="195" width="30" height="30" rx="1"/>
            <rect x="215" y="195" width="35" height="30" rx="1"/>
            <rect x="270" y="195" width="25" height="30" rx="1"/>
            <rect x="315" y="195" width="20" height="30" rx="1"/>
            <rect x="70"  y="240" width="35" height="25" rx="1"/>
            <rect x="115" y="240" width="30" height="25" rx="1"/>
            <rect x="165" y="240" width="30" height="25" rx="1"/>
            <rect x="215" y="238" width="40" height="28" rx="1"/>
            <rect x="270" y="240" width="25" height="25" rx="1"/>
            <rect x="315" y="240" width="20" height="25" rx="1"/>
            <rect x="70"  y="280" width="35" height="35" rx="1"/>
            <rect x="115" y="280" width="30" height="35" rx="1"/>
            <rect x="165" y="280" width="30" height="35" rx="1"/>
            <rect x="215" y="280" width="40" height="35" rx="1"/>
            <rect x="270" y="280" width="25" height="35" rx="1"/>
            <rect x="315" y="280" width="20" height="35" rx="1"/>
            <rect x="70"  y="330" width="35" height="25" rx="1"/>
            <rect x="115" y="330" width="30" height="25" rx="1"/>
            <rect x="165" y="330" width="35" height="25" rx="1"/>
            <rect x="215" y="330" width="35" height="25" rx="1"/>
            <rect x="270" y="330" width="30" height="25" rx="1"/>
            <rect x="315" y="330" width="20" height="25" rx="1"/>
          </g>

          {/* Small text labels approximating street names */}
          <g fill="#999" fontSize="5" fontFamily="sans-serif">
            <text x="150" y="93">MAIN ROAD</text>
            <text x="150" y="183">HIGH STREET</text>
            <text x="150" y="268">LONDON ROAD</text>
            <text x="62" y="50" transform="rotate(90 62 50)">NORTH ST</text>
            <text x="152" y="50" transform="rotate(90 152 50)">CENTRAL AVE</text>
          </g>
        </svg>

        {/* Tactical overlays */}
        {/* BLOCKADE_DETECTED */}
        <div className="absolute z-10" style={{top: '22%', left: '30%'}}>
          <div className="bg-[#cc0000]/95 px-2 py-1.5 flex items-center gap-2 shadow-lg min-w-[180px]">
            <svg className="w-3.5 h-3.5 text-white shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
            </svg>
            <div>
              <div className="text-white font-bold tracking-widest text-[10px]">BLOCKADE_DETECTED</div>
              <div className="text-[#ffaaaa] text-[8px] tracking-widest">A-ROUTE COMPROMISED</div>
            </div>
          </div>
          <div className="w-px h-6 bg-[#cc0000] mx-auto"/>
        </div>

        {/* SECTOR_04_HOSP */}
        <div className="absolute z-10" style={{top: '37%', left: '40%'}}>
          <div className="w-px h-4 bg-[#00aa22] mx-auto"/>
          <div className="bg-[#00aa22]/95 px-2 py-1.5 flex items-center gap-2 shadow-lg min-w-[180px]">
            <svg className="w-3.5 h-3.5 text-white shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
            </svg>
            <div>
              <div className="text-white font-bold tracking-widest text-[10px]">SECTOR_04_HOSP</div>
              <div className="text-[#aaffaa] text-[8px] tracking-widest">ETA: 4M 12S</div>
            </div>
          </div>
        </div>

        {/* SAFE_POINT_B */}
        <div className="absolute z-10" style={{top: '57%', left: '18%'}}>
          <div className="w-px h-4 bg-[#333] mx-auto"/>
          <div className="bg-[#1a1a1a]/95 border border-[#333] px-2 py-1.5 flex items-center gap-2 shadow-lg min-w-[180px]">
            <svg className="w-3.5 h-3.5 text-[#00ff33] shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
            </svg>
            <div>
              <div className="text-white font-bold tracking-widest text-[10px]">SAFE_POINT_B</div>
              <div className="text-gray-400 text-[8px] tracking-widest">SECURE STATE: HIGH</div>
            </div>
          </div>
        </div>

        {/* Zoom / GPS Controls */}
        <div className="absolute right-3 bottom-36 flex flex-col gap-1 z-10">
          <button className="w-12 h-12 bg-[#1a1a1a]/95 flex items-center justify-center text-white text-xl font-bold border border-[#333] hover:bg-[#222]">
            +
          </button>
          <button className="w-12 h-12 bg-[#1a1a1a]/95 flex items-center justify-center text-white text-xl font-bold border border-[#333] hover:bg-[#222]">
            −
          </button>
          <button className="w-12 h-12 bg-[#00aa22] flex items-center justify-center border border-[#00ff33]/40 hover:bg-[#00bb26] mt-1">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
            </svg>
          </button>
        </div>

        {/* Current Coordinates Panel */}
        <div className="absolute bottom-3 left-3 bg-[#1a1a1a]/95 border border-[#333] p-3 z-10">
          <div className="text-[#00ff33] text-[8px] font-bold tracking-[0.2em] mb-1">CURRENT COORDINATES</div>
          <div className="text-white font-bold text-[14px] tracking-widest mb-1">51.5072° N, 0.1276° W</div>
          <div className="flex gap-1 mb-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`flex-1 h-1.5 ${i < 6 ? 'bg-[#00ff33]' : 'bg-[#333]'}`}/>
            ))}
          </div>
          <div className="text-gray-500 text-[8px] tracking-widest">SATELLITE LOCK: 78%</div>
        </div>
      </div>
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
