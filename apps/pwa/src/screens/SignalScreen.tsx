import { useState, useEffect } from 'react';
import { TacticalHeader } from '../components/TacticalHeader';
import { useLoraMesh } from '../hooks/useLoraMesh';

export function SignalScreen() {
  const [sendLocation, setSendLocation] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: string; lng: string } | null>(null);

  const {
    status, serialAvailable, bleAvailable, connect, disconnect,
    setMeshKey, getMeshKeyHex, setIngestUrl, getIngestUrl, setIngestToken, getIngestToken,
  } = useLoraMesh();
  const anyTransport = serialAvailable || bleAvailable;

  const [showConfig, setShowConfig] = useState(false);
  const [meshKeyInput, setMeshKeyInput] = useState('');
  const [ingestInput, setIngestInput] = useState('');
  const [ingestTokenInput, setIngestTokenInput] = useState('');
  const [configMsg, setConfigMsg] = useState<string | null>(null);

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

  function applyIngestToken() {
    setIngestToken(ingestTokenInput || null);
    setIngestTokenInput('');
    setConfigMsg(ingestTokenInput ? 'Ingestion token set' : 'Ingestion token cleared');
  }

  useEffect(() => {
    if (!sendLocation) { setCoords(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({
        lat: `${Math.abs(pos.coords.latitude).toFixed(4)}° ${pos.coords.latitude >= 0 ? 'N' : 'S'}`,
        lng: `${Math.abs(pos.coords.longitude).toFixed(4)}° ${pos.coords.longitude >= 0 ? 'E' : 'W'}`,
      }),
      () => setCoords(null),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 60_000 },
    );
  }, [sendLocation]);

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-y-auto">
      <TacticalHeader title="TACTICAL_NET_SECURE" />

      {/* Protocol header */}
      <div className="mx-4 mt-4 mb-5 border-l-2 border-[#00ff33] pl-3">
        <div className="text-[9px] text-gray-500 tracking-widest uppercase mb-1">Current Protocol</div>
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-bold italic text-white tracking-widest">SIGNAL_DELTA</h2>
          <div className="flex flex-col items-end">
            <div className="text-[8px] text-gray-500 tracking-widest">STATUS</div>
            <div className="text-[11px] text-[#00ff33] font-bold tracking-widest">ENCRYPTED_LINK</div>
          </div>
        </div>
      </div>

      {/* LoRa DTN mesh companion */}
      <div className="mx-4 mb-4 bg-[#111] border border-[#1e1e1e] p-4">
        <h3 className="text-[10px] text-[#00ff33] font-bold tracking-[0.2em] uppercase mb-3">LoRa Companion</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              status.conn === 'connected'  ? 'bg-[#00ff33] animate-pulse' :
              status.conn === 'connecting' ? 'bg-[#b8860b] animate-pulse' :
              status.conn === 'error'      ? 'bg-[#cc4444]' :
              anyTransport                 ? 'bg-gray-600' : 'bg-[#333]'
            }`}/>
            <span className="text-[11px] text-gray-300 tracking-widest">
              {status.conn === 'connected'  ? status.deviceLabel ?? 'DEVICE CONNECTED' :
               status.conn === 'connecting' ? 'CONNECTING...' :
               status.conn === 'error'      ? 'CONNECTION FAILED' :
               anyTransport                 ? 'READY TO PAIR' : 'NO TRANSPORT'}
            </span>
          </div>
          {status.conn === 'connected' ? (
            <button
              onClick={() => disconnect()}
              className="text-[10px] text-gray-500 tracking-widest border border-[#333] px-2 py-1 hover:border-[#cc4444] hover:text-[#cc4444] transition-colors"
            >
              DISCONNECT
            </button>
          ) : (
            <div className="flex gap-2">
              {bleAvailable && (
                <button
                  onClick={() => connect('ble')}
                  disabled={status.conn === 'connecting'}
                  className="text-[10px] tracking-widest border px-2 py-1 transition-colors border-[#00ff33]/50 text-[#00ff33] hover:bg-[#00ff33]/10 disabled:border-[#333] disabled:text-gray-600 disabled:cursor-not-allowed"
                >
                  BLE
                </button>
              )}
              {serialAvailable && (
                <button
                  onClick={() => connect('serial')}
                  disabled={status.conn === 'connecting'}
                  className="text-[10px] tracking-widest border px-2 py-1 transition-colors border-[#00ff33]/50 text-[#00ff33] hover:bg-[#00ff33]/10 disabled:border-[#333] disabled:text-gray-600 disabled:cursor-not-allowed"
                >
                  USB-C
                </button>
              )}
            </div>
          )}
        </div>

        {/* Mesh queue telemetry */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="bg-[#0d0d0d] border border-[#1e1e1e] p-2 text-center">
            <div className="text-[8px] text-gray-600 tracking-widest mb-0.5">QUEUED</div>
            <div className="text-[#00ff33] text-[15px] font-bold tabular-nums">{status.pending}</div>
          </div>
          <div className="bg-[#0d0d0d] border border-[#1e1e1e] p-2 text-center">
            <div className="text-[8px] text-gray-600 tracking-widest mb-0.5">RELAYED</div>
            <div className="text-gray-300 text-[15px] font-bold tabular-nums">{status.relayed}</div>
          </div>
          <div className="bg-[#0d0d0d] border border-[#1e1e1e] p-2 text-center">
            <div className="text-[8px] text-gray-600 tracking-widest mb-0.5">DELIVERED</div>
            <div className="text-gray-300 text-[15px] font-bold tabular-nums">{status.delivered}</div>
          </div>
        </div>

        {status.lastError && (
          <p className="mt-2 text-[10px] text-[#cc4444] tracking-wide">{status.lastError}</p>
        )}
        {!anyTransport && (
          <p className="mt-2 text-[10px] text-gray-600 tracking-wide">
            Web Serial / Bluetooth not supported in this browser. LoRa mesh needs a companion board.
          </p>
        )}
        <p className="mt-2 text-[9px] text-gray-600 tracking-wide leading-relaxed">
          Evidence receipts hop device-to-device over LoRa until a connected node forwards them. Only the signed hash travels — never the media. Works with stock Meshtastic boards (Heltec, T-Beam, RAK) over BLE or USB-C.
        </p>

        {/* Mesh provisioning */}
        <button
          onClick={() => setShowConfig((v) => !v)}
          className="mt-3 w-full flex items-center justify-between text-[9px] text-gray-500 tracking-widest border-t border-[#1e1e1e] pt-2"
        >
          <span>MESH CONFIG · KEY {status.meshKeyFp}… · {status.ingestConfigured ? 'INGEST SET' : 'NO INGEST'}</span>
          <span>{showConfig ? '▲' : '▼'}</span>
        </button>
        {showConfig && (
          <div className="mt-2 flex flex-col gap-2">
            <div>
              <div className="text-[8px] text-gray-600 tracking-widest mb-1">SHARED MESH KEY (64 HEX)</div>
              <div className="flex gap-1.5">
                <input
                  value={meshKeyInput}
                  onChange={(e) => setMeshKeyInput(e.target.value)}
                  placeholder={getMeshKeyHex()}
                  spellCheck={false}
                  className="flex-1 min-w-0 bg-[#0d0d0d] border border-[#1e1e1e] px-2 py-1.5 text-[10px] text-gray-300 font-mono tracking-tight focus:border-[#00ff33]/50 outline-none"
                />
                <button onClick={applyMeshKey} className="text-[9px] tracking-widest border border-[#00ff33]/50 text-[#00ff33] px-2 hover:bg-[#00ff33]/10">SET</button>
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
                  className="flex-1 min-w-0 bg-[#0d0d0d] border border-[#1e1e1e] px-2 py-1.5 text-[10px] text-gray-300 font-mono tracking-tight focus:border-[#00ff33]/50 outline-none"
                />
                <button onClick={applyIngestUrl} className="text-[9px] tracking-widest border border-[#00ff33]/50 text-[#00ff33] px-2 hover:bg-[#00ff33]/10">SET</button>
              </div>
            </div>
            <div>
              <div className="text-[8px] text-gray-600 tracking-widest mb-1">
                INGESTION TOKEN {getIngestToken() ? '(SET)' : '(NONE — ONLY IF YOUR SERVER REQUIRES ONE)'}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="password"
                  value={ingestTokenInput}
                  onChange={(e) => setIngestTokenInput(e.target.value)}
                  placeholder="BEARER TOKEN"
                  spellCheck={false}
                  className="flex-1 min-w-0 bg-[#0d0d0d] border border-[#1e1e1e] px-2 py-1.5 text-[10px] text-gray-300 font-mono tracking-tight focus:border-[#00ff33]/50 outline-none"
                />
                <button onClick={applyIngestToken} className="text-[9px] tracking-widest border border-[#00ff33]/50 text-[#00ff33] px-2 hover:bg-[#00ff33]/10">SET</button>
              </div>
            </div>
            {configMsg && <p className="text-[9px] text-[#00ff33]/70 tracking-wide">{configMsg}</p>}
          </div>
        )}
      </div>

      {/* Signal cards */}
      <div className="px-4 flex flex-col gap-3 mb-5">
        {/* Silent Alert */}
        <button
          onClick={() => setActive(active === 'silent' ? null : 'silent')}
          className={`flex items-start gap-3 p-4 border text-left transition-all ${
            active === 'silent'
              ? 'bg-[#0d1f10] border-[#00ff33]/60'
              : 'bg-[#111] border-[#1e1e1e] hover:border-[#00ff33]/30'
          }`}
        >
          <div className={`w-12 h-12 flex items-center justify-center shrink-0 ${active === 'silent' ? 'bg-[#00ff33]/20' : 'bg-[#1a1a1a]'}`}>
            <svg className="w-6 h-6 text-[#00ff33]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6zM2.54 2.54L1.13 3.95C3.1 5.92 4.29 8.59 4.29 11.5c0 2.91-1.19 5.58-3.16 7.55l1.41 1.41C4.73 18.27 6.29 15.06 6.29 11.5c0-3.56-1.56-6.77-4.03-9.03L2.54 2.54z"/>
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-white tracking-widest text-[13px]">SILENT ALERT</span>
              <span className="text-[8px] bg-[#0d1f10] text-[#00ff33] border border-[#00ff33]/40 px-2 py-0.5 tracking-widest font-bold">LOW_VIS</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Zero-audio transmission. Broadcasts distress metadata to designated extraction squad only.
            </p>
          </div>
        </button>

        {/* Audio Beacon */}
        <button
          onClick={() => setActive(active === 'audio' ? null : 'audio')}
          className={`flex items-start gap-3 p-4 border text-left transition-all ${
            active === 'audio'
              ? 'bg-[#0d1f10] border-[#00ff33]/60'
              : 'bg-[#111] border-[#1e1e1e] hover:border-[#00ff33]/30'
          }`}
        >
          <div className={`w-12 h-12 flex items-center justify-center shrink-0 ${active === 'audio' ? 'bg-[#00ff33]/20' : 'bg-[#1a1a1a]'}`}>
            <svg className="w-6 h-6 text-[#00ff33]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-white tracking-widest text-[13px]">AUDIO BEACON</span>
              <span className="text-[8px] bg-[#0d1f10] text-[#00ff33] border border-[#00ff33]/40 px-2 py-0.5 tracking-widest font-bold">HIGH_VIS</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              High-frequency acoustic pulsing paired with mesh-network broadcast for local recovery.
            </p>
          </div>
        </button>

        {/* Medical Emergency */}
        <button
          onClick={() => setActive(active === 'medical' ? null : 'medical')}
          className={`flex items-start gap-3 p-4 border text-left transition-all ${
            active === 'medical'
              ? 'bg-[#1a0505] border-[#cc0000]'
              : 'bg-[#111] border-[#cc0000]/40 hover:border-[#cc0000]/80'
          }`}
        >
          <div className="w-12 h-12 bg-[#cc0000] flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-[#cc4444] tracking-widest text-[13px]">MEDICAL<br/>EMERGENCY</span>
              <span className="text-[8px] bg-[#cc0000] text-white px-2 py-0.5 tracking-widest font-bold">CRITICAL</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Instant biometric data uplink. Triggers MedEvac protocol 09 on nearest available node.
            </p>
          </div>
        </button>
      </div>

      {/* Protocol Configuration */}
      <div className="mx-4 mb-4 bg-[#111] border border-[#1e1e1e] p-4">
        <h3 className="text-[10px] text-[#00ff33] font-bold tracking-[0.2em] uppercase mb-4">Protocol Configuration</h3>

        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="font-bold text-white tracking-widest text-[12px]">SEND LOCATION</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Attaches GPS_COORD to outgoing burst.</div>
          </div>
          <button
            onClick={() => setSendLocation(!sendLocation)}
            className={`w-12 h-6 rounded-sm border flex items-center px-0.5 transition-all ${
              sendLocation
                ? 'bg-[#00ff33]/20 border-[#00ff33]/60 justify-end'
                : 'bg-[#1a1a1a] border-[#333] justify-start'
            }`}
          >
            <div className={`w-5 h-5 ${sendLocation ? 'bg-[#00ff33]' : 'bg-gray-600'}`}/>
          </button>
        </div>

        {sendLocation && (
          <div className="flex gap-2 mb-4">
            <div className="flex-1 bg-[#0d0d0d] border border-[#1e1e1e] p-2.5">
              <div className="text-[9px] text-gray-600 tracking-widest mb-1">LAT:</div>
              <div className="text-[#00ff33] text-[13px] font-bold tracking-widest">
                {coords?.lat ?? '—'}
              </div>
            </div>
            <div className="flex-1 bg-[#0d0d0d] border border-[#1e1e1e] p-2.5">
              <div className="text-[9px] text-gray-600 tracking-widest mb-1">LONG:</div>
              <div className="text-[#00ff33] text-[13px] font-bold tracking-widest">
                {coords?.lng ?? '—'}
              </div>
            </div>
          </div>
        )}

        <button
          disabled={!active}
          className={`w-full py-4 font-bold tracking-[0.25em] text-[12px] transition-colors ${
            active
              ? 'bg-[#00aa22] hover:bg-[#00cc28] text-white shadow-[0_0_12px_rgba(0,255,51,0.2)]'
              : 'bg-[#1a1a1a] text-gray-600 cursor-not-allowed'
          }`}
        >
          {active ? `INITIATE ${active.toUpperCase()} BURST` : 'SELECT SIGNAL TYPE'}
        </button>
      </div>

      {/* Warning */}
      <div className="mx-4 mb-4 flex items-start gap-2 bg-[#0d0d0d] border border-[#1e1e1e] p-3">
        <svg className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <p className="text-[10px] text-gray-500 leading-relaxed">
          WARNING: Manual signal deployment may compromise stealth status. Use only in situations where extraction priority exceeds concealment protocols.
        </p>
      </div>
    </div>
  );
}

