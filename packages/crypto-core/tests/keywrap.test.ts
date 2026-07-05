import { describe, it, expect } from 'vitest';
import {
  generateEncryptionKey,
  exportKey,
  encrypt,
  decrypt,
  wrapEvidenceKey,
  unwrapEvidenceKey,
  wrapMasterKey,
  unwrapMasterKey,
} from '../src/index.js';

const DATA = new TextEncoder().encode('captured evidence plaintext').buffer as ArrayBuffer;

describe('evidence key wrapping', () => {
  it('wraps and unwraps a per-evidence key that still decrypts its blob', async () => {
    const master = await generateEncryptionKey();
    const evidenceKey = await generateEncryptionKey();
    const { ciphertext, iv } = await encrypt(evidenceKey, DATA);

    const wrapped = await wrapEvidenceKey(master, await exportKey(evidenceKey));
    expect(wrapped.wrappedHex).toMatch(/^[0-9a-f]+$/);
    // 32-byte key + 16-byte GCM tag = 48 bytes ciphertext
    expect(wrapped.wrappedHex.length).toBe(96);

    const unwrapped = await unwrapEvidenceKey(master, wrapped);
    const plain = await decrypt(unwrapped, ciphertext, iv);
    expect(new TextDecoder().decode(plain)).toBe('captured evidence plaintext');
  });

  it('the wrong master key cannot unwrap (GCM auth failure)', async () => {
    const master = await generateEncryptionKey();
    const other = await generateEncryptionKey();
    const wrapped = await wrapEvidenceKey(master, await exportKey(await generateEncryptionKey()));
    await expect(unwrapEvidenceKey(other, wrapped)).rejects.toThrow();
  });

  it('wrapped bytes never equal the raw key', async () => {
    const master = await generateEncryptionKey();
    const evidenceKey = await generateEncryptionKey();
    const raw = Buffer.from(await exportKey(evidenceKey)).toString('hex');
    const wrapped = await wrapEvidenceKey(master, await exportKey(evidenceKey));
    expect(wrapped.wrappedHex).not.toContain(raw);
  });
});

describe('passphrase-wrapped master key', () => {
  it('round-trips under the correct passphrase', async () => {
    const master = await generateEncryptionKey();
    const raw = await exportKey(master);
    const wrapped = await wrapMasterKey('correct horse battery staple', raw);

    const recovered = await unwrapMasterKey('correct horse battery staple', wrapped);
    expect(recovered).not.toBeNull();
    // recovered master must unwrap evidence keys wrapped by the original
    const evidenceKey = await generateEncryptionKey();
    const w = await wrapEvidenceKey(master, await exportKey(evidenceKey));
    await expect(unwrapEvidenceKey(recovered!, w)).resolves.toBeTruthy();
  });

  it('returns null for a wrong passphrase instead of throwing', async () => {
    const master = await generateEncryptionKey();
    const wrapped = await wrapMasterKey('right', await exportKey(master));
    expect(await unwrapMasterKey('wrong', wrapped)).toBeNull();
  });

  it('uses a fresh salt per wrap', async () => {
    const raw = await exportKey(await generateEncryptionKey());
    const a = await wrapMasterKey('p', raw);
    const b = await wrapMasterKey('p', raw);
    expect(a.saltHex).not.toBe(b.saltHex);
    expect(a.wrappedHex).not.toBe(b.wrappedHex);
  });
});
