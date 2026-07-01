import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import {
  generateHybridKeyPair,
  hybridSign,
  exportHybridPublicKey,
  type HybridKeyPair,
} from '@witness/crypto-core';
import { MapStore } from '../src/map-store.js';
import type {
  ResourceBundle,
  ResourceLocation,
  TrustBundle,
} from '../src/resource-bundle.js';

const HOUR = 60 * 60 * 1000;

function canonicalPayload(b: Omit<ResourceBundle, 'signature'>): ArrayBuffer {
  const json = JSON.stringify({
    bundle_id: b.bundle_id,
    publisher_id: b.publisher_id,
    valid_from: b.valid_from,
    valid_to: b.valid_to,
    bounding_box: b.bounding_box,
    resources: b.resources,
  });
  return new TextEncoder().encode(json).buffer as ArrayBuffer;
}

function oneResource(now: number): ResourceLocation[] {
  return [
    {
      resource_id: 'r1',
      type: 'granary',
      status: 'open',
      lat: 0.5,
      lon: 0.5,
      last_verified: now,
      expires_at: now + 6 * HOUR,
    },
  ];
}

async function makeSigned(
  kp: HybridKeyPair,
  now: number,
  overrides: Partial<Omit<ResourceBundle, 'signature'>> = {},
): Promise<{ bundle: ResourceBundle; trust: TrustBundle }> {
  const pub = await exportHybridPublicKey(kp);
  const unsigned: Omit<ResourceBundle, 'signature'> = {
    bundle_id: 'bundle-1',
    publisher_id: pub.key_id,
    valid_from: now - HOUR,
    valid_to: now + 24 * HOUR,
    bounding_box: { north: 1, east: 1, south: 0, west: 0 },
    resources: oneResource(now),
    ...overrides,
  };
  const signature = await hybridSign(kp, canonicalPayload(unsigned));
  return {
    bundle: { ...unsigned, signature },
    trust: {
      publishers: [
        {
          publisher_id: pub.key_id,
          display_name: 'Test NGO',
          ecdsa_public_key: pub.ecdsa_p256,
          ml_dsa_public_key: pub.ml_dsa_65,
          valid_from: now - 10 * HOUR,
          valid_to: now + 1000 * HOUR,
        },
      ],
      revoked_publisher_ids: [],
    },
  };
}

// Reset the in-memory IndexedDB between tests so each starts clean.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('MapStore', () => {
  it('verifies and persists a valid bundle, then returns its active resources', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, now);

    const store = await MapStore.open(now);
    await store.putBundle(bundle, trust, now);

    expect(await store.getBundle('bundle-1')).toMatchObject({ bundle_id: 'bundle-1' });
    const resources = await store.getActiveResources(now);
    expect(resources.map((r) => r.resource_id)).toEqual(['r1']);
    store.close();
  });

  it('refuses to persist a bundle that fails verification', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, now);
    bundle.resources[0].lat = 99; // tamper after signing

    const store = await MapStore.open(now);
    await expect(store.putBundle(bundle, trust, now)).rejects.toMatchObject({
      name: 'BundleVerificationError',
      code: 'SIGNATURE_INVALID',
    });
    expect(await store.getBundle('bundle-1')).toBeUndefined();
    store.close();
  });

  it('evicts expired bundles on open', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    // A bundle valid now; store it, close, then reopen at a later clock.
    const { bundle, trust } = await makeSigned(kp, now, {
      valid_from: now - HOUR,
      valid_to: now + HOUR,
    });

    let store = await MapStore.open(now);
    await store.putBundle(bundle, trust, now);
    store.close();

    const later = now + 2 * HOUR; // past valid_to
    store = await MapStore.open(later);
    expect(await store.getBundle('bundle-1')).toBeUndefined();
    store.close();
  });

  it('excludes out-of-window bundles from active queries without deleting them', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, now, {
      valid_from: now + HOUR, // not yet valid
      valid_to: now + 10 * HOUR,
    });

    // Store while treating it as valid (bypass verify window via a future clock),
    // then query at `now` where it is not yet active.
    const store = await MapStore.open(now);
    await store.putBundle(bundle, trust, now + 2 * HOUR);
    expect(await store.getActiveResources(now)).toHaveLength(0);
    expect(await store.getBundle('bundle-1')).toBeDefined();
    store.close();
  });

  it('purgeAll wipes every stored bundle', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, now);

    const store = await MapStore.open(now);
    await store.putBundle(bundle, trust, now);
    await store.purgeAll();
    expect(await store.getActiveBundles(now)).toHaveLength(0);
    store.close();
  });
});
