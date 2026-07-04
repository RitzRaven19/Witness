/**
 * Shared publisher trust model (architecture.md §8).
 *
 * A TrustBundle is the device-local list of NGO publishers whose hybrid
 * signatures are accepted, plus revocations. It is consumed by every signed
 * content plane: Plane B bulletins, Plane C resource bundles, and Plane D
 * knowledge bundles all verify against the same structure.
 */

export interface PublisherEntry {
  /** SHA-256 fingerprint of the publisher's ECDSA P-256 public key. */
  publisher_id: string;
  display_name: string;
  /** base64url SPKI ECDSA P-256 public key. */
  ecdsa_public_key: string;
  /** base64url ML-DSA-65 public key. */
  ml_dsa_public_key: string;
  valid_from: number;
  valid_to: number;
}

export interface TrustBundle {
  publishers: PublisherEntry[];
  revoked_publisher_ids: string[];
}

export type PublisherCheckFailure =
  | 'UNKNOWN_PUBLISHER'
  | 'REVOKED_PUBLISHER'
  | 'PUBLISHER_CERT_EXPIRED';

/**
 * Look up a publisher and run the non-cryptographic acceptance checks
 * (existence, revocation, certificate window). Returns the entry, or the
 * failure reason for the caller to map onto its own error type.
 */
export function checkPublisher(
  trust: TrustBundle,
  publisherId: string,
  now: number = Date.now(),
): { publisher: PublisherEntry } | { failure: PublisherCheckFailure } {
  const publisher = trust.publishers.find((p) => p.publisher_id === publisherId);
  if (!publisher) return { failure: 'UNKNOWN_PUBLISHER' };
  if (trust.revoked_publisher_ids.includes(publisherId)) {
    return { failure: 'REVOKED_PUBLISHER' };
  }
  if (now < publisher.valid_from || now > publisher.valid_to) {
    return { failure: 'PUBLISHER_CERT_EXPIRED' };
  }
  return { publisher };
}
