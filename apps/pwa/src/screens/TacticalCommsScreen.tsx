import { useState, useEffect } from 'react';
import { TacticalHeader } from '../components/TacticalHeader';

interface MeshPeer {
  id: string;
  name: string;
  deviceId: string;
  pairedAt: number;
}

type BleAvailability = 'checking' | 'available' | 'unavailable';
type PeerScanState = 'idle' | 'scanning' | 'error';

export function TacticalCommsScreen() {
  const [selected, setSelected] = useState<MeshPeer | null>(null);
  const [search, setSearch] = useState('');
  const [peers, setPeers] = useState<MeshPeer[]>([]);
  const [bleAvail, setBleAvail] = useState<BleAvailability>('checking');
  const [scanState, setScanState] = useState<PeerScanState>('idle');
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    setBleAvail('bluetooth' in navigator ? 'available' : 'unavailable');
  }, []);

  if (selected) {
    return <ChatScreen peer={selected} onBack={() => setSelected(null)} />;
  }

  async function scanForPeer() {
    setScanState('scanning');
    setScanError(null);
    try {
      const device = await (navigator as Navigator & {
        bluetooth: { requestDevice(opts: object): Promise<{ id: string; name?: string }> }
      }).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access'],
      });
      const peer: MeshPeer = {
        id: device.id,
        name: device.name ?? 'Unknown Device',
        deviceId: device.id,
        pairedAt: Date.now(),
      };
      setPeers((prev) => {
        if (prev.some((p) => p.id === peer.id)) return prev;
        return [...prev, peer];
      });
      setScanState('idle');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'NotFoundError') {
        setScanState('idle');
      } else {
        setScanError(err instanceof Error ? err.message : 'Scan failed');
        setScanState('error');
      }
    }
  }

  function removePeer(id: string) {
    setPeers((prev) => prev.filter((p) => p.id !== id));
  }

  const filtered = peers.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      <TacticalHeader />

      {/* Title + BLE status */}
      <div className="mx-4 mt-4 mb-3 border-l-2 border-[#00ff33] pl-3">
        <h2 className="text-4xl font-bold text-white tracking-wide">CONTACTS</h2>
        <div className="flex items-center gap-1.5 mt-1">
          <div className={`w-2 h-2 rounded-full ${
            bleAvail === 'available' ? 'bg-[#00ff33]' :
            bleAvail === 'unavailable' ? 'bg-[#cc4444]' : 'bg-gray-600'
          }`}/>
          <span className={`text-[11px] font-bold tracking-widest ${
            bleAvail === 'available' ? 'text-[#00ff33]' :
            bleAvail === 'unavailable' ? 'text-[#cc4444]' : 'text-gray-500'
          }`}>
            {bleAvail === 'available'   ? `${peers.length} MESH PEER${peers.length !== 1 ? 'S' : ''} PAIRED` :
             bleAvail === 'unavailable' ? 'BLUETOOTH UNAVAILABLE' : 'CHECKING ADAPTER...'}
          </span>
        </div>
      </div>

      {/* Search — only shown when peers exist */}
      {peers.length > 0 && (
        <div className="mx-4 mb-4">
          <div className="flex items-center gap-2 bg-[#141414] border border-[#1e1e1e] px-3 py-2.5">
            <svg className="w-4 h-4 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="text"
              placeholder="FILTER BY ID OR NAME..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-[11px] text-gray-400 tracking-widest placeholder:text-gray-700 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto mx-4 flex flex-col gap-2">
        {bleAvail === 'unavailable' ? (
          /* BLE not available */
          <div className="flex flex-col items-center justify-center flex-1 gap-4 py-12 text-center">
            <svg className="w-12 h-12 text-[#cc4444]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88zM2 4.27L1 5.27 19.73 24 21 22.73 2 4.27z"/>
            </svg>
            <div>
              <p className="text-[#cc4444] font-bold tracking-widest text-[12px] mb-1">BLUETOOTH UNAVAILABLE</p>
              <p className="text-gray-500 text-[11px] tracking-wide max-w-[220px]">
                Mesh communication requires Bluetooth. Enable Bluetooth or use a compatible browser.
              </p>
            </div>
          </div>
        ) : peers.length === 0 ? (
          /* No peers yet */
          <div className="flex flex-col items-center justify-center flex-1 gap-4 py-12 text-center">
            <svg className="w-12 h-12 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"/>
            </svg>
            <div>
              <p className="text-gray-400 font-bold tracking-widest text-[12px] mb-1">NO MESH PEERS</p>
              <p className="text-gray-600 text-[11px] tracking-wide max-w-[220px]">
                No paired devices. Tap "PAIR PEER" to connect a LoRa companion or nearby device.
              </p>
            </div>
            {scanError && (
              <p className="text-[#cc4444] text-[10px] tracking-wide">{scanError}</p>
            )}
          </div>
        ) : (
          /* Peer list */
          filtered.map((peer) => (
            <button
              key={peer.id}
              onClick={() => setSelected(peer)}
              className="flex items-center gap-3 bg-[#111] border border-[#1e1e1e] p-3 hover:border-[#00ff33]/30 hover:bg-[#141414] transition-all text-left active:scale-[0.99]"
            >
              <div className="relative shrink-0">
                <div className="w-12 h-12 bg-[#222] flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                </div>
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#00ff33] border-2 border-[#111]"/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white tracking-widest text-[13px]">{peer.name}</div>
                <div className="text-[10px] text-gray-500 tracking-wider mt-0.5 truncate">
                  ID: {peer.deviceId.slice(0, 16)}…
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="flex items-center gap-1 bg-[#0d2010] border border-[#00ff33]/40 px-2 py-0.5">
                  <svg className="w-2.5 h-2.5 text-[#00ff33]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
                  </svg>
                  <span className="text-[#00ff33] text-[9px] font-bold tracking-widest">SECURE</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removePeer(peer.id); }}
                  className="text-[9px] text-gray-600 hover:text-[#cc4444] tracking-widest transition-colors"
                >
                  REMOVE
                </button>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-0 border-t border-[#1a1a1a] shrink-0">
        <button
          onClick={scanForPeer}
          disabled={bleAvail !== 'available' || scanState === 'scanning'}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 border-r border-[#1a1a1a] transition-colors ${
            bleAvail === 'available' && scanState !== 'scanning'
              ? 'bg-[#141414] hover:bg-[#1a1a1a]'
              : 'bg-[#0d0d0d] cursor-not-allowed'
          }`}
        >
          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
          <span className="text-[11px] font-bold tracking-widest text-gray-400">
            {scanState === 'scanning' ? 'SCANNING...' : 'PAIR PEER'}
          </span>
        </button>
        <button
          onClick={() => setPeers([])}
          className="flex-1 flex items-center justify-center gap-2 bg-[#cc0000] py-3.5 hover:bg-[#dd0000] transition-colors"
        >
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
          <span className="text-[11px] font-bold tracking-widest text-white">PURGE LOGS</span>
        </button>
      </div>
    </div>
  );
}

/* ── Chat Screen ── */
function ChatScreen({ peer, onBack }: { peer: MeshPeer; onBack: () => void }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<{ id: number; text: string; sent: boolean; ts: string }[]>([]);

  function sendMessage() {
    if (!message.trim()) return;
    const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setMessages((prev) => [...prev, { id: Date.now(), text: message.trim(), sent: true, ts }]);
    setMessage('');
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      <header className="flex items-center gap-3 px-3 py-3 bg-[#111] border-b border-[#1a1a1a] shrink-0">
        <button onClick={onBack} className="text-[#00ff33] p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className="w-10 h-10 bg-[#222] flex items-center justify-center shrink-0 relative">
          <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#00ff33] border-2 border-[#111]"/>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-bold tracking-widest text-[13px] truncate">{peer.name}</div>
          <div className="text-[#00ff33] text-[9px] tracking-widest">MESH CHANNEL • ENCRYPTED</div>
        </div>
      </header>

      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a0a0a] border-b border-[#cc0000]/30 shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-[#cc4444]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
          </svg>
          <span className="text-[9px] text-[#cc4444] tracking-widest font-bold">AUTODELETE_PROTOCOL_ENGAGED</span>
        </div>
        <span className="text-[9px] text-[#cc4444] tracking-widest">TTL: 120S</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center py-8">
            <p className="text-gray-600 text-[11px] tracking-widest">NO MESSAGES YET</p>
            <p className="text-gray-700 text-[10px]">Messages auto-delete after 120 seconds.</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`max-w-[80%] ${m.sent ? 'self-end' : ''}`}>
              <div className={`p-3 ${m.sent ? 'bg-[#00bb2a]' : 'bg-[#1a1a1a] border border-[#222]'}`}>
                <p className={`text-[12px] text-white leading-relaxed ${m.sent ? 'text-right' : ''}`}>{m.text}</p>
              </div>
              <div className={`flex items-center gap-2 mt-1.5 px-1 ${m.sent ? 'justify-end' : ''}`}>
                <span className="text-[8px] text-[#00ff33] tracking-widest">ENCRYPTED</span>
                <span className="text-[8px] text-gray-600 tracking-widest">{m.ts}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between px-3 py-1.5 border-t border-[#1a1a1a] shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00ff33]"/>
          <span className="text-[8px] text-[#00ff33] tracking-widest">MESH_LINK_ACTIVE</span>
        </div>
        <span className="text-[8px] text-gray-600 tracking-widest">AES-256_ACTIVE</span>
      </div>

      <div className="flex items-center gap-0 bg-[#111] border-t border-[#1a1a1a] shrink-0 px-2 py-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="TYPE_SECURE_MESSAGE..."
          className="flex-1 bg-transparent text-[11px] text-gray-300 placeholder:text-gray-700 tracking-wider focus:outline-none px-1"
        />
        <button
          onClick={sendMessage}
          disabled={!message.trim()}
          className={`px-4 h-9 text-[11px] font-bold text-white tracking-widest transition-colors ml-1 ${
            message.trim() ? 'bg-[#00bb2a] hover:bg-[#00cc2e]' : 'bg-[#1a1a1a] cursor-not-allowed'
          }`}
        >
          SEND
        </button>
      </div>
    </div>
  );
}

