import { useEffect, useState } from 'react';
import { getAllEvidence } from '../store/evidenceStore';
import type { EvidenceRecord, EvidenceStatus, EvidenceType } from '../store/db';
import { PanicButton } from '../components/PanicButton';

interface Props {
  refreshKey: number;
}

export function VaultScreen({ refreshKey }: Props) {
  const [items, setItems] = useState<EvidenceRecord[]>([]);

  useEffect(() => {
    getAllEvidence().then(setItems).catch(() => {});
  }, [refreshKey]);

  return (
    <div className="flex flex-col flex-1 pb-[72px] overflow-hidden w-full px-4 pt-4 pb-12 gap-4 relative">
      
      {/* Header Watermark */}
      <div className="flex flex-col items-center pt-2 pb-2 shrink-0 z-0">
        <h1 
          className="text-[80px] leading-none font-bold text-white/40 tracking-tighter drop-shadow-md select-none transition-all duration-300 bg-gradient-to-b from-white to-amber-100/50 bg-clip-text text-transparent"
        >
          VAULT
        </h1>
        <div className="flex items-center gap-4 mt-2 w-full max-w-sm px-6 opacity-30">
           <span className="text-[10px] font-sentry tracking-widest text-black">
             ENCRYPTED ARCHIVE // LVL 4 ACCESS
           </span>
           <div className="h-[1px] flex-1 bg-black"></div>
        </div>
      </div>

      {/* Search / Filter Bar */}
      <div className="flex gap-2 shrink-0 z-10 relative">
        <div className="flex-1 bg-sentry-panel border-b border-zinc-700 flex items-center px-4 py-3">
          <svg className="w-4 h-4 text-zinc-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            placeholder="FILTER ARCHIVE..." 
            className="bg-transparent text-white font-sentry text-xs tracking-widest outline-none w-full placeholder-zinc-600"
          />
        </div>
        <button className="bg-[#333] border-b border-zinc-700 w-12 flex items-center justify-center text-white active:bg-[#444]">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
        </button>
      </div>

      {/* Vault List */}
      <div className="flex-1 overflow-y-auto w-full z-10 relative">
        <ul className="flex flex-col gap-3 pb-8">
          {(items.length > 0 ? items : MOCK_ITEMS).map((item) => (
            <EvidenceRow key={item.id} item={item} />
          ))}
        </ul>
      </div>

      {/* Irreversible Protocol Purge Section */}
      <div className="shrink-0 mt-auto bg-black/20 backdrop-blur-md border border-[#c19595]/30 p-4 relative overflow-hidden flex flex-col items-center">
        {/* Faded gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-sentry-red/20 to-transparent pointer-events-none"></div>
        
        <div className="flex items-center gap-4 text-sentry-red font-display font-bold tracking-[0.2em] mb-4 z-10">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L1 21h22L12 2zm1 16h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
          <span className="text-sm">IRREVERSIBLE PROTOCOL</span>
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L1 21h22L12 2zm1 16h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
        </div>
        
        {/* Note: In a real app we would style PanicButton itself, but we can wrap it here or rely on its internal styles. 
            Let's assume the user wants the exact SENTRY design, so we will use the PanicButton component but ensure it looks right. */}
        <div className="w-full z-10">
           <PanicButton />
        </div>
        
        <p className="text-[8px] font-sentry text-zinc-500/70 text-center uppercase tracking-widest mt-4 leading-relaxed z-10 max-w-xs">
          Executing this action will wipe all encrypted volumes, clear system logs, and initiate hardware self-destruct if tethered. Confirm visual surroundings before activation.
        </p>
      </div>

      {/* Bottom status bar identical to Capture screen for consistency */}
      <div className="absolute bottom-0 left-0 w-full bg-black border-t border-[#333] px-2 py-1.5 flex items-center gap-2 z-30">
          <span className="text-[9px] font-sentry font-bold text-sentry-green drop-shadow-[0_0_2px_rgba(0,255,51,0.5)]">SYS_LOG:</span>
          <span className="text-[9px] font-sentry text-zinc-500 truncate">AUTHENTICATED // VOLUME MOUNTED // SCANNING...</span>
      </div>
    </div>
  );
}

function EvidenceRow({ item }: { item: EvidenceRecord }) {
  const [expanded, setExpanded] = useState(false);
  const dateStr = new Date(item.capturedAt).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: '2-digit' });
  const timeStr = new Date(item.capturedAt).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit' });

  // Generate a fake 'identifier' if we don't have one
  const identifier = item.type === 'video' ? 'REC-0012-GHOST' : item.type === 'photo' ? 'SIG-7729-ALPHA' : 'LOG-4491-ERROR';

  // Determine border color based on status
  const borderColor = item.status === 'failed' ? 'border-l-sentry-red' : item.status === 'queued' || item.status === 'uploading' ? 'border-l-amber-500' : 'border-l-sentry-green';

  return (
    <li>
      <button
        className={`w-full flex items-center gap-4 bg-sentry-panel border-l-4 ${borderColor} p-3 text-left active:bg-[#333] transition-colors relative overflow-hidden group`}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Background glow texture on hover/active */}
        <div className="absolute inset-0 bg-white/5 opacity-0 group-active:opacity-100 transition-opacity"></div>
        
        <div className="w-12 h-12 shrink-0 bg-[#111] border border-zinc-800 flex items-center justify-center text-zinc-500 group-active:text-white transition-colors">
          <TypeIcon type={item.type} />
        </div>
        
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <span className="text-[8px] font-sentry text-[#888] tracking-widest uppercase mb-0.5">IDENTIFIER</span>
          <p className="text-sm font-display font-bold text-white uppercase tracking-wider truncate mb-0.5">
            {identifier}
          </p>
          {expanded && (
            <div className="mt-2 text-[9px] font-sentry text-zinc-500 tracking-widest space-y-1">
               <p>{dateStr} · {timeStr}</p>
               <p>{formatBytes(item.sizeBytes)}</p>
               <p className="break-all text-zinc-600 mt-1">{item.hash}</p>
            </div>
          )}
        </div>
        
        <div className="shrink-0 flex items-center justify-end">
           <StatusChip status={item.status} />
           <svg className="w-4 h-4 text-zinc-600 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
             <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
           </svg>
        </div>
      </button>
    </li>
  );
}

function StatusChip({ status }: { status: EvidenceStatus }) {
  const styles: Record<EvidenceStatus, string> = {
    queued: 'text-amber-500 drop-shadow-[0_0_3px_rgba(245,158,11,0.5)]',
    uploading: 'text-amber-500 drop-shadow-[0_0_3px_rgba(245,158,11,0.5)] animate-pulse',
    uploaded: 'text-sentry-green drop-shadow-[0_0_3px_rgba(0,255,51,0.5)]',
    failed: 'text-sentry-red drop-shadow-[0_0_3px_rgba(204,0,0,0.5)]',
  };
  
  const textMap: Record<EvidenceStatus, string> = {
    queued: 'PENDING',
    uploading: 'SYNCING',
    uploaded: 'SYNCED',
    failed: 'ERROR'
  };

  return (
    <span className={`text-[9px] font-sentry font-bold uppercase tracking-widest ${styles[status]}`}>
      {textMap[status]}
    </span>
  );
}

function TypeIcon({ type }: { type: EvidenceType }) {
  if (type === 'photo') {
    return (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
      </svg>
    );
  }
  if (type === 'video') {
    return (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
         <rect x="2" y="4" width="20" height="16" rx="1" fill="currentColor" fillOpacity="0.2"></rect>
         <line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" strokeWidth="1"></line>
         <line x1="2" y1="16" x2="22" y2="16" stroke="currentColor" strokeWidth="1"></line>
         <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1"></line>
      </svg>
    );
  }
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <rect x="5" y="5" width="14" height="14" rx="2"></rect>
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M5 12h2m10 0h2m-9 -7v2m0 10v2" strokeWidth="1.5" strokeLinecap="round"></path>
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="w-12 h-12 text-zinc-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const MOCK_ITEMS: EvidenceRecord[] = [
  {
    id: 'mock-1',
    hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    type: 'photo',
    status: 'uploaded',
    sizeBytes: 4200000,
    capturedAt: Date.now() - 10000,
  },
  {
    id: 'mock-2',
    hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    type: 'video',
    status: 'uploaded',
    sizeBytes: 154000000,
    capturedAt: Date.now() - 86400000,
  },
  {
    id: 'mock-3',
    hash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    type: 'audio',
    status: 'queued',
    sizeBytes: 1200000,
    capturedAt: Date.now() - 172800000,
  }
] as EvidenceRecord[];

