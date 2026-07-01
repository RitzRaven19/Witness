/**
 * Persistent device signing key — an ECDSA P-256 + ML-DSA-65 hybrid key pair
 * used to sign HashReceipts before they hop out over the LoRa DTN mesh.
 *
 * Generated once and stored in its own IndexedDB (`witness-keys`). Like the
 * per-evidence AES keys in db.ts, the private material is currently stored
 * unwrapped — wrapping under a device master key is Phase 2B. The store is
 * included in the panic purge routine.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  generateHybridKeyPair,
  exportPrivateKey,
  exportPublicKey,
  importPrivateKey,
  importPublicKey,
  keyFingerprint,
  type HybridKeyPair,
} from '@witness/crypto-core';

export const KEYS_DB_NAME = 'witness-keys';
const KEYS_STORE = 'keys';
const DEVICE_ID = 'device';

interface StoredDeviceKey {
  id: string;
  ecdsaPkcs8: ArrayBuffer; // ECDSA P-256 private key (PKCS#8)
  ecdsaSpki: ArrayBuffer; // ECDSA P-256 public key (SPKI)
  mldsaSecret: Uint8Array;
  mldsaPublic: Uint8Array;
}

interface KeysDB extends DBSchema {
  keys: { key: string; value: StoredDeviceKey };
}

let cached: HybridKeyPair | null = null;

async function getDb(): Promise<IDBPDatabase<KeysDB>> {
  return openDB<KeysDB>(KEYS_DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(KEYS_STORE, { keyPath: 'id' });
    },
  });
}

/**
 * Load the device hybrid key pair, generating and persisting it on first use.
 * The result is cached in memory for the session.
 */
export async function getDeviceKey(): Promise<HybridKeyPair> {
  if (cached) return cached;
  const db = await getDb();
  const rec = await db.get(KEYS_STORE, DEVICE_ID);

  if (rec) {
    const [privateKey, publicKey] = await Promise.all([
      importPrivateKey(rec.ecdsaPkcs8),
      importPublicKey(rec.ecdsaSpki),
    ]);
    cached = {
      classical: { privateKey, publicKey } as CryptoKeyPair,
      pqc: { secretKey: rec.mldsaSecret, publicKey: rec.mldsaPublic },
    };
    return cached;
  }

  const kp = await generateHybridKeyPair();
  const [ecdsaPkcs8, ecdsaSpki] = await Promise.all([
    exportPrivateKey(kp.classical.privateKey),
    exportPublicKey(kp.classical.publicKey),
  ]);
  await db.put(KEYS_STORE, {
    id: DEVICE_ID,
    ecdsaPkcs8,
    ecdsaSpki,
    mldsaSecret: kp.pqc.secretKey,
    mldsaPublic: kp.pqc.publicKey,
  });
  cached = kp;
  return kp;
}

/** SHA-256 fingerprint (hex) of the device's ECDSA public key. */
export async function getDeviceKeyId(): Promise<string> {
  return keyFingerprint((await getDeviceKey()).classical.publicKey);
}

/** Drop the in-memory cache (call after a panic purge deletes the DB). */
export function resetDeviceKeyCache(): void {
  cached = null;
}
