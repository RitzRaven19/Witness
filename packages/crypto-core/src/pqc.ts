import { ml_dsa65 } from '@noble/post-quantum/ml-dsa';
import { generateSigningKeyPair, importPublicKey, sign, verify } from './signing.js';
import { bytesToHex } from './hash.js';

export interface PQCKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface HybridKeyPair {
  classical: CryptoKeyPair;
  pqc: PQCKeyPair;
}

export interface HybridSignature {
  /** base64url ECDSA P-256 signature over the payload. */
  ecdsa_p256: string;
  /** base64url ML-DSA-65 signature over the payload. */
  ml_dsa_65: string;
  /** SHA-256 hex fingerprint of the ECDSA P-256 public key (64 hex chars). */
  key_id: string;
}

function b64urlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * SHA-256 fingerprint of an ECDSA P-256 public key in SPKI form.
 * Used as key_id in HybridSignature and as publisher_id in trust bundles.
 */
export async function keyFingerprint(publicKey: CryptoKey): Promise<string> {
  const spki = await globalThis.crypto.subtle.exportKey('spki', publicKey);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', spki);
  return bytesToHex(new Uint8Array(digest));
}

/** Generate an ML-DSA-65 key pair from a random 32-byte seed. */
export function generateMLDSAKeyPair(): PQCKeyPair {
  const seed = new Uint8Array(32);
  globalThis.crypto.getRandomValues(seed);
  return ml_dsa65.keygen(seed);
}

/** Sign a message with an ML-DSA-65 secret key. */
export function mldsaSign(secretKey: Uint8Array, message: Uint8Array): Uint8Array {
  return ml_dsa65.sign(secretKey, message);
}

/** Verify an ML-DSA-65 signature. */
export function mldsaVerify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  return ml_dsa65.verify(publicKey, message, signature);
}

/** Generate a hybrid ECDSA P-256 + ML-DSA-65 key pair. */
export async function generateHybridKeyPair(): Promise<HybridKeyPair> {
  const [classical, pqc] = await Promise.all([
    generateSigningKeyPair(),
    Promise.resolve(generateMLDSAKeyPair()),
  ]);
  return { classical, pqc };
}

/**
 * Sign data with both ECDSA P-256 and ML-DSA-65.
 * Returns a HybridSignature with base64url-encoded signatures and the key fingerprint.
 */
export async function hybridSign(
  keyPair: HybridKeyPair,
  data: ArrayBuffer,
): Promise<HybridSignature> {
  const message = new Uint8Array(data);
  const [ecdsaSig, mldsaSig, key_id] = await Promise.all([
    sign(keyPair.classical.privateKey, data),
    Promise.resolve(mldsaSign(keyPair.pqc.secretKey, message)),
    keyFingerprint(keyPair.classical.publicKey),
  ]);
  return {
    ecdsa_p256: b64urlEncode(ecdsaSig),
    ml_dsa_65: b64urlEncode(mldsaSig),
    key_id,
  };
}

/**
 * Verify a HybridSignature. Returns true only if BOTH signatures are valid.
 * Either signature failing causes the whole verification to fail.
 */
export async function hybridVerify(
  classicalPublicKey: CryptoKey,
  pqcPublicKey: Uint8Array,
  data: ArrayBuffer,
  signature: HybridSignature,
): Promise<boolean> {
  const ecdsaSigBuf = b64urlDecode(signature.ecdsa_p256).buffer as ArrayBuffer;
  const mldsaSigBytes = b64urlDecode(signature.ml_dsa_65);
  const message = new Uint8Array(data);
  const [classicalOk, pqcOk] = await Promise.all([
    verify(classicalPublicKey, ecdsaSigBuf, data),
    Promise.resolve(mldsaVerify(pqcPublicKey, message, mldsaSigBytes)),
  ]);
  return classicalOk && pqcOk;
}

/**
 * Export hybrid public keys as base64url strings for inclusion in trust bundles
 * and PublisherEntry records. The key_id is the SHA-256 fingerprint of the ECDSA key.
 */
export async function exportHybridPublicKey(keyPair: HybridKeyPair): Promise<{
  ecdsa_p256: string;
  ml_dsa_65: string;
  key_id: string;
}> {
  const [spki, key_id] = await Promise.all([
    globalThis.crypto.subtle.exportKey('spki', keyPair.classical.publicKey),
    keyFingerprint(keyPair.classical.publicKey),
  ]);
  return {
    ecdsa_p256: b64urlEncode(spki),
    ml_dsa_65: b64urlEncode(keyPair.pqc.publicKey),
    key_id,
  };
}

/**
 * Import hybrid public keys from base64url strings (e.g. from a trust bundle PublisherEntry).
 * The returned keys can be passed directly to hybridVerify.
 */
export async function importHybridPublicKey(
  ecdsaP256Base64url: string,
  mlDsa65Base64url: string,
): Promise<{ classical: CryptoKey; pqc: Uint8Array }> {
  const spki = b64urlDecode(ecdsaP256Base64url).buffer as ArrayBuffer;
  const classical = await importPublicKey(spki);
  return { classical, pqc: b64urlDecode(mlDsa65Base64url) };
}

/** Benchmark ML-DSA-65 keygen, sign, and verify on a 1 KB message. */
export async function benchmarkPQC(): Promise<{
  keygenMs: number;
  signMs: number;
  verifyMs: number;
  messageSizeBytes: number;
}> {
  const messageSizeBytes = 1024;
  const message = new Uint8Array(messageSizeBytes);
  globalThis.crypto.getRandomValues(message);

  const keygenStart = performance.now();
  const keyPair = generateMLDSAKeyPair();
  const keygenMs = performance.now() - keygenStart;

  const signStart = performance.now();
  const signature = mldsaSign(keyPair.secretKey, message);
  const signMs = performance.now() - signStart;

  const verifyStart = performance.now();
  mldsaVerify(keyPair.publicKey, message, signature);
  const verifyMs = performance.now() - verifyStart;

  return { keygenMs, signMs, verifyMs, messageSizeBytes };
}
