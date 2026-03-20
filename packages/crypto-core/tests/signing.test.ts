import { describe, it, expect } from 'vitest';
import {
  generateSigningKeyPair,
  sign,
  verify,
  exportPrivateKey,
  exportPublicKey,
  importPrivateKey,
  importPublicKey,
} from '../src/signing.js';

describe('generateSigningKeyPair', () => {
  it('creates a key pair', async () => {
    const keyPair = await generateSigningKeyPair();
    expect(keyPair.privateKey).toBeDefined();
    expect(keyPair.publicKey).toBeDefined();
    expect(keyPair.privateKey.type).toBe('private');
    expect(keyPair.publicKey.type).toBe('public');
  });
});

describe('sign / verify', () => {
  it('sign/verify roundtrip returns true', async () => {
    const keyPair = await generateSigningKeyPair();
    const encoder = new TextEncoder();
    const data = encoder.encode('evidence data').buffer as ArrayBuffer;

    const signature = await sign(keyPair.privateKey, data);
    const valid = await verify(keyPair.publicKey, signature, data);
    expect(valid).toBe(true);
  });

  it('verify returns false for tampered data', async () => {
    const keyPair = await generateSigningKeyPair();
    const encoder = new TextEncoder();
    const data = encoder.encode('original data').buffer as ArrayBuffer;
    const tamperedData = encoder.encode('tampered data').buffer as ArrayBuffer;

    const signature = await sign(keyPair.privateKey, data);
    const valid = await verify(keyPair.publicKey, signature, tamperedData);
    expect(valid).toBe(false);
  });

  it('verify returns false for wrong key', async () => {
    const keyPair1 = await generateSigningKeyPair();
    const keyPair2 = await generateSigningKeyPair();
    const encoder = new TextEncoder();
    const data = encoder.encode('some data').buffer as ArrayBuffer;

    const signature = await sign(keyPair1.privateKey, data);
    const valid = await verify(keyPair2.publicKey, signature, data);
    expect(valid).toBe(false);
  });
});

describe('exportPrivateKey / importPrivateKey', () => {
  it('roundtrip and can still sign', async () => {
    const keyPair = await generateSigningKeyPair();
    const pkcs8 = await exportPrivateKey(keyPair.privateKey);
    expect(pkcs8.byteLength).toBeGreaterThan(0);

    const importedPrivate = await importPrivateKey(pkcs8);
    const encoder = new TextEncoder();
    const data = encoder.encode('test data').buffer as ArrayBuffer;

    const sig1 = await sign(keyPair.privateKey, data);
    const sig2 = await sign(importedPrivate, data);

    // Both signatures should be verifiable with the public key
    const valid1 = await verify(keyPair.publicKey, sig1, data);
    const valid2 = await verify(keyPair.publicKey, sig2, data);
    expect(valid1).toBe(true);
    expect(valid2).toBe(true);
  });
});

describe('exportPublicKey / importPublicKey', () => {
  it('roundtrip and can still verify', async () => {
    const keyPair = await generateSigningKeyPair();
    const spki = await exportPublicKey(keyPair.publicKey);
    expect(spki.byteLength).toBeGreaterThan(0);

    const importedPublic = await importPublicKey(spki);
    const encoder = new TextEncoder();
    const data = encoder.encode('test data').buffer as ArrayBuffer;

    const signature = await sign(keyPair.privateKey, data);
    const valid = await verify(importedPublic, signature, data);
    expect(valid).toBe(true);
  });
});
