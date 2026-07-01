import { describe, it, expect } from 'vitest';
import {
  generateHybridKeyPair,
  hybridSign,
  exportHybridPublicKey,
  type HybridKeyPair,
} from '@witness/crypto-core';
import {
  verifyBundle,
  activeResources,
  BundleVerificationError,
  type ResourceBundle,
  type ResourceLocation,
  type TrustBundle,
} from '../src/resource-bundle.js';

const HOUR = 60 * 60 * 1000;

function sampleResources(now: number): ResourceLocation[] {
  return [
    {
      resource_id: 'r-water',
      type: 'water_point',
      status: 'open',
      lat: 0.5,
      lon: 0.5,
      last_verified: now,
      expires_at: now + 6 * HOUR,
    },
    {
      resource_id: 'r-shelter',
      type: 'underground_shelter',
      status: 'open',
      lat: 0.6,
      lon: 0.4,
      last_verified: now,
      expires_at: now + 6 * HOUR,
    },
  ];
}

/** The exact canonical payload verifyBundle re-derives and checks. */
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

/** Build a signed bundle + a trust bundle that trusts its publisher. */
async function makeSigned(
  kp: HybridKeyPair,
  now: number,
  overrides: Partial<Omit<ResourceBundle, 'signature'>> = {},
): Promise<{ bundle: ResourceBundle; trust: TrustBundle; publisherId: string }> {
  const pub = await exportHybridPublicKey(kp);
  const publisherId = pub.key_id;

  const unsigned: Omit<ResourceBundle, 'signature'> = {
    bundle_id: 'bundle-1',
    publisher_id: publisherId,
    valid_from: now - HOUR,
    valid_to: now + 24 * HOUR,
    bounding_box: { north: 1, east: 1, south: 0, west: 0 },
    resources: sampleResources(now),
    ...overrides,
  };

  const signature = await hybridSign(kp, canonicalPayload(unsigned));
  const bundle: ResourceBundle = { ...unsigned, signature };

  const trust: TrustBundle = {
    publishers: [
      {
        publisher_id: publisherId,
        display_name: 'Test NGO',
        ecdsa_public_key: pub.ecdsa_p256,
        ml_dsa_public_key: pub.ml_dsa_65,
        valid_from: now - 10 * HOUR,
        valid_to: now + 1000 * HOUR,
      },
    ],
    revoked_publisher_ids: [],
  };

  return { bundle, trust, publisherId };
}

async function expectCode(
  p: Promise<unknown>,
  code: BundleVerificationError['code'],
): Promise<void> {
  await expect(p).rejects.toMatchObject({
    name: 'BundleVerificationError',
    code,
  });
}

describe('verifyBundle', () => {
  it('accepts a correctly signed, in-window bundle from a trusted publisher', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, now);
    await expect(verifyBundle(bundle, trust, now)).resolves.toBeUndefined();
  });

  it('rejects a bundle tampered with after signing', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, now);
    bundle.resources[0].lat = 42; // move a resource after the signature was made
    await expectCode(verifyBundle(bundle, trust, now), 'SIGNATURE_INVALID');
  });

  it('rejects a bundle signed by an untrusted key', async () => {
    const now = Date.now();
    const signer = await generateHybridKeyPair();
    const { bundle } = await makeSigned(signer, now);
    // Trust bundle references a DIFFERENT publisher entirely.
    const other = await generateHybridKeyPair();
    const otherPub = await exportHybridPublicKey(other);
    const trust: TrustBundle = {
      publishers: [
        {
          publisher_id: otherPub.key_id,
          display_name: 'Other NGO',
          ecdsa_public_key: otherPub.ecdsa_p256,
          ml_dsa_public_key: otherPub.ml_dsa_65,
          valid_from: now - HOUR,
          valid_to: now + HOUR,
        },
      ],
      revoked_publisher_ids: [],
    };
    await expectCode(verifyBundle(bundle, trust, now), 'UNKNOWN_PUBLISHER');
  });

  it('rejects a revoked publisher', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust, publisherId } = await makeSigned(kp, now);
    trust.revoked_publisher_ids.push(publisherId);
    await expectCode(verifyBundle(bundle, trust, now), 'REVOKED_PUBLISHER');
  });

  it('rejects an expired bundle', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, now, {
      valid_from: now - 10 * HOUR,
      valid_to: now - HOUR,
    });
    await expectCode(verifyBundle(bundle, trust, now), 'EXPIRED');
  });

  it('rejects a not-yet-valid bundle', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, now, {
      valid_from: now + HOUR,
      valid_to: now + 10 * HOUR,
    });
    await expectCode(verifyBundle(bundle, trust, now), 'NOT_YET_VALID');
  });

  it('rejects a schema-invalid bundle', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, now);
    // @ts-expect-error deliberately break the schema
    delete bundle.publisher_id;
    await expectCode(verifyBundle(bundle, trust, now), 'SCHEMA_INVALID');
  });
});

describe('activeResources', () => {
  it('hides resources past their individual expiry', () => {
    const now = Date.now();
    const bundle: ResourceBundle = {
      bundle_id: 'b',
      publisher_id: 'p',
      valid_from: now - HOUR,
      valid_to: now + HOUR,
      bounding_box: { north: 1, east: 1, south: 0, west: 0 },
      resources: [
        { ...sampleResources(now)[0], expires_at: now - 1 },
        { ...sampleResources(now)[1], expires_at: now + HOUR },
      ],
      signature: { ecdsa_p256: '', ml_dsa_65: '', key_id: '' },
    };
    const active = activeResources(bundle, now);
    expect(active.map((r) => r.resource_id)).toEqual(['r-shelter']);
  });

  it('hides closed resources not verified within the last 2 hours', () => {
    const now = Date.now();
    const bundle: ResourceBundle = {
      bundle_id: 'b',
      publisher_id: 'p',
      valid_from: now - HOUR,
      valid_to: now + HOUR,
      bounding_box: { north: 1, east: 1, south: 0, west: 0 },
      resources: [
        {
          ...sampleResources(now)[0],
          status: 'closed',
          last_verified: now - 3 * HOUR,
          expires_at: now + HOUR,
        },
      ],
      signature: { ecdsa_p256: '', ml_dsa_65: '', key_id: '' },
    };
    expect(activeResources(bundle, now)).toHaveLength(0);
  });
});
