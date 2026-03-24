import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CustodyLog } from '@witness/crypto-core';

export type EvidenceType = 'photo' | 'video' | 'audio';
export type EvidenceStatus = 'queued' | 'uploading' | 'uploaded' | 'failed';

export interface EvidenceRecord {
  id: string;            // UUID
  type: EvidenceType;
  hash: string;          // SHA-256 hex of plaintext
  ivHex: string;         // AES-GCM IV as hex
  keyHex: string;        // Raw AES key as hex — TODO: wrap under device master key in Phase 2B
  capturedAt: number;    // Unix ms
  sizeBytes: number;     // Plaintext size
  status: EvidenceStatus;
  custodyLog: CustodyLog;
}

interface WitnessDB extends DBSchema {
  evidence: {
    key: string;
    value: EvidenceRecord;
    indexes: { by_captured_at: number; by_status: EvidenceStatus };
  };
}

let _db: IDBPDatabase<WitnessDB> | null = null;

export async function getDb(): Promise<IDBPDatabase<WitnessDB>> {
  if (_db) return _db;
  _db = await openDB<WitnessDB>('witness', 1, {
    upgrade(db) {
      const store = db.createObjectStore('evidence', { keyPath: 'id' });
      store.createIndex('by_captured_at', 'capturedAt');
      store.createIndex('by_status', 'status');
    },
  });
  return _db;
}
