import { useState } from 'react';
import type { MobileTab } from '../App';
import { QrScannerModal } from '../components/QrScannerModal';

interface Props {
  onNavigate: (tab: MobileTab) => void;
  onPurge: () => void;
}

export function HomeScreen({ onNavigate, onPurge }: Props) {
  const [showQr, setShowQr] = useState(false);

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-y-auto">
      {showQr && <QrScannerModal onClose={() => setShowQr(false)} />}
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#0d0d0d] border-b border-[#1a1a1a] shrink-0">
        <div className="flex items-center gap-3">
          <button className="flex flex-col gap-1 p-1">
            <span className="w-5 h-0.5 bg-[#00ff33]"/>
            <span className="w-5 h-0.5 bg-[#00ff33]"/>
            <span className="w-5 h-0.5 bg-[#00ff33]"/>
          </button>
          <span className="text-[#00ff33] font-bold tracking-[0.15em] text-[13px]">TACTICAL_NET</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[8px] text-[#00ff33] tracking-widest">GPS_LOCKED</span>
          <span className="text-[9px] text-[#00ff33] tracking-widest">42.3601° N, 71.0589° W</span>
        </div>
        <WaveIcon />
      </header>

      {/* Hero */}
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-5xl font-bold text-white tracking-wider leading-none">HOME</h1>
        <div className="w-12 h-0.5 bg-[#00ff33] mt-2 mb-3"/>
        <p className="text-[11px] text-gray-400 tracking-widest uppercase">
          SYSTEM STATUS: OPERATIONAL // ENCRYPTED
        </p>
      </div>

      {/* Menu Items */}
      <div className="px-4 flex flex-col gap-2 pb-4">
        <MenuItem
          icon={<CaptureMenuIcon />}
          label="CAPTURE EVIDENCE"
          sub="ENCRYPT & SECURE MEDIA NOW"
          accent
          onClick={() => onNavigate('capture')}
        />
        <MenuItem
          icon={<CommsMenuIcon />}
          label="SECURE COMMS"
          sub="END-TO-END ENCRYPTED NODE"
          onClick={() => onNavigate('comms')}
        />
        <MenuItem
          icon={<SignalMenuIcon />}
          label="SIGNAL HELP"
          sub="BROADCAST DISTRESS BEACON"
          subRed
          onClick={() => onNavigate('signal')}
        />
        <MenuItem
          icon={<MapMenuIcon />}
          label="EMERGENCY MAP"
          sub="LOCAL SAFE-ZONES & HAZARDS"
          onClick={() => onNavigate('map')}
        />
        <MenuItem
          icon={<DocsMenuIcon />}
          label="DOCUMENTS"
          sub="SURVIVAL PROTOCOLS & IDS"
          onClick={() => onNavigate('vault')}
        />
        <MenuItem
          icon={<QrMenuIcon />}
          label="SCAN QR"
          sub="RECEIVE DATA VIA QR CODE"
          onClick={() => setShowQr(true)}
        />
        <MenuItem
          icon={<SettingsMenuIcon />}
          label="SETTINGS"
          sub="SYSTEM CONFIG & SECURITY"
          onClick={onPurge}
        />
      </div>

      {/* System Log */}
      <div className="mx-4 mb-4 bg-[#0a0a0a] border border-[#1a1a1a] p-3 flex-1">
        <div className="text-[9px] text-[#00cc28] font-sentry leading-[1.9] tracking-wide">
          <div>&gt; INITIALIZING SECONDARY MESH NETWORK...</div>
          <div>&gt; HANDSHAKE SEQUENCE AUTHORIZED VIA PROTOCOL 4.9.2</div>
          <div>&gt; WAITING FOR PEER-TO-PEER CONFIRMATION... [OK]</div>
        </div>
      </div>
    </div>
  );
}

function MenuItem({ icon, label, sub, subRed, accent, onClick }: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  subRed?: boolean;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-4 border px-4 py-4 transition-all text-left active:scale-[0.99] ${
        accent
          ? 'bg-[#0d1f10] border-[#00ff33]/50 hover:bg-[#112a14] hover:border-[#00ff33]/80'
          : 'bg-[#141414] border-[#1e1e1e] hover:bg-[#1a1a1a] hover:border-[#00ff33]/30'
      }`}
    >
      <div className="w-8 h-8 flex items-center justify-center text-[#00ff33] shrink-0">{icon}</div>
      <div className="flex-1">
        <div className={`font-bold tracking-widest text-[13px] ${accent ? 'text-[#00ff33]' : 'text-white'}`}>{label}</div>
        <div className={`text-[10px] tracking-widest mt-0.5 ${subRed ? 'text-[#cc4444]' : accent ? 'text-[#00cc28]/70' : 'text-gray-500'}`}>{sub}</div>
      </div>
      <svg className="w-4 h-4 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
      </svg>
    </button>
  );
}

/* Icons */
function CaptureMenuIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"/></svg>; }
function WaveIcon() {
  return (
    <svg className="w-5 h-5 text-[#00ff33]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"/>
    </svg>
  );
}
function CommsMenuIcon() { return <svg fill="currentColor" viewBox="0 0 24 24" className="w-6 h-6"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>; }
function SignalMenuIcon() { return <svg fill="currentColor" viewBox="0 0 24 24" className="w-6 h-6 text-[#cc4444]"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>; }
function MapMenuIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>; }
function DocsMenuIcon() { return <svg fill="currentColor" viewBox="0 0 24 24" className="w-6 h-6"><path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>; }
function QrMenuIcon() { return <svg fill="currentColor" viewBox="0 0 24 24" className="w-6 h-6"><path d="M3 11V3h8v8H3zm2-2h4V5H5v4zm8-4V3h8v8h-8V5zm2 2v4h4V7h-4zM3 21v-8h8v8H3zm2-2h4v-4H5v4zm13 2v-2h2v2h-2zm0-4v-2h2v2h-2zm-4 4v-2h2v2h-2zm0-4v-2h2v2h-2zm0-4v-2h4v2h-4z"/></svg>; }
function SettingsMenuIcon() { return <svg fill="currentColor" viewBox="0 0 20 20" className="w-6 h-6"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>; }
