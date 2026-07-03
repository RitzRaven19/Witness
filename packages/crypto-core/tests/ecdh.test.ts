import { describe, it, expect } from 'vitest';
import {
  generateEcdhKeyPair,
  exportEcdhPublicKey,
  importEcdhPublicKey,
  exportEcdhPrivateKey,
  importEcdhPrivateKey,
  sealToPublicKey,
  openSealed,
  ECDH_PUBLIC_KEY_BYTES,
} from '../src/ecdh.js';

const MSG = new TextEncoder().encode('meet at the north water point at dawn');

describe('ECDH sealed box', () => {
  it('round-trips: seal to recipient, recipient opens', async () => {
    const recipient = await generateEcdhKeyPair();
    const sealed = await sealToPublicKey(recipient.publicKey, MSG);
    const opened = await openSealed(recipient.privateKey, sealed);
    expect(opened).not.toBeNull();
    expect(new TextDecoder().decode(opened!)).toBe('meet at the north water point at dawn');
  });

  it('sealed box layout: ephemeral pub (65) + iv (12) + ct+tag', async () => {
    const recipient = await generateEcdhKeyPair();
    const sealed = await sealToPublicKey(recipient.publicKey, MSG);
    expect(sealed.length).toBe(ECDH_PUBLIC_KEY_BYTES + 12 + MSG.length + 16);
    expect(sealed[0]).toBe(0x04); // uncompressed point marker
  });

  it('wrong recipient cannot open (returns null, no throw)', async () => {
    const recipient = await generateEcdhKeyPair();
    const other = await generateEcdhKeyPair();
    const sealed = await sealToPublicKey(recipient.publicKey, MSG);
    expect(await openSealed(other.privateKey, sealed)).toBeNull();
  });

  it('tampered ciphertext fails to open', async () => {
    const recipient = await generateEcdhKeyPair();
    const sealed = await sealToPublicKey(recipient.publicKey, MSG);
    sealed[sealed.length - 1] ^= 0xff;
    expect(await openSealed(recipient.privateKey, sealed)).toBeNull();
  });

  it('truncated/garbage input returns null', async () => {
    const recipient = await generateEcdhKeyPair();
    expect(await openSealed(recipient.privateKey, new Uint8Array(10))).toBeNull();
    expect(await openSealed(recipient.privateKey, new Uint8Array(200))).toBeNull();
  });

  it('two seals of the same message differ (fresh ephemeral + iv)', async () => {
    const recipient = await generateEcdhKeyPair();
    const a = await sealToPublicKey(recipient.publicKey, MSG);
    const b = await sealToPublicKey(recipient.publicKey, MSG);
    expect(a).not.toEqual(b);
  });

  it('public and private keys survive export/import round-trip', async () => {
    const kp = await generateEcdhKeyPair();
    const pubRaw = await exportEcdhPublicKey(kp.publicKey);
    expect(pubRaw.length).toBe(ECDH_PUBLIC_KEY_BYTES);
    const pub2 = await importEcdhPublicKey(pubRaw);
    const priv2 = await importEcdhPrivateKey(await exportEcdhPrivateKey(kp.privateKey));

    const sealed = await sealToPublicKey(pub2, MSG);
    const opened = await openSealed(priv2, sealed);
    expect(opened).toEqual(MSG);
  });
});
