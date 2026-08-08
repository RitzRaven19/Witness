import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { bytesToHex, hexToBytes, importKey } from '@witness/crypto-core';
import { ClipStore, type NewClip, type SealKeyFn, type UnsealKeyFn } from '../src/clip-store.js';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/**
 * A trivial in-memory "vault" standing in for the device vault: seal = hex
 * the raw key, unseal = un-hex it. Exercises ClipStore's key-agnostic design
 * without needing any device/DOM crypto beyond what encrypt/decrypt use.
 */
function fakeVault(): { seal: SealKeyFn; unseal: UnsealKeyFn; locked: { value: boolean } } {
  const locked = { value: false };
  const seal: SealKeyFn = async (rawKey) => bytesToHex(new Uint8Array(rawKey));
  const unseal: UnsealKeyFn = async (sealedHex) => {
    if (locked.value) return null;
    return importKey(hexToBytes(sealedHex).buffer as ArrayBuffer);
  };
  return { seal, unseal, locked };
}

const SAMPLE: NewClip = {
  title: 'Water purification field notes',
  plaintext_content: 'Boil for one minute; longer above 2000m altitude.',
  tags: ['water', 'survival'],
};

describe('ClipStore', () => {
  it('saves and reads back a clip with content intact', async () => {
    const store = await ClipStore.open();
    const vault = fakeVault();
    const id = await store.saveClip(SAMPLE, vault.seal);

    const clip = await store.readClip(id, vault.unseal);
    expect(clip).not.toBeNull();
    expect(clip!.title).toBe(SAMPLE.title);
    expect(clip!.plaintext_content).toBe(SAMPLE.plaintext_content);
    expect(clip!.tags).toEqual(['water', 'survival']);
    expect(clip!.clip_id).toBe(id);
    store.close();
  });

  it('omits source_url unless explicitly provided', async () => {
    const store = await ClipStore.open();
    const vault = fakeVault();
    const id = await store.saveClip(SAMPLE, vault.seal);
    const clip = await store.readClip(id, vault.unseal);
    expect(clip!.source_url).toBeUndefined();
    store.close();
  });

  it('includes source_url only when the caller opts in', async () => {
    const store = await ClipStore.open();
    const vault = fakeVault();
    const id = await store.saveClip(
      { ...SAMPLE, source_url: 'https://example.org/article' },
      vault.seal,
    );
    const clip = await store.readClip(id, vault.unseal);
    expect(clip!.source_url).toBe('https://example.org/article');
    store.close();
  });

  it('listClips exposes only metadata — tags and timestamp, never content', async () => {
    const store = await ClipStore.open();
    const vault = fakeVault();
    await store.saveClip(SAMPLE, vault.seal);

    const listings = await store.listClips();
    expect(listings).toHaveLength(1);
    expect(listings[0].tags).toEqual(['water', 'survival']);
    expect(JSON.stringify(listings)).not.toContain('Boil for one minute');
    expect(JSON.stringify(listings)).not.toContain(SAMPLE.title);
    store.close();
  });

  it('lists newest first', async () => {
    const store = await ClipStore.open();
    const vault = fakeVault();
    await store.saveClip({ ...SAMPLE, title: 'first' }, vault.seal, 1000);
    await store.saveClip({ ...SAMPLE, title: 'second' }, vault.seal, 2000);
    const listings = await store.listClips();
    expect(listings.map((l) => l.clipped_at)).toEqual([2000, 1000]);
    store.close();
  });

  it('returns null (not throw) when the vault cannot unseal the key', async () => {
    const store = await ClipStore.open();
    const vault = fakeVault();
    const id = await store.saveClip(SAMPLE, vault.seal);

    vault.locked.value = true; // simulate a locked device vault
    const clip = await store.readClip(id, vault.unseal);
    expect(clip).toBeNull();
    store.close();
  });

  it('each clip gets an independent key — a mismatched key cannot decrypt it', async () => {
    const store = await ClipStore.open();
    const vault = fakeVault();
    const idA = await store.saveClip({ ...SAMPLE, title: 'A' }, vault.seal);

    // Simulate a key mix-up: unseal always hands back an unrelated random key
    // instead of A's real one. Decrypting A's ciphertext with it must fail
    // (GCM auth), not silently succeed with garbage.
    const wrongUnseal: UnsealKeyFn = async () => {
      const randomKeyHex = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
      return importKey(hexToBytes(randomKeyHex).buffer as ArrayBuffer);
    };
    await expect(store.readClip(idA, wrongUnseal)).rejects.toThrow();
    store.close();
  });

  it('deleteClip removes it from both content and listing', async () => {
    const store = await ClipStore.open();
    const vault = fakeVault();
    const id = await store.saveClip(SAMPLE, vault.seal);
    await store.deleteClip(id);
    expect(await store.readClip(id, vault.unseal)).toBeNull();
    expect(await store.listClips()).toHaveLength(0);
    store.close();
  });

  it('purgeAll deletes every clip unconditionally', async () => {
    const store = await ClipStore.open();
    const vault = fakeVault();
    await store.saveClip(SAMPLE, vault.seal);
    await store.saveClip({ ...SAMPLE, title: 'second' }, vault.seal);
    await store.purgeAll();
    expect(await store.listClips()).toHaveLength(0);
    store.close();
  });

  it('readClip on an unknown id returns null', async () => {
    const store = await ClipStore.open();
    const vault = fakeVault();
    expect(await store.readClip('nonexistent', vault.unseal)).toBeNull();
    store.close();
  });
});
