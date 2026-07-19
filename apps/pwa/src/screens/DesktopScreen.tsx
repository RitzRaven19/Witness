import { useCallback, useEffect, useState } from 'react';
import { CaptureScreen } from './CaptureScreen';
import { TacticalMapScreen } from './TacticalMapScreen';
import { PurgeScreen } from './PurgeScreen';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { useLoraMesh } from '../hooks/useLoraMesh';
import { getAllEvidence } from '../store/evidenceStore';
import { processUploadQueue } from '../store/uploadQueue';
import { storageGet, storageSet } from '../utils/safeStorage';
import type { EvidenceRecord } from '../store/db';

/**
 * Desktop dashboard. Everything shown is real device state: the evidence
 * sidebar reads the actual vault, the centre pane is the live tactical map
 * (offline tiles, verified resources, QR import/share), and the header
 * reflects genuine link/queue/mesh values. The purge flow is the same one
 * the mobile app uses.
 */
export function DesktopScreen() {
  const [showCapture, setShowCapture] = useState(false);
  const [showPurge, setShowPurge] = useState(false);
  const [items, setItems] = useState<EvidenceRecord[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { online, queueCount } = useSyncStatus(refreshKey);
  const { status: mesh } = useLoraMesh();

  const refresh = useCallback(() => {
    getAllEvidence().then(setItems).catch(() => setItems([]));
    setRefreshKey((k) => k + 1);
  }, []);
  useEffect(refresh, [refresh]);

  const handleCaptureSaved = useCallback(() => {
    setShowCapture(false);
    processUploadQueue().catch(() => {});
    refresh();
  }, [refresh]);

  const statusStyle: Record<EvidenceRecord['status'], string> = {
    queued: 'text-[#b8860b]',
    uploading: 'text-[#2196f3]',
    uploaded: 'text-[#00ff33]',
    failed: 'text-[#cc4444]',
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0d0d0d] text-gray-300 font-sentry overflow-hidden">
      {/* ── TOP HEADER — real link/queue/mesh state ── */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-[#1e1e1e] bg-[#0a0a0a] shrink-0 z-30">
        <div className="flex items-center gap-4">
          <span className="text-[#00ff33] font-bold text-base tracking-[0.2em]">WITNESS_CONSOLE</span>
          <div className="flex items-center gap-2 text-[10px]">
            <span className={`px-2.5 py-1 border tracking-widest ${
              online ? 'text-[#00ff33] bg-[#0d1f14] border-[#00ff33]/25' : 'text-gray-500 bg-[#141414] border-[#2a2a2a]'
            }`}>
              {online ? 'LINK_UP' : 'OFFLINE'}
            </span>
            {queueCount > 0 && (
              <span className="text-[#b8860b] bg-[#141414] px-2.5 py-1 border border-[#b8860b]/40 tracking-widest">
                QUEUE {queueCount}
              </span>
            )}
            <span className={`px-2.5 py-1 border tracking-widest ${
              mesh.conn === 'connected'
                ? 'text-[#00ff33] bg-[#0d1f14] border-[#00ff33]/25'
                : 'text-gray-500 bg-[#141414] border-[#2a2a2a]'
            }`}>
              MESH {mesh.conn === 'connected' ? 'LINKED' : mesh.pending > 0 ? `${mesh.pending} QUEUED` : 'STANDBY'}
            </span>
          </div>
        </div>
        <span className="text-[9px] text-gray-600 tracking-widest">
          AES-256-GCM · ECDSA+ML-DSA · KEYS SEALED
        </span>
      </header>

      <main className="flex flex-1 overflow-hidden">
        {/* ── LEFT: real evidence vault ── */}
        <aside className="w-[300px] flex flex-col bg-[#0a0a0a] border-r border-[#1e1e1e] shrink-0 z-20">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h2 className="text-[#00ff33] font-bold tracking-[0.18em] text-[11px]">EVIDENCE_VAULT</h2>
            <span className="text-[9px] text-gray-600 tracking-widest">
              {items === null ? '…' : `${items.length} ITEM${items.length === 1 ? '' : 'S'}`}
            </span>
          </div>

          <div className="flex flex-col flex-1 overflow-y-auto">
            {items === null ? (
              <p className="text-gray-600 text-[10px] tracking-widest text-center py-8">READING…</p>
            ) : items.length === 0 ? (
              <p className="text-gray-600 text-[10px] tracking-widest text-center py-8 px-4 leading-relaxed">
                NO EVIDENCE YET.<br/>NEW CAPTURE opens the camera.
              </p>
            ) : (
              items.map((rec) => (
                <div key={rec.id} className="px-4 py-2.5 border-b border-[#141414]">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold tracking-widest text-white">
                      {rec.type.toUpperCase()} · {new Date(rec.capturedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={`text-[9px] font-bold tracking-widest ${statusStyle[rec.status]}`}>
                      {rec.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-[9px] text-gray-600 tracking-wider mt-0.5 truncate">
                    {rec.hash.slice(0, 20)}… · {rec.custodyLog.events.length} custody events
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-0 border-t border-[#1e1e1e] shrink-0">
            <button
              onClick={() => setShowCapture(true)}
              className="flex-1 bg-[#0d1f14] text-[#00ff33] border-r border-[#1e1e1e] py-3 text-[10px] font-bold tracking-widest hover:bg-[#112a1c] transition-colors"
            >
              NEW CAPTURE
            </button>
            <button
              onClick={() => setShowPurge(true)}
              className="flex-1 bg-[#1a0000] text-[#cc3333] py-3 text-[10px] font-bold tracking-widest hover:bg-[#220000] transition-colors"
            >
              PANIC PURGE
            </button>
          </div>
        </aside>

        {/* ── CENTRE: the real tactical map ── */}
        <section className="flex-1 relative overflow-hidden">
          <TacticalMapScreen embedded />
        </section>
      </main>

      {/* Capture modal */}
      {showCapture && (
        <div className="fixed inset-0 z-40 bg-black/90 flex items-center justify-center">
          <div className="w-[420px] h-[85vh] bg-[#0d0d0d] border border-[#1e1e1e] overflow-hidden relative">
            <button
              onClick={() => setShowCapture(false)}
              aria-label="Close capture"
              className="absolute top-2 right-2 z-50 text-gray-400 hover:text-white p-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
            <CaptureScreen onSaved={handleCaptureSaved} />
          </div>
        </div>
      )}

      {/* Purge — the real flow, same as mobile */}
      {showPurge && (
        <div className="fixed inset-0 z-40 bg-black/90 flex items-center justify-center">
          <div className="w-[420px] h-[85vh] bg-[#0d0d0d] border border-[#1e1e1e] overflow-hidden">
            <PurgeScreen
              pin={getOrCreatePinDesktop()}
              onClose={() => { setShowPurge(false); refresh(); }}
              onActivateDecoy={() => {
                storageSet('witness_decoy', '1');
                window.location.reload();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Same PIN source as the mobile app (App.tsx). */
function getOrCreatePinDesktop(): string {
  let pin = storageGet('witness_pin');
  if (!pin || pin.length !== 4) {
    pin = String(Math.floor(1000 + Math.random() * 9000));
    storageSet('witness_pin', pin);
  }
  return pin;
}
