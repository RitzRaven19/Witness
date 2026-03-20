import { ml_dsa65 } from '@noble/post-quantum/ml-dsa';
import { generateSigningKeyPair, sign, verify } from './signing.js';

export interface PQCKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface HybridKeyPair {
  classical: CryptoKeyPair;  // ECDSA P-256 (Web Crypto)
  pqc: PQCKeyPair;           // ML-DSA-65
}

export interface HybridSignature {
  classical: ArrayBuffer;    // ECDSA P-256 signature
  pqc: Uint8Array;           // ML-DSA-65 signature
}

/**
 * Generate an ML-DSA-65 key pair using a 32-byte random seed.
 */
export function generateMLDSAKeyPair(): PQCKeyPair {
  const seed = new Uint8Array(32);
  globalThis.crypto.getRandomValues(seed);
  return ml_dsa65.keygen(seed);
}

/**
 * Sign a message with an ML-DSA-65 secret key.
 */
export function mldsaSign(secretKey: Uint8Array, message: Uint8Array): Uint8Array {
  return ml_dsa65.sign(secretKey, message);
}

/**
 * Verify an ML-DSA-65 signature.
 */
export function mldsaVerify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): boolean {
  return ml_dsa65.verify(publicKey, message, signature);
}

/**
 * Generate a hybrid ECDSA P-256 + ML-DSA-65 key pair.
 */
export async function generateHybridKeyPair(): Promise<HybridKeyPair> {
  const [classical, pqc] = await Promise.all([
    generateSigningKeyPair(),
    Promise.resolve(generateMLDSAKeyPair()),
  ]);
  return { classical, pqc };
}

/**
 * Sign data with both ECDSA P-256 and ML-DSA-65 keys.
 */
export async function hybridSign(
  keyPair: HybridKeyPair,
  data: ArrayBuffer
): Promise<HybridSignature> {
  const [classical, pqc] = await Promise.all([
    sign(keyPair.classical.privateKey, data),
    Promise.resolve(mldsaSign(keyPair.pqc.secretKey, new Uint8Array(data))),
  ]);
  return { classical, pqc };
}

/**
 * Verify a hybrid signature. Returns true only if BOTH signatures are valid.
 */
export async function hybridVerify(
  classicalPublicKey: CryptoKey,
  pqcPublicKey: Uint8Array,
  data: ArrayBuffer,
  signature: HybridSignature
): Promise<boolean> {
  const [classicalValid, pqcValid] = await Promise.all([
    verify(classicalPublicKey, signature.classical, data),
    Promise.resolve(mldsaVerify(pqcPublicKey, new Uint8Array(data), signature.pqc)),
  ]);
  return classicalValid && pqcValid;
}

/**
 * Export the public keys from a hybrid key pair for storage or transmission.
 */
export async function exportHybridPublicKey(
  keyPair: HybridKeyPair
): Promise<{ classical: ArrayBuffer; pqc: Uint8Array }> {
  const classical = await globalThis.crypto.subtle.exportKey('spki', keyPair.classical.publicKey);
  return { classical, pqc: keyPair.pqc.publicKey };
}

/**
 * Benchmark ML-DSA-65 keygen, sign, and verify on a 1KB message.
 * Returns timing in milliseconds.
 */
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
