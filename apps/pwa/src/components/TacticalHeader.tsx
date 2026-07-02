import type { ReactNode } from 'react';
import { useSyncStatus } from '../hooks/useSyncStatus';

interface Props {
  title?: string;
  /** Optional custom right-side content; defaults to live link/queue status. */
  right?: ReactNode;
}

/**
 * Shared app header. Shows real state only — link status from navigator.onLine
 * and the actual upload queue depth. Never displays location: the header is
 * visible on every screen and GPS must stay opt-in, one-shot, per use.
 */
export function TacticalHeader({ title = 'TACTICAL_NET', right }: Props) {
  const { online, queueCount } = useSyncStatus(0);

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-[#0d0d0d] border-b border-[#1a1a1a] shrink-0 z-10">
      <div className="flex items-center gap-2.5">
        <svg className="w-5 h-5 text-[#00ff33]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
        </svg>
        <span className="text-[#00ff33] font-bold tracking-[0.15em] text-[13px]">{title}</span>
      </div>
      {right ?? (
        <div className="flex items-center gap-3">
          {queueCount > 0 && (
            <span className="text-[9px] text-[#b8860b] font-bold tracking-widest">
              QUEUE {queueCount}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-[#00ff33] animate-pulse' : 'bg-gray-600'}`}/>
            <span className={`text-[9px] font-bold tracking-widest ${online ? 'text-[#00ff33]' : 'text-gray-500'}`}>
              {online ? 'LINK_UP' : 'OFFLINE'}
            </span>
          </div>
          <WaveIcon />
        </div>
      )}
    </header>
  );
}

export function WaveIcon() {
  return (
    <svg className="w-5 h-5 text-[#00ff33]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"/>
    </svg>
  );
}
