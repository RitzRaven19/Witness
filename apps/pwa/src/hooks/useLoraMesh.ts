import { useCallback, useEffect, useState } from 'react';
import { loraStore, type LoraStatus, type TransportKind } from '../store/loraStore';

export interface LoraMeshControls {
  status: LoraStatus;
  serialAvailable: boolean;
  bleAvailable: boolean;
  connect: (kind: TransportKind) => Promise<void>;
  disconnect: () => Promise<void>;
}

/** React binding for the LoRa DTN mesh runtime (see store/loraStore.ts). */
export function useLoraMesh(): LoraMeshControls {
  const [status, setStatus] = useState<LoraStatus>(() => loraStore.getStatus());

  useEffect(() => loraStore.subscribe(setStatus), []);

  const connect = useCallback((kind: TransportKind) => loraStore.connect(kind), []);
  const disconnect = useCallback(() => loraStore.disconnect(), []);

  return {
    status,
    serialAvailable: typeof navigator !== 'undefined' && 'serial' in navigator,
    bleAvailable: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
    connect,
    disconnect,
  };
}
