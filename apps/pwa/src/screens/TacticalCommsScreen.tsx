import React, { useState } from 'react';

interface Contact {
  id: string;
  name: string;
  fullName: string;
  line: string;
  lastSync: string;
  online: boolean;
  avatar?: string;
}

const CONTACTS: Contact[] = [
  { id: '1', name: 'ELENA',        fullName: 'Elena',        line: 'ENCRYPTED LINE: 44.02-X', lastSync: '2M AGO',  online: true  },
  { id: '2', name: 'YURI',         fullName: 'Yuri',         line: 'ENCRYPTED LINE: 12.88-B', lastSync: '14M AGO', online: true  },
  { id: '3', name: 'DOCTOR',       fullName: 'Doctor',       line: 'MED-COMMS: 00.91-A',      lastSync: '1H AGO',  online: true  },
  { id: '4', name: 'BASE COMMAND', fullName: 'Base Command', line: 'HQ-SATLINK: PRIORITY',     lastSync: 'LIVE',    online: true  },
];

export function TacticalCommsScreen() {
  const [selected, setSelected] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');

  if (selected) {
    return <ChatScreen contact={selected} onBack={() => setSelected(null)} />;
  }

  const filtered = CONTACTS.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#0d0d0d] border-b border-[#1a1a1a] shrink-0">
        <div className="flex items-center gap-3">
          <HamburgerIcon />
          <span className="text-[#00ff33] font-bold tracking-[0.15em] text-[13px]">TACTICAL_NET</span>
        </div>
        <WaveIcon />
      </header>

      {/* Title */}
      <div className="mx-4 mt-4 mb-3 border-l-2 border-[#00ff33] pl-3">
        <h2 className="text-4xl font-bold text-white tracking-wide">CONTACTS</h2>
        <div className="flex items-center gap-1.5 mt-1">
          <div className="w-2 h-2 rounded-full bg-[#00ff33]"/>
          <span className="text-[#00ff33] text-[11px] font-bold tracking-widest">CONFIRMED</span>
        </div>
      </div>

      {/* Search */}
      <div className="mx-4 mb-4">
        <div className="flex items-center gap-2 bg-[#141414] border border-[#1e1e1e] px-3 py-2.5">
          <svg className="w-4 h-4 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="text"
            placeholder="FILTER BY ID OR FREQUENCY..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-[11px] text-gray-400 tracking-widest placeholder:text-gray-700 focus:outline-none"
          />
        </div>
      </div>

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto mx-4 flex flex-col gap-2">
        {filtered.map(c => (
          <button
            key={c.id}
            onClick={() => setSelected(c)}
            className="flex items-center gap-3 bg-[#111] border border-[#1e1e1e] p-3 hover:border-[#00ff33]/30 hover:bg-[#141414] transition-all text-left active:scale-[0.99]"
          >
            <div className="relative shrink-0">
              <div className="w-12 h-12 bg-[#222] flex items-center justify-center">
                <AvatarIcon name={c.name} />
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#00ff33] border-2 border-[#111]"/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white tracking-widest text-[13px]">{c.name}</div>
              <div className="text-[10px] text-gray-500 tracking-wider mt-0.5">{c.line}</div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="flex items-center gap-1 bg-[#0d2010] border border-[#00ff33]/40 px-2 py-0.5">
                <svg className="w-2.5 h-2.5 text-[#00ff33]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
                </svg>
                <span className="text-[#00ff33] text-[9px] font-bold tracking-widest">SECURE</span>
              </div>
              <span className="text-[9px] text-gray-600 tracking-widest">LAST SYNC: {c.lastSync}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-0 border-t border-[#1a1a1a] shrink-0">
        <button className="flex-1 flex items-center justify-center gap-2 bg-[#141414] py-3.5 border-r border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors">
          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          <span className="text-[11px] font-bold tracking-widest text-gray-400">ADD ASSET</span>
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 bg-[#cc0000] py-3.5 hover:bg-[#dd0000] transition-colors">
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          <span className="text-[11px] font-bold tracking-widest text-white">PURGE LOGS</span>
        </button>
      </div>
    </div>
  );
}

/* ── Chat Screen ── */
function ChatScreen({ contact, onBack }: { contact: Contact; onBack: () => void }) {
  const [message, setMessage] = useState('');

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      {/* Chat Header */}
      <header className="flex items-center gap-3 px-3 py-3 bg-[#111] border-b border-[#1a1a1a] shrink-0">
        <button onClick={onBack} className="text-[#00ff33] p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className="w-10 h-10 bg-[#222] flex items-center justify-center shrink-0 relative">
          <AvatarIcon name={contact.name} />
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#00ff33] border-2 border-[#111]"/>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-bold tracking-widest text-[13px]">{contact.fullName}</div>
          <div className="text-[#00ff33] text-[9px] tracking-widest">ENCRYPTED_CHANNEL_7</div>
        </div>
        <div className="text-[9px] text-gray-500 tracking-widest">SQ_ID: 88-X9</div>
        <button className="w-8 h-8 bg-[#1a1a1a] border border-[#222] flex items-center justify-center ml-1">
          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
        </button>
        <button className="w-8 h-8 bg-[#1a1a1a] border border-[#cc0000]/40 flex items-center justify-center">
          <svg className="w-4 h-4 text-[#cc0000]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
        </button>
      </header>

      {/* Auto-delete warning */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a0a0a] border-b border-[#cc0000]/30 shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-[#cc4444]" fill="currentColor" viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
          <span className="text-[9px] text-[#cc4444] tracking-widest font-bold">AUTODELETE_PROTOCOL_ENGAGED</span>
        </div>
        <span className="text-[9px] text-[#cc4444] tracking-widest">TTL: 120S</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-4">
        {/* Received */}
        <div className="max-w-[80%]">
          <div className="bg-[#1a1a1a] border border-[#222] p-3">
            <p className="text-[12px] text-white leading-relaxed">
              Asset is in position at Grid 44.92. Signal is weak but stable. Awaiting extraction authorization.
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1.5 px-1">
            <span className="text-[8px] text-[#00ff33] tracking-widest">ENCRYPTED</span>
            <span className="text-[8px] text-[#cc4444] tracking-widest">DELETED IN 2M</span>
            <span className="text-[8px] text-gray-600 tracking-widest">14:22:01</span>
          </div>
        </div>

        {/* Sent */}
        <div className="max-w-[80%] self-end">
          <div className="bg-[#00bb2a] p-3">
            <p className="text-[12px] text-white leading-relaxed text-right">
              Extraction confirmed for 0400. Maintain silence. Scramble all local nodes.
            </p>
          </div>
          <div className="flex items-center gap-2 justify-end mt-1.5 px-1">
            <span className="text-[8px] text-gray-600 tracking-widest">14:23:45</span>
            <span className="text-[8px] text-[#00ff33] tracking-widest">DELIVERED</span>
            <span className="text-[8px] text-[#cc4444] tracking-widest">DELETED IN 2M</span>
          </div>
        </div>

        {/* Session rekey */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-[#1e1e1e]"/>
          <span className="text-[8px] text-gray-600 tracking-[0.2em] shrink-0">--- SESSION_REKEYED_SUCCESS ---</span>
          <div className="flex-1 h-px bg-[#1e1e1e]"/>
        </div>

        {/* Received with location */}
        <div className="max-w-[85%]">
          <div className="bg-[#1a1a1a] border border-[#222] p-3">
            <p className="text-[12px] text-white leading-relaxed mb-2">
              Confirmed. Scrambling now. Watch for the flare at the extraction point.
            </p>
            <div className="flex items-center gap-2 bg-[#111] border border-[#333] p-2">
              <svg className="w-4 h-4 text-[#00ff33] shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              <div>
                <div className="text-[9px] text-gray-400 tracking-widest">SHARED LOCATION</div>
                <div className="text-[10px] text-[#00ff33] tracking-widest font-bold">MAP_QUAD_DELTA_9</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1.5 px-1">
            <span className="text-[8px] text-[#00ff33] tracking-widest">ENCRYPTED</span>
            <span className="text-[8px] text-[#cc4444] tracking-widest">DELETED IN 2M</span>
            <span className="text-[8px] text-gray-600 tracking-widest">14:25:12</span>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-[#1a1a1a] shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00ff33]"/>
          <span className="text-[8px] text-[#00ff33] tracking-widest">VPN_TUNNEL_ESTABLISHED</span>
        </div>
        <span className="text-[8px] text-gray-600 tracking-widest">AES-256_ACTIVE</span>
      </div>

      {/* Input */}
      <div className="flex items-center gap-0 bg-[#111] border-t border-[#1a1a1a] shrink-0 px-2 py-2">
        <button className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-300">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>
        </button>
        <input
          type="text"
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="TYPE_SECURE_MESSAGE..."
          className="flex-1 bg-transparent text-[11px] text-gray-300 placeholder:text-gray-700 tracking-wider focus:outline-none px-1"
        />
        <button className="p-2 text-gray-500 hover:text-gray-300">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93H2c0 4.97 3.53 9.11 8 9.87V20h4v-2.2c4.47-.76 8-4.9 8-9.8h-2c0 4.08-3.06 7.44-7 7.93V15.93z"/></svg>
        </button>
        <button className="bg-[#00bb2a] hover:bg-[#00cc2e] px-4 h-9 text-[11px] font-bold text-white tracking-widest transition-colors ml-1">
          SEND
        </button>
      </div>
    </div>
  );
}

/* ── Shared subcomponents ── */
function AvatarIcon({ name }: { name: string }) {
  if (name === 'DOCTOR') {
    return <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/></svg>;
  }
  if (name === 'BASE COMMAND') {
    return <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 24 24"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>;
  }
  return <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>;
}
function HamburgerIcon() {
  return (
    <button className="flex flex-col gap-1 p-1">
      <span className="w-5 h-0.5 bg-[#00ff33]"/>
      <span className="w-5 h-0.5 bg-[#00ff33]"/>
      <span className="w-5 h-0.5 bg-[#00ff33]"/>
    </button>
  );
}
function WaveIcon() {
  return (
    <svg className="w-5 h-5 text-[#00ff33]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"/>
    </svg>
  );
}
