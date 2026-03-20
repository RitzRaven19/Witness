import { describe, it, expect } from 'vitest';
import {
  generateMLDSAKeyPair,
  mldsaSign,
  mldsaVerify,
  generateHybridKeyPair,
  hybridSign,
  hybridVerify,
  benchmarkPQC,
} from '../src/pqc.js';

// ML-DSA-65 key sizes (per NIST spec)
const MLDSA65_SECRET_KEY_BYTES = 4032;
const MLDSA65_PUBLIC_KEY_BYTES = 1952;

describe('generateMLDSAKeyPair', () => {
  it('returns keys of correct lengths', () => {
    const keyPair = generateMLDSAKeyPair();
    expect(keyPair.secretKey).toBeInstanceOf(Uint8Array);
    expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
    expect(keyPair.secretKey.byteLength).toBe(MLDSA65_SECRET_KEY_BYTES);
    expect(keyPair.publicKey.byteLength).toBe(MLDSA65_PUBLIC_KEY_BYTES);
  });

  it('returns different keys each call', () => {
    const kp1 = generateMLDSAKeyPair();
    const kp2 = generateMLDSAKeyPair();
    expect(Buffer.from(kp1.publicKey).equals(Buffer.from(kp2.publicKey))).toBe(false);
  });
});

describe('ML-DSA-65 sign/verify', () => {
  it('roundtrip succeeds', () => {
    const keyPair = generateMLDSAKeyPair();
    const message = new Uint8Array([1, 2, 3, 4, 5]);
    const signature = mldsaSign(keyPair.secretKey, message);
    const valid = mldsaVerify(keyPair.publicKey, message, signature);
    expect(valid).toBe(true);
  });

  it('verify returns false for tampered message', () => {
    const keyPair = generateMLDSAKeyPair();
    const message = new Uint8Array([1, 2, 3, 4, 5]);
    const signature = mldsaSign(keyPair.secretKey, message);
    const tampered = new Uint8Array([1, 2, 3, 4, 6]);
    const valid = mldsaVerify(keyPair.publicKey, tampered, signature);
    expect(valid).toBe(false);
  });

  it('verify returns false for wrong key', () => {
    const keyPair1 = generateMLDSAKeyPair();
    const keyPair2 = generateMLDSAKeyPair();
    const message = new Uint8Array([1, 2, 3, 4, 5]);
    const signature = mldsaSign(keyPair1.secretKey, message);
    const valid = mldsaVerify(keyPair2.publicKey, message, signature);
    expect(valid).toBe(false);
  });
});

describe('generateHybridKeyPair', () => {
  it('returns both classical and pqc key pairs', async () => {
    const keyPair = await generateHybridKeyPair();
    expect(keyPair.classical).toBeDefined();
    expect(keyPair.classical.privateKey).toBeInstanceOf(CryptoKey);
    expect(keyPair.classical.publicKey).toBeInstanceOf(CryptoKey);
    expect(keyPair.pqc).toBeDefined();
    expect(keyPair.pqc.secretKey).toBeInstanceOf(Uint8Array);
    expect(keyPair.pqc.publicKey).toBeInstanceOf(Uint8Array);
    expect(keyPair.pqc.secretKey.byteLength).toBe(MLDSA65_SECRET_KEY_BYTES);
    expect(keyPair.pqc.publicKey.byteLength).toBe(MLDSA65_PUBLIC_KEY_BYTES);
  });
});

describe('hybrid sign/verify', () => {
  it('roundtrip succeeds', async () => {
    const keyPair = await generateHybridKeyPair();
    const data = new TextEncoder().encode('test message').buffer as ArrayBuffer;
    const signature = await hybridSign(keyPair, data);
    expect(signature.classical).toBeInstanceOf(ArrayBuffer);
    expect(signature.pqc).toBeInstanceOf(Uint8Array);

    const valid = await hybridVerify(
      keyPair.classical.publicKey,
      keyPair.pqc.publicKey,
      data,
      signature
    );
    expect(valid).toBe(true);
  });

  it('verify returns false if classical signature is tampered', async () => {
    const keyPair = await generateHybridKeyPair();
    const data = new TextEncoder().encode('test message').buffer as ArrayBuffer;
    const signature = await hybridSign(keyPair, data);

    // Tamper classical signature
    const tamperedClassical = signature.classical.slice(0);
    new Uint8Array(tamperedClassical)[0] ^= 0xff;
    const tamperedSignature = { classical: tamperedClassical, pqc: signature.pqc };

    const valid = await hybridVerify(
      keyPair.classical.publicKey,
      keyPair.pqc.publicKey,
      data,
      tamperedSignature
    );
    expect(valid).toBe(false);
  });

  it('verify returns false if PQC signature is tampered', async () => {
    const keyPair = await generateHybridKeyPair();
    const data = new TextEncoder().encode('test message').buffer as ArrayBuffer;
    const signature = await hybridSign(keyPair, data);

    // Tamper PQC signature
    const tamperedPqc = new Uint8Array(signature.pqc);
    tamperedPqc[0] ^= 0xff;
    const tamperedSignature = { classical: signature.classical, pqc: tamperedPqc };

    const valid = await hybridVerify(
      keyPair.classical.publicKey,
      keyPair.pqc.publicKey,
      data,
      tamperedSignature
    );
    expect(valid).toBe(false);
  });
});

describe('benchmarkPQC', () => {
  it('returns reasonable timings', async () => {
    const result = await benchmarkPQC();
    expect(result.keygenMs).toBeGreaterThan(0);
    expect(result.signMs).toBeGreaterThan(0);
    expect(result.verifyMs).toBeGreaterThan(0);
    expect(result.signMs).toBeLessThan(5000);
    expect(result.messageSizeBytes).toBe(1024);
  }, 30000);
});
