import { useEffect, useState } from 'react';
import { decrypt, hexToBytes, appendEvent } from '@witness/crypto-core';
import { TacticalHeader } from '../components/TacticalHeader';
import {
  getAllEvidence,
  readBlob,
  deleteEvidence,
  putEvidence,
} from '../store/evidenceStore';
import { getVaultStatus, unlockVault, unsealFromVault, type VaultStatus } from '../store/deviceKey';
import type { EvidenceRecord } from '../store/db';

const TYPE_META: Record<EvidenceRecord['type'], { mime: string; ext: string; label: string }> = {
  photo: { mime: 'image/jpeg', ext: 'jpg', label: 'PHOTO' },
  video: { mime: 'video/webm', ext: 'webm', label: 'VIDEO' },
  audio: { mime: 'audio/webm', ext: 'webm', label: 'AUDIO' },
};

const STATUS_STYLE: Record<EvidenceRecord['status'], string> = {
  queued: 'text-[#b8860b] border-[#b8860b]/50',
  uploading: 'text-[#2196f3] border-[#2196f3]/50',
  uploaded: 'text-[#00ff33] border-[#00ff33]/40',
  failed: 'text-[#cc4444] border-[#cc4444]/50',
};

function fmtBytes(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
}

/**
 * Local evidence vault: every captured item with its real status and custody
 * length. EXPORT decrypts on-device — the sealed per-evidence key is only
 * recoverable while the vault is unprotected or unlocked, so a passphrase
 * prompt appears when needed. Every export appends a custody event.
 */
export function EvidenceScreen() {
  const [items, setItems] = useState<EvidenceRecord[] | null>(null);
  const [vault, setVault] = useState<VaultStatus | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [askPass, setAskPass] = useState<EvidenceRecord | null>(null);
  const [pass, setPass] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function refresh() {
    getAllEvidence().then(setItems).catch(() => setItems([]));
    getVaultStatus().then(setVault).catch(() => {});
  }
  useEffect(refresh, []);

  function flash(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function doExport(rec: EvidenceRecord) {
    setBusyId(rec.id);
    try {
      if (!rec.sealedKeyHex) throw new Error('No sealed key on record');
      const key = await unsealFromVault(rec.sealedKeyHex);
      if (!key) {
        setAskPass(rec); // vault locked — collect passphrase
        return;
      }
      const ciphertext = await readBlob(rec.id);
      const plain = await decrypt(key, ciphertext, hexToBytes(rec.ivHex));

      const meta = TYPE_META[rec.type];
      const url = URL.createObjectURL(new Blob([plain], { type: meta.mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `witness-${rec.id.slice(0, 8)}.${meta.ext}`;
      a.click();
      URL.revokeObjectURL(url);

      rec.custodyLog = await appendEvent(rec.custodyLog, 'decrypted_local', {
        reason: 'user_export',
      });
      await putEvidence(rec);
      flash(true, 'Decrypted and exported — custody event recorded');
      refresh();
    } catch (err) {
      flash(false, err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusyId(null);
    }
  }

  async function unlockAndExport() {
    const rec = askPass;
    if (!rec) return;
    const ok = await unlockVault(pass);
    setPass('');
    if (!ok) {
      flash(false, 'Wrong passphrase');
      return;
    }
    setAskPass(null);
    refresh();
    await doExport(rec);
  }

  async function doDelete(id: string) {
    setConfirmDelete(null);
    await deleteEvidence(id).catch(() => {});
    flash(true, 'Evidence deleted from this device');
    refresh();
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-y-auto">
      <TacticalHeader title="TACTICAL_NET_SECURE" />

      <div className="px-4 pt-4 pb-3 border-b border-[#1a1a1a] shrink-0">
        <h2 className="text-3xl font-bold text-white tracking-widest">EVIDENCE<br/>VAULT</h2>
        <p className="text-[10px] text-gray-500 tracking-widest mt-1">
          {items === null ? 'READING…' : `${items.length} ITEM${items.length === 1 ? '' : 'S'} // AES-256-GCM // KEYS SEALED`}
        </p>
      </div>

      {msg && (
        <div className={`mx-4 mt-2 px-3 py-2 border text-[10px] font-bold tracking-widest ${
          msg.ok ? 'bg-[#0d1f10] border-[#00ff33]/60 text-[#00ff33]' : 'bg-[#1a0505] border-[#cc4444] text-[#cc6666]'
        }`}>
          {msg.text}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {items === null ? (
          <p className="text-gray-600 text-[11px] tracking-widest text-center py-8">READING VAULT…</p>
        ) : items.length === 0 ? (
          <p className="text-gray-600 text-[11px] tracking-widest text-center py-8 leading-relaxed">
            NO EVIDENCE CAPTURED YET.<br/>Use CAPTURE to secure your first item.
          </p>
        ) : (
          items.map((rec) => (
            <div key={rec.id} className="bg-[#111] border border-[#1e1e1e] p-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#1a1a1a] border border-[#222] flex items-center justify-center shrink-0">
                  <span className="text-[8px] font-bold tracking-widest text-gray-400">{TYPE_META[rec.type].label}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold tracking-widest text-[12px]">
                    {new Date(rec.capturedAt).toLocaleString('en-GB', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    }).toUpperCase()}
                  </div>
                  <div className="text-[9px] text-gray-500 tracking-wider mt-0.5 font-sentry truncate">
                    SHA-256 {rec.hash.slice(0, 16)}… · {fmtBytes(rec.sizeBytes)} · {rec.custodyLog.events.length} CUSTODY EVENTS
                  </div>
                </div>
                <span className={`text-[8px] font-bold tracking-widest px-1.5 py-0.5 border shrink-0 ${STATUS_STYLE[rec.status]}`}>
                  {rec.status.toUpperCase()}
                </span>
              </div>
              <div className="flex gap-2 mt-2.5">
                <button
                  onClick={() => void doExport(rec)}
                  disabled={busyId === rec.id}
                  className="text-[9px] font-bold tracking-widest px-2.5 py-1.5 border border-[#00ff33]/50 text-[#00ff33] hover:bg-[#00ff33]/10 disabled:opacity-40"
                >
                  {busyId === rec.id ? 'DECRYPTING…' : 'EXPORT'}
                </button>
                {confirmDelete === rec.id ? (
                  <>
                    <button
                      onClick={() => void doDelete(rec.id)}
                      className="text-[9px] font-bold tracking-widest px-2.5 py-1.5 bg-[#cc0000] text-white hover:bg-[#dd0000]"
                    >
                      CONFIRM DELETE
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="text-[9px] font-bold tracking-widest px-2.5 py-1.5 border border-[#333] text-gray-400"
                    >
                      KEEP
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(rec.id)}
                    className="text-[9px] font-bold tracking-widest px-2.5 py-1.5 border border-[#333] text-gray-500 hover:border-[#cc4444] hover:text-[#cc4444]"
                  >
                    DELETE
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {vault && items && items.length > 0 && (
        <div className="mx-4 mb-4 shrink-0 border-t border-[#1a1a1a] pt-3">
          <span className="text-[9px] text-gray-600 tracking-widest">
            VAULT: {vault === 'unprotected' ? 'DEVICE-BOUND (SET PASSPHRASE IN SETTINGS)' : vault.toUpperCase()}
          </span>
        </div>
      )}

      {/* Passphrase prompt for locked vault */}
      {askPass && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
          <div className="bg-[#111] border border-[#333] p-5 w-full max-w-xs">
            <div className="text-[#00ff33] font-bold tracking-widest text-[12px] mb-2">VAULT LOCKED</div>
            <p className="text-[10px] text-gray-500 tracking-wide mb-3">
              Enter the vault passphrase to decrypt this evidence.
            </p>
            <input
              type="password"
              value={pass}
              autoFocus
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void unlockAndExport()}
              placeholder="PASSPHRASE"
              className="w-full bg-[#0d0d0d] border border-[#1e1e1e] px-2 py-2 text-[12px] text-gray-300 tracking-widest focus:border-[#00ff33]/50 outline-none mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => void unlockAndExport()}
                disabled={!pass}
                className="flex-1 text-[10px] font-bold tracking-widest py-2 bg-[#00aa22] text-white hover:bg-[#00bb26] disabled:opacity-40"
              >
                UNLOCK & EXPORT
              </button>
              <button
                onClick={() => { setAskPass(null); setPass(''); }}
                className="text-[10px] font-bold tracking-widest px-3 py-2 border border-[#333] text-gray-400"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
