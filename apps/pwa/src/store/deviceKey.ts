/**
 * Persistent device key material, stored in the `witness-keys` IndexedDB and
 * wiped by panic purge. Three independent key pairs:
 *
 *  - Hybrid signing key (ECDSA P-256 + ML-DSA-65): signs HashReceipts.
 *  - Messaging ECDH key: the contact key mesh messages are sealed to.
 *  - VAULT ECDH key (Phase 2B, architecture §4.4 adapted): per-evidence AES
 *    keys are sealed to its PUBLIC key at capture, so capture never needs a
 *    secret and works while the vault is locked. The PRIVATE key — the only
 *    thing that can recover evidence keys — is wrapped under an Argon2id
 *    passphrase once the user sets one. Before that it is stored plain, and
 *    the Settings screen says so honestly.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  generateHybridKeyPair,
  exportPrivateKey,
  exportPublicKey,
  importPrivateKey,
  importPublicKey,
  keyFingerprint,
  generateEcdhKeyPair,
  exportEcdhPublicKey,
  exportEcdhPrivateKey,
  importEcdhPrivateKey,
  importEcdhPublicKey,
  sealToPublicKey,
  openSealed,
  importKey,
  wrapBytesWithPassphrase,
  unwrapBytesWithPassphrase,
  bytesToHex,
  hexToBytes,
  type HybridKeyPair,
  type PassphraseWrapped,
} from '@witness/crypto-core';

export const KEYS_DB_NAME = 'witness-keys';
const KEYS_STORE = 'keys';
const DEVICE_ID = 'device';
const ECDH_ID = 'device-ecdh';
const VAULT_PUB_ID = 'vault-pub';
const VAULT_PRIV_PLAIN_ID = 'vault-priv-plain';
const VAULT_PRIV_WRAPPED_ID = 'vault-priv-wrapped';

interface StoredDeviceKey {
  id: string;
  ecdsaPkcs8?: ArrayBuffer; // ECDSA P-256 private key (PKCS#8)
  ecdsaSpki?: ArrayBuffer; // ECDSA P-256 public key (SPKI)
  mldsaSecret?: Uint8Array;
  mldsaPublic?: Uint8Array;
  ecdhPkcs8?: ArrayBuffer; // ECDH P-256 private key (contact/messaging key)
  ecdhRaw?: Uint8Array; // ECDH P-256 public key (raw uncompressed point)
  // Passphrase wrap of the vault private key (PassphraseWrapped fields)
  wrappedHex?: string;
  ivHex?: string;
  saltHex?: string;
}

interface KeysDB extends DBSchema {
  keys: { key: string; value: StoredDeviceKey };
}

let cached: HybridKeyPair | null = null;
let cachedEcdh: CryptoKeyPair | null = null;
let cachedVaultPub: CryptoKey | null = null;
/** Unlocked vault private key — session memory only, never persisted unlocked once a passphrase is set. */
let sessionVaultPriv: CryptoKey | null = null;

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

  if (rec?.ecdsaPkcs8 && rec.ecdsaSpki && rec.mldsaSecret && rec.mldsaPublic) {
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

/**
 * Load the device ECDH contact/messaging key pair (Plane E mesh messages),
 * generating and persisting it on first use. Distinct from the signing key so
 * signing and key-agreement duties never share a key.
 */
export async function getDeviceEcdhKey(): Promise<CryptoKeyPair> {
  if (cachedEcdh) return cachedEcdh;
  const db = await getDb();
  const rec = await db.get(KEYS_STORE, ECDH_ID);

  if (rec?.ecdhPkcs8 && rec.ecdhRaw) {
    const [privateKey, publicKey] = await Promise.all([
      importEcdhPrivateKey(rec.ecdhPkcs8),
      importEcdhPublicKey(rec.ecdhRaw),
    ]);
    cachedEcdh = { privateKey, publicKey } as CryptoKeyPair;
    return cachedEcdh;
  }

  const kp = await generateEcdhKeyPair();
  const [ecdhPkcs8, ecdhRaw] = await Promise.all([
    exportEcdhPrivateKey(kp.privateKey),
    exportEcdhPublicKey(kp.publicKey),
  ]);
  await db.put(KEYS_STORE, { id: ECDH_ID, ecdhPkcs8, ecdhRaw });
  cachedEcdh = kp;
  return kp;
}

/** The device's ECDH public key as raw bytes (65B) — the "contact key" shared via QR. */
export async function getDeviceEcdhPublicRaw(): Promise<Uint8Array> {
  return exportEcdhPublicKey((await getDeviceEcdhKey()).publicKey);
}

// ── Vault key (Phase 2B): evidence keys sealed to this pair ────────────────

export type VaultStatus = 'unprotected' | 'locked' | 'unlocked';

/** Create the vault pair on first use: public raw + private pkcs8 (plain until a passphrase is set). */
async function ensureVaultKeys(db: IDBPDatabase<KeysDB>): Promise<void> {
  const pub = await db.get(KEYS_STORE, VAULT_PUB_ID);
  if (pub?.ecdhRaw) return;
  const kp = await generateEcdhKeyPair();
  const [raw, pkcs8] = await Promise.all([
    exportEcdhPublicKey(kp.publicKey),
    exportEcdhPrivateKey(kp.privateKey),
  ]);
  await db.put(KEYS_STORE, { id: VAULT_PUB_ID, ecdhRaw: raw });
  await db.put(KEYS_STORE, { id: VAULT_PRIV_PLAIN_ID, ecdhPkcs8: pkcs8 });
}

async function getVaultPublicKey(): Promise<CryptoKey> {
  if (cachedVaultPub) return cachedVaultPub;
  const db = await getDb();
  await ensureVaultKeys(db);
  const rec = await db.get(KEYS_STORE, VAULT_PUB_ID);
  if (!rec?.ecdhRaw) throw new Error('vault public key missing');
  cachedVaultPub = await importEcdhPublicKey(rec.ecdhRaw);
  return cachedVaultPub;
}

/**
 * Seal a raw AES key (evidence, a knowledge clip, anything device-local and
 * sensitive) to the vault public key. Needs no secret, so callers like
 * capture work even while the vault is locked. Returns hex of the sealed box
 * (ephemeral_pub ‖ iv ‖ ct+tag).
 */
export async function sealToVault(rawKey: ArrayBuffer): Promise<string> {
  const pub = await getVaultPublicKey();
  return bytesToHex(await sealToPublicKey(pub, new Uint8Array(rawKey)));
}

/** The vault private key if it is currently available, else null. */
async function getVaultPrivateKey(): Promise<CryptoKey | null> {
  if (sessionVaultPriv) return sessionVaultPriv;
  const db = await getDb();
  await ensureVaultKeys(db);
  const plain = await db.get(KEYS_STORE, VAULT_PRIV_PLAIN_ID);
  if (plain?.ecdhPkcs8) {
    sessionVaultPriv = await importEcdhPrivateKey(plain.ecdhPkcs8);
    return sessionVaultPriv;
  }
  return null; // passphrase-wrapped and not unlocked this session
}

export async function getVaultStatus(): Promise<VaultStatus> {
  const db = await getDb();
  await ensureVaultKeys(db);
  const wrapped = await db.get(KEYS_STORE, VAULT_PRIV_WRAPPED_ID);
  if (!wrapped) return 'unprotected';
  return sessionVaultPriv ? 'unlocked' : 'locked';
}

/**
 * Protect the vault private key under an Argon2id passphrase: the plain copy
 * is replaced by the wrap, so recovering evidence keys from a seized device
 * requires the passphrase. Existing sealed evidence keys are unaffected
 * (they are sealed to the public key, which does not change).
 */
export async function setVaultPassphrase(passphrase: string): Promise<void> {
  if (passphrase.length < 8) throw new Error('Passphrase must be at least 8 characters');
  const db = await getDb();
  await ensureVaultKeys(db);
  if (await db.get(KEYS_STORE, VAULT_PRIV_WRAPPED_ID)) {
    throw new Error('Passphrase already set — use change instead');
  }
  const plain = await db.get(KEYS_STORE, VAULT_PRIV_PLAIN_ID);
  if (!plain?.ecdhPkcs8) throw new Error('vault private key missing');

  const wrapped = await wrapBytesWithPassphrase(passphrase, plain.ecdhPkcs8);
  await db.put(KEYS_STORE, { id: VAULT_PRIV_WRAPPED_ID, ...wrapped });
  await db.delete(KEYS_STORE, VAULT_PRIV_PLAIN_ID);
  sessionVaultPriv = await importEcdhPrivateKey(plain.ecdhPkcs8);
}

/** Unlock the vault for this session. Returns false on a wrong passphrase. */
export async function unlockVault(passphrase: string): Promise<boolean> {
  const db = await getDb();
  const rec = await db.get(KEYS_STORE, VAULT_PRIV_WRAPPED_ID);
  if (!rec?.wrappedHex || !rec.ivHex || !rec.saltHex) return false;
  const wrapped: PassphraseWrapped = {
    wrappedHex: rec.wrappedHex,
    ivHex: rec.ivHex,
    saltHex: rec.saltHex,
  };
  const pkcs8 = await unwrapBytesWithPassphrase(passphrase, wrapped);
  if (!pkcs8) return false;
  sessionVaultPriv = await importEcdhPrivateKey(pkcs8);
  return true;
}

export function lockVault(): void {
  sessionVaultPriv = null;
}

/** Re-wrap the vault private key under a new passphrase. */
export async function changeVaultPassphrase(
  oldPassphrase: string,
  newPassphrase: string,
): Promise<boolean> {
  if (newPassphrase.length < 8) throw new Error('Passphrase must be at least 8 characters');
  if (!(await unlockVault(oldPassphrase))) return false;
  const db = await getDb();
  const pkcs8 = await exportEcdhPrivateKey(sessionVaultPriv!);
  const wrapped = await wrapBytesWithPassphrase(newPassphrase, pkcs8);
  await db.put(KEYS_STORE, { id: VAULT_PRIV_WRAPPED_ID, ...wrapped });
  return true;
}

/**
 * Recover an AES key from its vault sealed box. Requires the vault to be
 * unprotected or unlocked; returns null otherwise (or if the box is not
 * addressed to this vault). Used by evidence export and knowledge clip reads.
 */
export async function unsealFromVault(sealedHex: string): Promise<CryptoKey | null> {
  const priv = await getVaultPrivateKey();
  if (!priv) return null;
  const raw = await openSealed(priv, hexToBytes(sealedHex));
  return raw ? importKey(raw.slice().buffer as ArrayBuffer) : null;
}

/** Drop the in-memory cache (call after a panic purge deletes the DB). */
export function resetDeviceKeyCache(): void {
  cached = null;
  cachedEcdh = null;
  cachedVaultPub = null;
  sessionVaultPriv = null;
}
