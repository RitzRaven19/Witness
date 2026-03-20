import { describe, it, expect } from 'vitest';
import { generateSalt, deriveKey, deriveAndWrapKey, KDF_PARAMS } from '../src/kdf.js';

describe('generateSalt', () => {
  it('returns 16 bytes', () => {
    const salt = generateSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.byteLength).toBe(16);
  });

  it('returns different salts each time', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    expect(salt1).not.toEqual(salt2);
  });
});

describe('deriveKey', () => {
  it('returns 32 bytes', async () => {
    const salt = generateSalt();
    const key = await deriveKey('passphrase', salt);
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.byteLength).toBe(32);
  }, 15000);

  it('is deterministic (same passphrase + salt = same key)', async () => {
    const salt = generateSalt();
    const key1 = await deriveKey('mypassword', salt);
    const key2 = await deriveKey('mypassword', salt);
    expect(key1).toEqual(key2);
  }, 30000);

  it('different passphrases give different keys', async () => {
    const salt = generateSalt();
    const key1 = await deriveKey('password1', salt);
    const key2 = await deriveKey('password2', salt);
    expect(key1).not.toEqual(key2);
  }, 30000);

  it('different salts give different keys', async () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const key1 = await deriveKey('samepassword', salt1);
    const key2 = await deriveKey('samepassword', salt2);
    expect(key1).not.toEqual(key2);
  }, 30000);
});

describe('deriveAndWrapKey', () => {
  it('returns a CryptoKey usable for AES-256-GCM', async () => {
    const salt = generateSalt();
    const cryptoKey = await deriveAndWrapKey('passphrase', salt);
    expect(cryptoKey).toBeDefined();
    expect(cryptoKey.type).toBe('secret');
    expect(cryptoKey.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    expect(cryptoKey.usages).toContain('encrypt');
    expect(cryptoKey.usages).toContain('decrypt');
  }, 15000);
});
