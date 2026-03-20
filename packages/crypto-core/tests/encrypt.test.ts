import { describe, it, expect } from 'vitest';
import {
  generateEncryptionKey,
  encrypt,
  decrypt,
  exportKey,
  importKey,
  encryptWithIv,
} from '../src/encrypt.js';

describe('generateEncryptionKey', () => {
  it('creates a CryptoKey', async () => {
    const key = await generateEncryptionKey();
    expect(key).toBeDefined();
    expect(key.type).toBe('secret');
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
  });
});

describe('encrypt / decrypt', () => {
  it('roundtrip produces original plaintext', async () => {
    const key = await generateEncryptionKey();
    const encoder = new TextEncoder();
    const plaintext = encoder.encode('Hello, Witness!').buffer as ArrayBuffer;

    const { ciphertext, iv } = await encrypt(key, plaintext);
    const decrypted = await decrypt(key, ciphertext, iv);

    expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(plaintext));
  });

  it('two encryptions of same plaintext produce different ciphertexts (random IV)', async () => {
    const key = await generateEncryptionKey();
    const encoder = new TextEncoder();
    const plaintext = encoder.encode('same data').buffer as ArrayBuffer;

    const result1 = await encrypt(key, plaintext);
    const result2 = await encrypt(key, plaintext);

    // IVs should be different
    expect(result1.iv).not.toEqual(result2.iv);

    // Ciphertexts should be different
    const ct1 = new Uint8Array(result1.ciphertext);
    const ct2 = new Uint8Array(result2.ciphertext);
    expect(ct1).not.toEqual(ct2);
  });

  it('decrypt with wrong key throws', async () => {
    const key1 = await generateEncryptionKey();
    const key2 = await generateEncryptionKey();
    const encoder = new TextEncoder();
    const plaintext = encoder.encode('secret data').buffer as ArrayBuffer;

    const { ciphertext, iv } = await encrypt(key1, plaintext);

    await expect(decrypt(key2, ciphertext, iv)).rejects.toThrow();
  });

  it('encryptWithIv produces deterministic output', async () => {
    const key = await generateEncryptionKey();
    const encoder = new TextEncoder();
    const plaintext = encoder.encode('deterministic').buffer as ArrayBuffer;
    const iv = new Uint8Array(12).fill(42);

    const ct1 = await encryptWithIv(key, plaintext, iv);
    const ct2 = await encryptWithIv(key, plaintext, iv);

    expect(new Uint8Array(ct1)).toEqual(new Uint8Array(ct2));
  });
});

describe('exportKey / importKey', () => {
  it('roundtrip works and produces functional key', async () => {
    const key = await generateEncryptionKey();
    const rawKey = await exportKey(key);
    expect(rawKey.byteLength).toBe(32); // 256 bits

    const importedKey = await importKey(rawKey);
    expect(importedKey.type).toBe('secret');

    // Verify the imported key can decrypt what the original key encrypted
    const encoder = new TextEncoder();
    const plaintext = encoder.encode('test message').buffer as ArrayBuffer;
    const { ciphertext, iv } = await encrypt(key, plaintext);
    const decrypted = await decrypt(importedKey, ciphertext, iv);
    expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(plaintext));
  });
});
