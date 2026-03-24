import { useState } from 'react';
import { PanicButton } from '../components/PanicButton';

interface Contact {
  id: string;
  name: string;
  status: 'SECURE' | 'STANDBY' | 'COMPROMISED' | 'UNKNOWN';
  lastSeen: string;
  location?: string;
}

const MOCK_CONTACTS: Contact[] = [
  { id: '1', name: 'ELENA_S', status: 'SECURE', lastSeen: '0.4s AGO', location: 'SECTOR_04_HOSP' },
  { id: '2', name: 'YURI_K', status: 'STANDBY', lastSeen: '12m AGO' },
  { id: '3', name: 'DOCTOR_V', status: 'SECURE', lastSeen: '2m AGO', location: 'BASE_COMMAND' },
  { id: '4', name: 'BASE_COMMAND', status: 'SECURE', lastSeen: '0.1s AGO', location: 'POINT_ZERO' },
  { id: '5', name: 'AGENT_X', status: 'COMPROMISED', lastSeen: '1h AGO', location: 'UNKNOWN' },
];

export function ContactsScreen() {
  const [search, setSearch] = useState('');

  const filteredContacts = MOCK_CONTACTS.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col flex-1 pb-[72px] overflow-hidden w-full px-4 pt-4 pb-12 gap-4 relative">
      
      {/* Header Watermark */}
      <div className="flex flex-col items-center pt-2 pb-2 shrink-0 z-0 pointer-events-none">
        <h1 
          className="text-[60px] leading-none font-bold text-white/40 tracking-tighter drop-shadow-md select-none transition-all duration-300 bg-gradient-to-b from-white to-sentry-green/20 bg-clip-text text-transparent uppercase text-center"
        >
          CONTACTS
        </h1>
        <div className="flex items-center gap-4 mt-2 w-full max-w-sm px-6 opacity-30">
           <span className="text-[10px] font-sentry tracking-widest text-black">
             SECURE_ASSET_NETWORK // LVL 2
           </span>
           <div className="h-[1px] flex-1 bg-black"></div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex gap-2 shrink-0 z-10 relative">
        <div className="flex-1 bg-sentry-panel border-b border-zinc-700 flex items-center px-4 py-3">
          <svg className="w-4 h-4 text-zinc-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            placeholder="SEARCH ASSETS..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-white font-sentry text-xs tracking-widest outline-none w-full placeholder-zinc-600 uppercase"
          />
        </div>
      </div>

      {/* Contacts List */}
      <div className="flex-1 overflow-y-auto w-full z-10 relative">
        <div className="flex flex-col gap-3 pb-8">
          {filteredContacts.map((contact) => (
            <ContactRow key={contact.id} contact={contact} />
          ))}
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="shrink-0 mt-auto bg-black/20 backdrop-blur-md border border-zinc-800 p-4 relative overflow-hidden flex flex-col items-center">
        <div className="absolute inset-0 bg-gradient-to-t from-sentry-green/5 to-transparent pointer-events-none"></div>
        <div className="w-full z-10">
           <PanicButton />
        </div>
        <p className="text-[8px] font-sentry text-zinc-500/70 text-center uppercase tracking-widest mt-4 leading-relaxed z-10 max-w-xs">
          CAUTION: DATA PURGE IS IRREVERSIBLE. ENSURE ALL CRITICAL COMMS ARE LOGGED BEFORE INITIATING RESET.
        </p>
      </div>

      {/* System Log Overlay (matching other screens) */}
      <div className="absolute bottom-0 left-0 w-full bg-black border-t border-[#333] px-2 py-1.5 flex items-center gap-2 z-30">
          <span className="text-[9px] font-sentry font-bold text-sentry-green drop-shadow-[0_0_2px_rgba(0,255,51,0.5)]">SYS_LOG:</span>
          <span className="text-[9px] font-sentry text-zinc-500 truncate">CONTACT_DB_LOADED // {filteredContacts.length} ASSETS ONLINE</span>
      </div>
    </div>
  );
}

function ContactRow({ contact }: { contact: Contact }) {
  const statusColors = {
    SECURE: 'text-sentry-green border-l-sentry-green',
    STANDBY: 'text-zinc-500 border-l-zinc-500',
    COMPROMISED: 'text-sentry-red border-l-sentry-red',
    UNKNOWN: 'text-amber-500 border-l-amber-500',
  };

  return (
    <div className={`flex items-center gap-4 bg-sentry-panel border-l-4 ${statusColors[contact.status]} p-3 transition-colors relative group overflow-hidden shadow-lg`}>
      {/* Background glow texture */}
      <div className="absolute inset-0 bg-white/5 opacity-0 group-active:opacity-100 transition-opacity pointer-events-none"></div>
      
      {/* Avatar Placeholder */}
      <div className="w-12 h-12 shrink-0 bg-[#111] border border-zinc-800 flex items-center justify-center text-zinc-600 transition-colors">
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
      </div>
      
      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center justify-between mb-0.5">
          <p className="text-sm font-display font-bold text-white uppercase tracking-wider truncate">
            {contact.name}
          </p>
          <span className={`text-[9px] font-sentry font-bold tracking-[0.2em] ${statusColors[contact.status].split(' ')[0]}`}>
            {contact.status}
          </span>
        </div>
        <div className="flex items-center gap-2 opacity-60 text-[8px] font-sentry">
          <span className="text-zinc-400 uppercase">LAST SEEN: {contact.lastSeen}</span>
          {contact.location && (
            <>
              <span className="text-zinc-700">•</span>
              <span className="text-zinc-400 uppercase">{contact.location}</span>
            </>
          )}
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="shrink-0 flex items-center gap-2">
        <button className="w-8 h-8 flex items-center justify-center bg-[#111] border border-zinc-800 text-sentry-green hover:bg-sentry-green/10 active:bg-sentry-green/20 transition-all">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
          </svg>
        </button>
        <button className="w-8 h-8 flex items-center justify-center bg-[#111] border border-zinc-800 text-sentry-green hover:bg-sentry-green/10 active:bg-sentry-green/20 transition-all">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
