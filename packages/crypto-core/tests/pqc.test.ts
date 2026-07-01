import { describe, it, expect } from 'vitest';
import {
  generateMLDSAKeyPair,
  mldsaSign,
  mldsaVerify,
  generateHybridKeyPair,
  hybridSign,
  hybridVerify,
  keyFingerprint,
  exportHybridPublicKey,
  importHybridPublicKey,
  benchmarkPQC,
} from '../src/pqc.js';

const MLDSA65_SECRET_KEY_BYTES = 4032;
const MLDSA65_PUBLIC_KEY_BYTES = 1952;

const TEST_DATA = new TextEncoder().encode('witness evidence payload').buffer as ArrayBuffer;

describe('generateMLDSAKeyPair', () => {
  it('returns keys of correct lengths', () => {
    const kp = generateMLDSAKeyPair();
    expect(kp.secretKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.secretKey.byteLength).toBe(MLDSA65_SECRET_KEY_BYTES);
    expect(kp.publicKey.byteLength).toBe(MLDSA65_PUBLIC_KEY_BYTES);
  });

  it('produces unique keys each call', () => {
    const kp1 = generateMLDSAKeyPair();
    const kp2 = generateMLDSAKeyPair();
    expect(Buffer.from(kp1.publicKey).equals(Buffer.from(kp2.publicKey))).toBe(false);
  });
});

describe('ML-DSA-65 sign / verify', () => {
  it('roundtrip succeeds', () => {
    const kp = generateMLDSAKeyPair();
    const msg = new Uint8Array([1, 2, 3, 4, 5]);
    const sig = mldsaSign(kp.secretKey, msg);
    expect(mldsaVerify(kp.publicKey, msg, sig)).toBe(true);
  });

  it('returns false for tampered message', () => {
    const kp = generateMLDSAKeyPair();
    const msg = new Uint8Array([1, 2, 3, 4, 5]);
    const sig = mldsaSign(kp.secretKey, msg);
    expect(mldsaVerify(kp.publicKey, new Uint8Array([1, 2, 3, 4, 6]), sig)).toBe(false);
  });

  it('returns false for wrong key', () => {
    const kp1 = generateMLDSAKeyPair();
    const kp2 = generateMLDSAKeyPair();
    const msg = new Uint8Array([1, 2, 3, 4, 5]);
    const sig = mldsaSign(kp1.secretKey, msg);
    expect(mldsaVerify(kp2.publicKey, msg, sig)).toBe(false);
  });
});

describe('keyFingerprint', () => {
  it('returns a 64-character hex string', async () => {
    const kp = await generateHybridKeyPair();
    const fp = await keyFingerprint(kp.classical.publicKey);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same key', async () => {
    const kp = await generateHybridKeyPair();
    const fp1 = await keyFingerprint(kp.classical.publicKey);
    const fp2 = await keyFingerprint(kp.classical.publicKey);
    expect(fp1).toBe(fp2);
  });

  it('differs between distinct keys', async () => {
    const kp1 = await generateHybridKeyPair();
    const kp2 = await generateHybridKeyPair();
    const fp1 = await keyFingerprint(kp1.classical.publicKey);
    const fp2 = await keyFingerprint(kp2.classical.publicKey);
    expect(fp1).not.toBe(fp2);
  });
});

describe('generateHybridKeyPair', () => {
  it('returns both classical and pqc key pairs', async () => {
    const kp = await generateHybridKeyPair();
    expect(kp.classical.privateKey).toBeInstanceOf(CryptoKey);
    expect(kp.classical.publicKey).toBeInstanceOf(CryptoKey);
    expect(kp.pqc.secretKey.byteLength).toBe(MLDSA65_SECRET_KEY_BYTES);
    expect(kp.pqc.publicKey.byteLength).toBe(MLDSA65_PUBLIC_KEY_BYTES);
  });
});

describe('hybridSign', () => {
  it('returns HybridSignature with base64url strings and 64-char hex key_id', async () => {
    const kp = await generateHybridKeyPair();
    const sig = await hybridSign(kp, TEST_DATA);

    expect(typeof sig.ecdsa_p256).toBe('string');
    expect(typeof sig.ml_dsa_65).toBe('string');
    expect(sig.ecdsa_p256.length).toBeGreaterThan(0);
    expect(sig.ml_dsa_65.length).toBeGreaterThan(0);
    expect(sig.key_id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('key_id matches keyFingerprint of the signing key', async () => {
    const kp = await generateHybridKeyPair();
    const sig = await hybridSign(kp, TEST_DATA);
    const expected = await keyFingerprint(kp.classical.publicKey);
    expect(sig.key_id).toBe(expected);
  });


});

describe('hybridVerify', () => {
  it('roundtrip succeeds', async () => {
    const kp = await generateHybridKeyPair();
    const sig = await hybridSign(kp, TEST_DATA);
    const valid = await hybridVerify(kp.classical.publicKey, kp.pqc.publicKey, TEST_DATA, sig);
    expect(valid).toBe(true);
  });

  it('returns false when ECDSA signature is tampered', async () => {
    const kp = await generateHybridKeyPair();
    const sig = await hybridSign(kp, TEST_DATA);

    // Decode, flip first byte, re-encode
    const raw = Buffer.from(sig.ecdsa_p256.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    raw[0] ^= 0xff;
    const tampered = { ...sig, ecdsa_p256: raw.toString('base64url') };

    const valid = await hybridVerify(kp.classical.publicKey, kp.pqc.publicKey, TEST_DATA, tampered);
    expect(valid).toBe(false);
  });

  it('returns false when ML-DSA signature is tampered', async () => {
    const kp = await generateHybridKeyPair();
    const sig = await hybridSign(kp, TEST_DATA);

    const raw = Buffer.from(sig.ml_dsa_65.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    raw[0] ^= 0xff;
    const tampered = { ...sig, ml_dsa_65: raw.toString('base64url') };

    const valid = await hybridVerify(kp.classical.publicKey, kp.pqc.publicKey, TEST_DATA, tampered);
    expect(valid).toBe(false);
  });

  it('returns false when data is tampered', async () => {
    const kp = await generateHybridKeyPair();
    const sig = await hybridSign(kp, TEST_DATA);
    const tampered = new TextEncoder().encode('tampered payload').buffer as ArrayBuffer;
    const valid = await hybridVerify(kp.classical.publicKey, kp.pqc.publicKey, tampered, sig);
    expect(valid).toBe(false);
  });

  it('returns false when wrong classical key is used for verification', async () => {
    const kp1 = await generateHybridKeyPair();
    const kp2 = await generateHybridKeyPair();
    const sig = await hybridSign(kp1, TEST_DATA);
    const valid = await hybridVerify(kp2.classical.publicKey, kp1.pqc.publicKey, TEST_DATA, sig);
    expect(valid).toBe(false);
  });

  it('returns false when wrong PQC key is used for verification', async () => {
    const kp1 = await generateHybridKeyPair();
    const kp2 = await generateHybridKeyPair();
    const sig = await hybridSign(kp1, TEST_DATA);
    const valid = await hybridVerify(kp1.classical.publicKey, kp2.pqc.publicKey, TEST_DATA, sig);
    expect(valid).toBe(false);
  });
});

describe('exportHybridPublicKey', () => {
  it('returns base64url strings and 64-char hex key_id', async () => {
    const kp = await generateHybridKeyPair();
    const exported = await exportHybridPublicKey(kp);

    expect(typeof exported.ecdsa_p256).toBe('string');
    expect(typeof exported.ml_dsa_65).toBe('string');
    expect(exported.key_id).toMatch(/^[0-9a-f]{64}$/);
    expect(exported.ecdsa_p256.length).toBeGreaterThan(0);
    expect(exported.ml_dsa_65.length).toBeGreaterThan(0);
  });

  it('key_id matches keyFingerprint', async () => {
    const kp = await generateHybridKeyPair();
    const exported = await exportHybridPublicKey(kp);
    const expected = await keyFingerprint(kp.classical.publicKey);
    expect(exported.key_id).toBe(expected);
  });
});

describe('importHybridPublicKey', () => {
  it('roundtrip: export then import produces keys that verify correctly', async () => {
    const kp = await generateHybridKeyPair();
    const exported = await exportHybridPublicKey(kp);

    const imported = await importHybridPublicKey(exported.ecdsa_p256, exported.ml_dsa_65);
    expect(imported.classical).toBeInstanceOf(CryptoKey);
    expect(imported.pqc).toBeInstanceOf(Uint8Array);
    expect(imported.pqc.byteLength).toBe(MLDSA65_PUBLIC_KEY_BYTES);

    const sig = await hybridSign(kp, TEST_DATA);
    const valid = await hybridVerify(imported.classical, imported.pqc, TEST_DATA, sig);
    expect(valid).toBe(true);
  });
});

describe('benchmarkPQC', () => {
  it('returns positive timings under 5 s', async () => {
    const result = await benchmarkPQC();
    expect(result.keygenMs).toBeGreaterThan(0);
    expect(result.signMs).toBeGreaterThan(0);
    expect(result.verifyMs).toBeGreaterThan(0);
    expect(result.signMs).toBeLessThan(5000);
    expect(result.messageSizeBytes).toBe(1024);
  }, 30_000);
});
