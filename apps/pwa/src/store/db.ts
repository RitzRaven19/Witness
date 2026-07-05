import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CustodyLog } from '@witness/crypto-core';

export type EvidenceType = 'photo' | 'video' | 'audio';
export type EvidenceStatus = 'queued' | 'uploading' | 'uploaded' | 'failed';

export interface EvidenceRecord {
  id: string;            // UUID
  type: EvidenceType;
  hash: string;          // SHA-256 hex of plaintext
  ivHex: string;         // AES-GCM IV as hex
  /**
   * Per-evidence AES key, SEALED to the device vault public key (ECDH sealed
   * box, hex — Phase 2B, architecture §4.4). Recovery needs the vault private
   * key, which is passphrase-wrapped once the user sets one in Settings.
   */
  sealedKeyHex: string;
  /** Legacy raw AES key hex (pre-Phase-2B records); migrated and stripped on startup. */
  keyHex?: string;
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

/** Close the current connection and reset the cached reference. Call before deleting the DB. */
export function closeDb(): void {
  _db?.close();
  _db = null;
}
