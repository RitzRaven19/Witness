import { useCallback, useEffect, useState } from 'react';
import { loraStore, type LoraStatus, type TransportKind } from '../store/loraStore';

export interface LoraMeshControls {
  status: LoraStatus;
  serialAvailable: boolean;
  bleAvailable: boolean;
  connect: (kind: TransportKind) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Provision a shared 64-hex mesh key; throws on malformed input. */
  setMeshKey: (hex: string) => void;
  getMeshKeyHex: () => string;
  setIngestUrl: (url: string | null) => void;
  getIngestUrl: () => string | null;
}

/** React binding for the LoRa DTN mesh runtime (see store/loraStore.ts). */
export function useLoraMesh(): LoraMeshControls {
  const [status, setStatus] = useState<LoraStatus>(() => loraStore.getStatus());

  useEffect(() => loraStore.subscribe(setStatus), []);

  const connect = useCallback((kind: TransportKind) => loraStore.connect(kind), []);
  const disconnect = useCallback(() => loraStore.disconnect(), []);
  const setMeshKey = useCallback((hex: string) => loraStore.setMeshKey(hex), []);
  const getMeshKeyHex = useCallback(() => loraStore.getMeshKeyHex(), []);
  const setIngestUrl = useCallback((url: string | null) => loraStore.setIngestUrl(url), []);
  const getIngestUrl = useCallback(() => loraStore.getIngestUrl(), []);

  return {
    status,
    serialAvailable: typeof navigator !== 'undefined' && 'serial' in navigator,
    bleAvailable: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
    connect,
    disconnect,
    setMeshKey,
    getMeshKeyHex,
    setIngestUrl,
    getIngestUrl,
  };
}
