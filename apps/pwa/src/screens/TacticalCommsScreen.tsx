import { useState, useEffect, useRef } from 'react';
import { TacticalHeader } from '../components/TacticalHeader';
import { QrScannerModal } from '../components/QrScannerModal';
import { QrShareModal } from '../components/QrShareModal';
import { useLoraMesh } from '../hooks/useLoraMesh';
import { loraStore, contactFingerprint, type InboxMessage } from '../store/loraStore';
import { getDeviceEcdhPublicRaw } from '../store/deviceKey';
import { bytesToHex } from '@witness/crypto-core';

/**
 * Mesh contact = a peer whose ECDH contact public key was exchanged in person
 * via QR (threat model P2P-S-1: out-of-band key exchange). The fingerprint is
 * the stable identity; the public key is what messages are sealed to.
 */
interface MeshPeer {
  /** Contact-key fingerprint (16 hex) — matches the `f` field inside messages. */
  id: string;
  name: string;
  /** Raw ECDH P-256 public key, hex (130 chars). */
  pubHex: string;
  pairedAt: number;
}

/** Contact QR payload. */
interface ContactCode {
  wtnc: 1;
  name?: string;
  pub: string;
}

export const PEERS_STORAGE = 'witness_mesh_peers';
const CALLSIGN_STORAGE = 'witness_callsign';
/** Keep sealed box within the 200-byte LoRa payload budget. */
const MAX_MSG_CHARS = 80;

function loadPeers(): MeshPeer[] {
  try {
    const raw = localStorage.getItem(PEERS_STORAGE);
    const parsed = raw ? JSON.parse(raw) : [];
    // Drop legacy Bluetooth-only entries that carry no contact key.
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p?.pubHex === 'string') : [];
  } catch {
    return [];
  }
}

export function TacticalCommsScreen() {
  const [selected, setSelected] = useState<MeshPeer | null>(null);
  const [search, setSearch] = useState('');
  const [peers, setPeers] = useState<MeshPeer[]>(loadPeers);
  const [showScanner, setShowScanner] = useState(false);
  const [myCode, setMyCode] = useState<string | null>(null);
  const [callsign, setCallsign] = useState(() => localStorage.getItem(CALLSIGN_STORAGE) ?? '');
  const [pairMsg, setPairMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { status: mesh } = useLoraMesh();

  useEffect(() => {
    try {
      localStorage.setItem(PEERS_STORAGE, JSON.stringify(peers));
    } catch { /* storage full — pairing survives only this session */ }
  }, [peers]);

  function flash(ok: boolean, text: string) {
    setPairMsg({ ok, text });
    setTimeout(() => setPairMsg(null), 4000);
  }

  async function showMyCode() {
    try {
      const pub = await getDeviceEcdhPublicRaw();
      const code: ContactCode = {
        wtnc: 1,
        name: callsign.trim() || undefined,
        pub: bytesToHex(pub),
      };
      setMyCode(JSON.stringify(code));
    } catch {
      flash(false, 'Could not load contact key');
    }
  }

  async function handleScanned(data: string) {
    setShowScanner(false);
    try {
      const parsed = JSON.parse(data) as ContactCode;
      if (parsed.wtnc !== 1 || typeof parsed.pub !== 'string' || !/^04[0-9a-f]{128}$/i.test(parsed.pub)) {
        flash(false, 'Not a Witness contact code');
        return;
      }
      const pubBytes = new Uint8Array(parsed.pub.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
      const fp = await contactFingerprint(pubBytes);
      const myFp = await contactFingerprint(await getDeviceEcdhPublicRaw());
      if (fp === myFp) {
        flash(false, 'That is this device’s own code');
        return;
      }
      const name = parsed.name?.trim() || `NODE-${fp.slice(0, 6).toUpperCase()}`;
      setPeers((prev) => {
        if (prev.some((p) => p.id === fp)) return prev;
        return [...prev, { id: fp, name, pubHex: parsed.pub.toLowerCase(), pairedAt: Date.now() }];
      });
      flash(true, `Paired with ${name}`);
    } catch {
      flash(false, 'Not a Witness contact code');
    }
  }

  function removePeer(id: string) {
    setPeers((prev) => prev.filter((p) => p.id !== id));
  }

  if (selected) {
    return <ChatScreen peer={selected} onBack={() => setSelected(null)} />;
  }

  const filtered = peers.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.id.includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      <TacticalHeader />

      {/* Title + mesh status */}
      <div className="mx-4 mt-4 mb-3 border-l-2 border-[#00ff33] pl-3">
        <h2 className="text-4xl font-bold text-white tracking-wide">CONTACTS</h2>
        <div className="flex items-center gap-1.5 mt-1">
          <div className={`w-2 h-2 rounded-full ${mesh.conn === 'connected' ? 'bg-[#00ff33]' : 'bg-gray-600'}`}/>
          <span className="text-[11px] font-bold tracking-widest text-gray-400">
            {peers.length} CONTACT{peers.length !== 1 ? 'S' : ''} ·{' '}
            {mesh.conn === 'connected' ? 'MESH CARRIER LINKED' : 'NO CARRIER — MESSAGES QUEUE'}
          </span>
        </div>
      </div>

      {/* Pairing feedback */}
      {pairMsg && (
        <div className={`mx-4 mb-2 px-3 py-2 border text-[10px] font-bold tracking-widest ${
          pairMsg.ok ? 'bg-[#0d1f10] border-[#00ff33]/60 text-[#00ff33]' : 'bg-[#1a0505] border-[#cc4444] text-[#cc6666]'
        }`}>
          {pairMsg.text}
        </div>
      )}

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
        {peers.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 py-12 text-center">
            <svg className="w-12 h-12 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"/>
            </svg>
            <div>
              <p className="text-gray-400 font-bold tracking-widest text-[12px] mb-1">NO CONTACTS</p>
              <p className="text-gray-600 text-[11px] tracking-wide max-w-[240px] leading-relaxed">
                Exchange contact codes in person: one device shows MY CODE, the other scans it with PAIR. Messages are end-to-end encrypted to that code.
              </p>
            </div>
          </div>
        ) : (
          filtered.map((peer) => (
            <button
              key={peer.id}
              onClick={() => setSelected(peer)}
              className="flex items-center gap-3 bg-[#111] border border-[#1e1e1e] p-3 hover:border-[#00ff33]/30 hover:bg-[#141414] transition-all text-left active:scale-[0.99]"
            >
              <div className="w-12 h-12 bg-[#222] flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white tracking-widest text-[13px]">{peer.name}</div>
                <div className="text-[10px] text-gray-500 tracking-wider mt-0.5 truncate font-sentry">
                  KEY {peer.id.toUpperCase()}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="bg-[#0d1f10] border border-[#00ff33]/40 px-2 py-0.5">
                  <span className="text-[#00ff33] text-[9px] font-bold tracking-widest">E2E KEY</span>
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
          onClick={() => setShowScanner(true)}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 border-r border-[#1a1a1a] bg-[#141414] hover:bg-[#1a1a1a] transition-colors"
        >
          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
          <span className="text-[11px] font-bold tracking-widest text-gray-400">PAIR</span>
        </button>
        <button
          onClick={showMyCode}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 border-r border-[#1a1a1a] bg-[#0d1f10] hover:bg-[#112a14] transition-colors"
        >
          <svg className="w-4 h-4 text-[#00ff33]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 11V3h8v8H3zm2-2h4V5H5v4zm8-4V3h8v8h-8V5zm2 2v4h4V7h-4zM3 21v-8h8v8H3zm2-2h4v-4H5v4zm13 2v-2h2v2h-2zm0-4v-2h2v2h-2zm-4 4v-2h2v2h-2zm0-4v-2h2v2h-2zm0-4v-2h4v2h-4z"/>
          </svg>
          <span className="text-[11px] font-bold tracking-widest text-[#00ff33]">MY CODE</span>
        </button>
        <button
          onClick={() => setPeers([])}
          disabled={peers.length === 0}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 transition-colors ${
            peers.length > 0 ? 'bg-[#cc0000] hover:bg-[#dd0000]' : 'bg-[#0d0d0d] cursor-not-allowed'
          }`}
        >
          <svg className={`w-4 h-4 ${peers.length > 0 ? 'text-white' : 'text-gray-700'}`} fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
          <span className={`text-[11px] font-bold tracking-widest ${peers.length > 0 ? 'text-white' : 'text-gray-700'}`}>REMOVE ALL</span>
        </button>
      </div>

      {/* Scan a peer's contact code */}
      {showScanner && (
        <QrScannerModal
          onClose={() => setShowScanner(false)}
          onResult={(data) => { void handleScanned(data); }}
        />
      )}

      {/* Display my contact code (with optional callsign) */}
      {myCode && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0d0d0d]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] shrink-0">
            <span className="text-[#00ff33] font-bold tracking-[0.15em] text-[13px]">MY CONTACT CODE</span>
            <button onClick={() => setMyCode(null)} aria-label="Close" className="text-gray-400 hover:text-white p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div className="px-4 pt-3">
            <div className="text-[8px] text-gray-600 tracking-widest mb-1">CALLSIGN SHOWN TO PEERS (OPTIONAL)</div>
            <input
              value={callsign}
              maxLength={24}
              onChange={(e) => {
                setCallsign(e.target.value);
                try { localStorage.setItem(CALLSIGN_STORAGE, e.target.value); } catch { /* ok */ }
              }}
              onBlur={() => void showMyCode()}
              placeholder="ANONYMOUS NODE"
              className="w-full bg-[#141414] border border-[#1e1e1e] px-3 py-2 text-[12px] text-gray-300 tracking-widest focus:border-[#00ff33]/50 outline-none"
            />
          </div>
          <div className="flex-1">
            <QrShareModalBody payload={myCode} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Inline QR body reusing the share modal in a pre-opened container. */
function QrShareModalBody({ payload }: { payload: string }) {
  return (
    <QrShareModal
      payload={payload}
      title=""
      onClose={() => {}}
      embedded
    />
  );
}

/* ── Chat Screen — real E2E messaging over the LoRa DTN mesh ──
 * Sent messages are sealed to the peer's contact key (only they can read
 * them) and queued into the DTN; they broadcast when a companion is linked.
 * Received messages are those this device decrypted from the mesh. Both are
 * memory-only and swept after TTL. */
const TTL_MS = 120_000;

interface ThreadMsg {
  id: string;
  text: string;
  sent: boolean;
  ts: string;
  expiresAt: number;
}

function ChatScreen({ peer, onBack }: { peer: MeshPeer; onBack: () => void }) {
  const [message, setMessage] = useState('');
  const [sentMsgs, setSentMsgs] = useState<ThreadMsg[]>([]);
  const [inbox, setInbox] = useState<InboxMessage[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const { status: mesh } = useLoraMesh();
  const seenRef = useRef(new Set<string>());

  useEffect(() => loraStore.subscribeInbox(setInbox), []);

  // Enforce the advertised TTL for real: sweep expired messages every second.
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setSentMsgs((prev) => (prev.some((m) => m.expiresAt <= now)
        ? prev.filter((m) => m.expiresAt > now)
        : prev));
      forceTick((n) => n + 1); // re-filter received msgs by age
    }, 1000);
    return () => clearInterval(t);
  }, []);

  async function sendMessage() {
    const body = message.trim();
    if (!body) return;
    setSendError(null);
    try {
      await loraStore.sendMeshMessage(peer.pubHex, body);
      const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setSentMsgs((prev) => [...prev, {
        id: String(Date.now()),
        text: body,
        sent: true,
        ts,
        expiresAt: Date.now() + TTL_MS,
      }]);
      setMessage('');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Send failed');
    }
  }

  // Merge sent + received-from-this-peer, chronological, TTL-filtered.
  const now = Date.now();
  const received: ThreadMsg[] = inbox
    .filter((m) => m.fromFp === peer.id && now - m.receivedAt < TTL_MS)
    .map((m) => {
      seenRef.current.add(m.id);
      return {
        id: m.id,
        text: m.text,
        sent: false,
        ts: new Date(m.receivedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        expiresAt: m.receivedAt + TTL_MS,
      };
    });
  const thread = [...sentMsgs, ...received].sort((a, b) => a.expiresAt - b.expiresAt);

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      <header className="flex items-center gap-3 px-3 py-3 bg-[#111] border-b border-[#1a1a1a] shrink-0">
        <button onClick={onBack} className="text-[#00ff33] p-1" aria-label="Back to contacts">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className="w-10 h-10 bg-[#222] flex items-center justify-center shrink-0">
          <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-bold tracking-widest text-[13px] truncate">{peer.name}</div>
          <div className="text-[#00ff33] text-[9px] tracking-widest">E2E ENCRYPTED • KEY {peer.id.slice(0, 8).toUpperCase()}</div>
        </div>
      </header>

      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a0a0a] border-b border-[#cc0000]/30 shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-[#cc4444]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
          </svg>
          <span className="text-[9px] text-[#cc4444] tracking-widest font-bold">AUTODELETE_PROTOCOL_ENGAGED</span>
        </div>
        <span className="text-[9px] text-[#cc4444] tracking-widest">TTL: {TTL_MS / 1000}S</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-4">
        {thread.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center py-8">
            <p className="text-gray-600 text-[11px] tracking-widest">NO MESSAGES</p>
            <p className="text-gray-700 text-[10px] max-w-[240px] leading-relaxed">
              Messages are sealed to this contact's key, hop the LoRa mesh, and auto-delete after {TTL_MS / 1000} seconds on both ends.
            </p>
          </div>
        ) : (
          thread.map((m) => (
            <div key={m.id} className={`max-w-[80%] ${m.sent ? 'self-end' : ''}`}>
              <div className={`p-3 ${m.sent ? 'bg-[#00bb2a]' : 'bg-[#1a1a1a] border border-[#222]'}`}>
                <p className={`text-[12px] text-white leading-relaxed ${m.sent ? 'text-right' : ''}`}>{m.text}</p>
              </div>
              <div className={`flex items-center gap-2 mt-1.5 px-1 ${m.sent ? 'justify-end' : ''}`}>
                <span className="text-[8px] text-[#00ff33] tracking-widest">
                  {m.sent ? (mesh.conn === 'connected' ? 'SEALED · TX' : 'SEALED · QUEUED') : 'SEALED · RX'}
                </span>
                <span className="text-[8px] text-gray-600 tracking-widest">{m.ts}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {sendError && (
        <div className="px-3 py-1.5 border-t border-[#cc0000]/30 bg-[#1a0505] shrink-0">
          <span className="text-[9px] text-[#cc6666] tracking-widest">{sendError}</span>
        </div>
      )}

      <div className="flex items-center justify-between px-3 py-1.5 border-t border-[#1a1a1a] shrink-0">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${mesh.conn === 'connected' ? 'bg-[#00ff33]' : 'bg-gray-600'}`}/>
          <span className={`text-[8px] tracking-widest ${mesh.conn === 'connected' ? 'text-[#00ff33]' : 'text-gray-500'}`}>
            {mesh.conn === 'connected' ? 'LORA_COMPANION_LINKED' : 'NO_CARRIER — QUEUING'}
          </span>
        </div>
        <span className="text-[8px] text-gray-600 tracking-widest">{message.length}/{MAX_MSG_CHARS}</span>
      </div>

      <div className="flex items-center gap-0 bg-[#111] border-t border-[#1a1a1a] shrink-0 px-2 py-2">
        <input
          type="text"
          value={message}
          maxLength={MAX_MSG_CHARS}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="TYPE_SEALED_MESSAGE..."
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
