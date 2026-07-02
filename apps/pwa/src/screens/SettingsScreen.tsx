import { useEffect, useState } from 'react';
import { TacticalHeader } from '../components/TacticalHeader';
import { useLoraMesh } from '../hooks/useLoraMesh';
import { getAllEvidence } from '../store/evidenceStore';

interface Props {
  pin: string;
  onPurge: () => void;
}

/**
 * System configuration surface. Everything here reflects real device state:
 * the decoy-unlock PIN, storage durability, and mesh provisioning. The purge
 * action lives at the bottom, clearly separated and labelled as destructive.
 */
export function SettingsScreen({ pin, onPurge }: Props) {
  const {
    status, setMeshKey, getMeshKeyHex, setIngestUrl, getIngestUrl,
  } = useLoraMesh();

  const [showPin, setShowPin] = useState(false);
  const [evidenceCount, setEvidenceCount] = useState<number | null>(null);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [meshKeyInput, setMeshKeyInput] = useState('');
  const [ingestInput, setIngestInput] = useState('');
  const [configMsg, setConfigMsg] = useState<string | null>(null);

  useEffect(() => {
    getAllEvidence().then((all) => setEvidenceCount(all.length)).catch(() => {});
    navigator.storage?.estimate?.().then((est) => {
      setUsage({ used: est.usage ?? 0, quota: est.quota ?? 0 });
    }).catch(() => {});
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
  }, []);

  async function requestPersistence() {
    try {
      const granted = await navigator.storage.persist();
      setPersisted(granted);
    } catch {
      setPersisted(false);
    }
  }

  function applyMeshKey() {
    try {
      setMeshKey(meshKeyInput);
      setMeshKeyInput('');
      setConfigMsg('Mesh key updated');
    } catch (err) {
      setConfigMsg(err instanceof Error ? err.message : 'Invalid mesh key');
    }
  }

  function applyIngestUrl() {
    setIngestUrl(ingestInput || null);
    setConfigMsg(ingestInput ? 'Ingestion endpoint set' : 'Ingestion endpoint cleared');
  }

  const fmtBytes = (n: number) =>
    n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`;

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-y-auto">
      <TacticalHeader title="TACTICAL_NET_SECURE" />

      <div className="px-5 pt-6 pb-4">
        <h1 className="text-4xl font-bold text-white tracking-wider leading-none">SETTINGS</h1>
        <div className="w-12 h-0.5 bg-[#00ff33] mt-2 mb-3"/>
        <p className="text-[11px] text-gray-400 tracking-widest uppercase">SYSTEM CONFIG // SECURITY</p>
      </div>

      {/* ── Decoy PIN ── */}
      <section className="mx-4 mb-4 bg-[#111] border border-[#1e1e1e] p-4">
        <h3 className="text-[10px] text-[#00ff33] font-bold tracking-[0.2em] uppercase mb-2">Decoy Unlock PIN</h3>
        <p className="text-[10px] text-gray-500 tracking-wide leading-relaxed mb-3">
          After a purge the app disguises itself as a calculator. Typing this PIN in the calculator
          restores the interface. Memorise it — it is shown nowhere else.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-[#0d0d0d] border border-[#1e1e1e] px-3 py-2 text-center">
            <span className="text-[#00ff33] font-bold text-[20px] tracking-[0.5em] font-sentry">
              {showPin ? pin : '••••'}
            </span>
          </div>
          <button
            onClick={() => setShowPin((v) => !v)}
            className="text-[10px] tracking-widest border border-[#00ff33]/50 text-[#00ff33] px-3 py-2 hover:bg-[#00ff33]/10 transition-colors"
          >
            {showPin ? 'HIDE' : 'REVEAL'}
          </button>
        </div>
      </section>

      {/* ── Storage ── */}
      <section className="mx-4 mb-4 bg-[#111] border border-[#1e1e1e] p-4">
        <h3 className="text-[10px] text-[#00ff33] font-bold tracking-[0.2em] uppercase mb-3">Storage</h3>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-[#0d0d0d] border border-[#1e1e1e] p-2.5">
            <div className="text-[8px] text-gray-600 tracking-widest mb-1">EVIDENCE ITEMS</div>
            <div className="text-white text-[15px] font-bold tabular-nums">
              {evidenceCount ?? '—'}
            </div>
          </div>
          <div className="bg-[#0d0d0d] border border-[#1e1e1e] p-2.5">
            <div className="text-[8px] text-gray-600 tracking-widest mb-1">USED / AVAILABLE</div>
            <div className="text-white text-[15px] font-bold tabular-nums">
              {usage ? `${fmtBytes(usage.used)} / ${fmtBytes(usage.quota)}` : '—'}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold text-white tracking-widest text-[11px]">PERSISTENT STORAGE</div>
            <div className="text-[9px] text-gray-500 mt-0.5 leading-relaxed max-w-[210px]">
              Without this the browser may evict stored evidence under disk pressure.
            </div>
          </div>
          {persisted ? (
            <span className="text-[9px] text-[#00ff33] font-bold tracking-widest border border-[#00ff33]/40 px-2 py-1">GRANTED</span>
          ) : (
            <button
              onClick={requestPersistence}
              className="text-[9px] tracking-widest border border-[#b8860b] text-[#b8860b] px-2 py-1 hover:bg-[#b8860b]/10 transition-colors"
            >
              {persisted === null ? 'CHECK' : 'REQUEST'}
            </button>
          )}
        </div>
      </section>

      {/* ── Mesh provisioning ── */}
      <section className="mx-4 mb-4 bg-[#111] border border-[#1e1e1e] p-4">
        <h3 className="text-[10px] text-[#00ff33] font-bold tracking-[0.2em] uppercase mb-1">Mesh Provisioning</h3>
        <p className="text-[9px] text-gray-600 tracking-wide mb-3">
          ACTIVE KEY {status.meshKeyFp}… · {status.ingestConfigured ? 'INGEST CONFIGURED' : 'NO INGEST ENDPOINT'}
        </p>
        <div className="flex flex-col gap-2.5">
          <div>
            <div className="text-[8px] text-gray-600 tracking-widest mb-1">SHARED MESH KEY (64 HEX)</div>
            <div className="flex gap-1.5">
              <input
                value={meshKeyInput}
                onChange={(e) => setMeshKeyInput(e.target.value)}
                placeholder={getMeshKeyHex()}
                spellCheck={false}
                className="flex-1 min-w-0 bg-[#0d0d0d] border border-[#1e1e1e] px-2 py-1.5 text-[10px] text-gray-300 font-sentry tracking-tight focus:border-[#00ff33]/50 outline-none"
              />
              <button onClick={applyMeshKey} className="text-[9px] tracking-widest border border-[#00ff33]/50 text-[#00ff33] px-2.5 hover:bg-[#00ff33]/10">SET</button>
            </div>
          </div>
          <div>
            <div className="text-[8px] text-gray-600 tracking-widest mb-1">INGESTION ENDPOINT URL</div>
            <div className="flex gap-1.5">
              <input
                value={ingestInput}
                onChange={(e) => setIngestInput(e.target.value)}
                placeholder={getIngestUrl() ?? 'https://…/ingest'}
                spellCheck={false}
                className="flex-1 min-w-0 bg-[#0d0d0d] border border-[#1e1e1e] px-2 py-1.5 text-[10px] text-gray-300 font-sentry tracking-tight focus:border-[#00ff33]/50 outline-none"
              />
              <button onClick={applyIngestUrl} className="text-[9px] tracking-widest border border-[#00ff33]/50 text-[#00ff33] px-2.5 hover:bg-[#00ff33]/10">SET</button>
            </div>
          </div>
          {configMsg && <p className="text-[9px] text-[#00ff33]/70 tracking-wide">{configMsg}</p>}
        </div>
      </section>

      {/* ── Danger zone ── */}
      <section className="mx-4 mb-5 bg-[#1a0505] border border-[#cc0000]/40 p-4">
        <h3 className="text-[10px] text-[#cc4444] font-bold tracking-[0.2em] uppercase mb-2">Danger Zone</h3>
        <p className="text-[10px] text-gray-500 tracking-wide leading-relaxed mb-3">
          Irreversibly wipes all evidence, keys, map data and mesh queues, then disguises the app
          as a calculator.
        </p>
        <button
          onClick={onPurge}
          className="w-full py-3 bg-[#cc0000] hover:bg-[#e60000] text-white font-bold tracking-[0.25em] text-[12px] transition-colors"
        >
          PANIC PURGE
        </button>
      </section>
    </div>
  );
}
