/**
 * ResourceBundle signature verification and schema validation.
 *
 * A ResourceBundle is a signed collection of civilian resource locations
 * (granaries, water points, shelters, clinics) issued by a trusted NGO publisher.
 * Verification is fully offline using the same HybridSignature mechanism as
 * Plane B SignedBulletins.
 */

import {
  hybridVerify,
  importHybridPublicKey,
  checkPublisher,
  type PublisherEntry,
  type TrustBundle,
} from '@witness/crypto-core';

// Trust types are shared across all signed-content planes (B, C, D).
export type { PublisherEntry, TrustBundle };

export type ResourceType =
  | 'granary'
  | 'water_point'
  | 'underground_shelter'
  | 'surface_shelter'
  | 'clinic'
  | 'transit_corridor';

export type ResourceStatus = 'open' | 'limited' | 'closed' | 'unknown';

export interface ResourceLocation {
  resource_id: string;
  type: ResourceType;
  status: ResourceStatus;
  lat: number;
  lon: number;
  label?: string;
  capacity_hint?: 'low' | 'medium' | 'high';
  last_verified: number;
  expires_at: number;
}

export interface HybridSignature {
  ecdsa_p256: string;
  ml_dsa_65: string;
  key_id: string;
}

export interface ResourceBundle {
  bundle_id: string;
  publisher_id: string;
  valid_from: number;
  valid_to: number;
  bounding_box: {
    north: number;
    east: number;
    south: number;
    west: number;
  };
  resources: ResourceLocation[];
  signature: HybridSignature;
}

export class BundleVerificationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'EXPIRED'
      | 'NOT_YET_VALID'
      | 'UNKNOWN_PUBLISHER'
      | 'REVOKED_PUBLISHER'
      | 'SIGNATURE_INVALID'
      | 'SCHEMA_INVALID',
  ) {
    super(message);
    this.name = 'BundleVerificationError';
  }
}

/**
 * Verify a ResourceBundle against the local trust bundle.
 *
 * Throws BundleVerificationError on any failure. The caller should catch
 * and silently reject the bundle — never display verification errors to
 * end users (avoids leaking information about the trust infrastructure).
 */
export async function verifyBundle(
  bundle: ResourceBundle,
  trust: TrustBundle,
  now = Date.now(),
): Promise<void> {
  // Schema sanity
  if (
    !bundle.bundle_id ||
    !bundle.publisher_id ||
    !bundle.valid_from ||
    !bundle.valid_to ||
    !Array.isArray(bundle.resources) ||
    !bundle.signature
  ) {
    throw new BundleVerificationError('Bundle schema invalid', 'SCHEMA_INVALID');
  }

  // Temporal validity
  if (now < bundle.valid_from) {
    throw new BundleVerificationError('Bundle not yet valid', 'NOT_YET_VALID');
  }
  if (now > bundle.valid_to) {
    throw new BundleVerificationError('Bundle expired', 'EXPIRED');
  }

  // Publisher lookup, revocation, and certificate window (shared trust model)
  const check = checkPublisher(trust, bundle.publisher_id, now);
  if ('failure' in check) {
    if (check.failure === 'UNKNOWN_PUBLISHER') {
      throw new BundleVerificationError('Unknown publisher', 'UNKNOWN_PUBLISHER');
    }
    throw new BundleVerificationError('Publisher revoked or expired', 'REVOKED_PUBLISHER');
  }
  const { publisher } = check;

  // Hybrid signature verification. Import the publisher's base64url-encoded
  // public keys into the shapes hybridVerify expects (CryptoKey + Uint8Array),
  // then require BOTH the classical and post-quantum signatures to verify.
  const payload = canonicalBundlePayload(bundle);
  const { classical, pqc } = await importHybridPublicKey(
    publisher.ecdsa_public_key,
    publisher.ml_dsa_public_key,
  );
  const valid = await hybridVerify(
    classical,
    pqc,
    payload.buffer as ArrayBuffer,
    bundle.signature,
  );
  if (!valid) {
    throw new BundleVerificationError('Signature invalid', 'SIGNATURE_INVALID');
  }
}

/**
 * Return the canonical UTF-8 payload bytes that were signed.
 * Must match the publisher's signing procedure exactly.
 */
function canonicalBundlePayload(bundle: ResourceBundle): Uint8Array {
  const payload = JSON.stringify({
    bundle_id: bundle.bundle_id,
    publisher_id: bundle.publisher_id,
    valid_from: bundle.valid_from,
    valid_to: bundle.valid_to,
    bounding_box: bundle.bounding_box,
    resources: bundle.resources,
  });
  return new TextEncoder().encode(payload);
}

/**
 * Filter resources from a verified bundle that are still fresh.
 * Removes expired individual resources and those with status 'closed'
 * that expired more than 2 hours ago.
 */
export function activeResources(
  bundle: ResourceBundle,
  now = Date.now(),
): ResourceLocation[] {
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  return bundle.resources.filter((r) => {
    if (r.expires_at < now) return false;
    if (r.status === 'closed' && now - r.last_verified > TWO_HOURS) return false;
    return true;
  });
}
