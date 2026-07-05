/**
 * Key wrapping for the Phase 2B key hierarchy (architecture.md §4.4).
 *
 *   Device Master Key (AES-256-GCM)
 *     ├─ wraps each per-evidence AES key   → wrapEvidenceKey / unwrapEvidenceKey
 *     └─ optionally wrapped itself under an
 *        Argon2id passphrase-derived key   → wrapMasterKey / unwrapMasterKey
 *
 * "Wrapping" is AES-GCM encryption of the raw key bytes; GCM's tag makes a
 * wrong passphrase or tampered blob fail loudly instead of yielding garbage.
 */

import { encrypt, decrypt, importKey } from './encrypt.js';
import { deriveKey, generateSalt } from './kdf.js';
import { bytesToHex, hexToBytes } from './hash.js';

export interface WrappedKey {
  /** AES-GCM ciphertext of the raw key bytes, hex. */
  wrappedHex: string;
  /** GCM IV, hex. */
  ivHex: string;
}

/** Wrap raw AES key bytes under the master key. */
export async function wrapEvidenceKey(
  masterKey: CryptoKey,
  rawEvidenceKey: ArrayBuffer,
): Promise<WrappedKey> {
  const { ciphertext, iv } = await encrypt(masterKey, rawEvidenceKey);
  return { wrappedHex: bytesToHex(new Uint8Array(ciphertext)), ivHex: bytesToHex(iv) };
}

/** Unwrap a per-evidence key back into a usable AES-GCM CryptoKey. */
export async function unwrapEvidenceKey(
  masterKey: CryptoKey,
  wrapped: WrappedKey,
): Promise<CryptoKey> {
  const raw = await decrypt(
    masterKey,
    hexToBytes(wrapped.wrappedHex).buffer as ArrayBuffer,
    hexToBytes(wrapped.ivHex),
  );
  return importKey(raw);
}

export interface PassphraseWrapped extends WrappedKey {
  /** Argon2id salt, hex. */
  saltHex: string;
}

/**
 * Wrap arbitrary secret bytes (a raw master key, a PKCS#8 private key, …)
 * under an Argon2id passphrase-derived key. Fresh random salt per wrap;
 * OWASP Argon2id parameters (kdf.ts).
 */
export async function wrapBytesWithPassphrase(
  passphrase: string,
  secret: ArrayBuffer,
): Promise<PassphraseWrapped> {
  const salt = generateSalt();
  const kek = await importKey((await deriveKey(passphrase, salt)).buffer as ArrayBuffer);
  const { ciphertext, iv } = await encrypt(kek, secret);
  return {
    wrappedHex: bytesToHex(new Uint8Array(ciphertext)),
    ivHex: bytesToHex(iv),
    saltHex: bytesToHex(salt),
  };
}

/**
 * Recover secret bytes from a passphrase wrap. Returns null on a wrong
 * passphrase or tampered blob (GCM authentication failure) — never throws
 * for bad credentials.
 */
export async function unwrapBytesWithPassphrase(
  passphrase: string,
  wrapped: PassphraseWrapped,
): Promise<ArrayBuffer | null> {
  try {
    const kek = await importKey(
      (await deriveKey(passphrase, hexToBytes(wrapped.saltHex))).buffer as ArrayBuffer,
    );
    return await decrypt(
      kek,
      hexToBytes(wrapped.wrappedHex).buffer as ArrayBuffer,
      hexToBytes(wrapped.ivHex),
    );
  } catch {
    return null;
  }
}

/** §4.4 convenience: wrap a raw AES master key under a passphrase. */
export async function wrapMasterKey(
  passphrase: string,
  rawMasterKey: ArrayBuffer,
): Promise<PassphraseWrapped> {
  return wrapBytesWithPassphrase(passphrase, rawMasterKey);
}

/** §4.4 convenience: recover the master key CryptoKey, or null on bad passphrase. */
export async function unwrapMasterKey(
  passphrase: string,
  wrapped: PassphraseWrapped,
): Promise<CryptoKey | null> {
  const raw = await unwrapBytesWithPassphrase(passphrase, wrapped);
  return raw ? importKey(raw) : null;
}
