/**
 * KnowledgeBundle verification (Plane D — docs/plane-d-knowledge-library.md).
 *
 * A KnowledgeBundle is an NGO-signed manifest of survival/reference articles
 * (first aid, water safety, legal rights, …). The bundle signature covers the
 * manifest — including each article's SHA-256 content hash — so article
 * content is tamper-evident end-to-end: verify the bundle once, then verify
 * each article's hash against the signed manifest at read time.
 *
 * Divergence from the Plane D draft: the draft names Ed25519, but every other
 * signed plane (B bulletins, C resource bundles) uses the hybrid
 * ECDSA P-256 + ML-DSA-65 signature from crypto-core, and the draft's own
 * constraint is "no additional trust model is introduced" — so hybrid it is.
 */

import {
  hybridVerify,
  importHybridPublicKey,
  hashFile,
  checkPublisher,
  type TrustBundle,
  type HybridSignature,
} from '@witness/crypto-core';

export type OfflinePriority = 'critical' | 'high' | 'normal';

export interface ArticleManifestEntry {
  article_id: string;
  title: string;
  /** SHA-256 hex of the article's plaintext content. */
  content_hash: string;
  byte_length: number;
  tags: string[];
  offline_priority: OfflinePriority;
}

export interface KnowledgeBundle {
  bundle_id: string;
  /** SHA-256 fingerprint of the publisher's ECDSA public key. */
  publisher_id: string;
  title: string;
  /** BCP-47 language tag. */
  language: string;
  /** Monotonically increasing per publisher+title. */
  version: number;
  valid_from: number;
  /** Optional expiry — evergreen bundles omit it. */
  valid_to?: number;
  articles: ArticleManifestEntry[];
  signature: HybridSignature;
}

export class KnowledgeVerificationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'SCHEMA_INVALID'
      | 'NOT_YET_VALID'
      | 'EXPIRED'
      | 'UNKNOWN_PUBLISHER'
      | 'REVOKED_PUBLISHER'
      | 'SIGNATURE_INVALID'
      | 'CONTENT_HASH_MISMATCH',
  ) {
    super(message);
    this.name = 'KnowledgeVerificationError';
  }
}

/** Canonical signed payload — must match the publisher's signing procedure. */
export function canonicalKnowledgePayload(
  bundle: Omit<KnowledgeBundle, 'signature'>,
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      bundle_id: bundle.bundle_id,
      publisher_id: bundle.publisher_id,
      title: bundle.title,
      language: bundle.language,
      version: bundle.version,
      valid_from: bundle.valid_from,
      valid_to: bundle.valid_to ?? null,
      articles: bundle.articles,
    }),
  );
}

/**
 * Verify a KnowledgeBundle against the local trust bundle. Throws
 * KnowledgeVerificationError on any failure; callers should reject silently
 * (never surface trust details to end users).
 */
export async function verifyKnowledgeBundle(
  bundle: KnowledgeBundle,
  trust: TrustBundle,
  now = Date.now(),
): Promise<void> {
  if (
    !bundle.bundle_id ||
    !bundle.publisher_id ||
    !bundle.title ||
    !bundle.valid_from ||
    !Array.isArray(bundle.articles) ||
    bundle.articles.length === 0 ||
    !bundle.signature
  ) {
    throw new KnowledgeVerificationError('Bundle schema invalid', 'SCHEMA_INVALID');
  }
  if (now < bundle.valid_from) {
    throw new KnowledgeVerificationError('Bundle not yet valid', 'NOT_YET_VALID');
  }
  if (bundle.valid_to !== undefined && now > bundle.valid_to) {
    throw new KnowledgeVerificationError('Bundle expired', 'EXPIRED');
  }

  const check = checkPublisher(trust, bundle.publisher_id, now);
  if ('failure' in check) {
    if (check.failure === 'UNKNOWN_PUBLISHER') {
      throw new KnowledgeVerificationError('Unknown publisher', 'UNKNOWN_PUBLISHER');
    }
    throw new KnowledgeVerificationError('Publisher revoked or expired', 'REVOKED_PUBLISHER');
  }

  const { classical, pqc } = await importHybridPublicKey(
    check.publisher.ecdsa_public_key,
    check.publisher.ml_dsa_public_key,
  );
  const payload = canonicalKnowledgePayload(bundle);
  const valid = await hybridVerify(
    classical,
    pqc,
    payload.buffer as ArrayBuffer,
    bundle.signature,
  );
  if (!valid) {
    throw new KnowledgeVerificationError('Signature invalid', 'SIGNATURE_INVALID');
  }
}

/**
 * Verify article content against its signed manifest entry (hash + length).
 * Used at install time and re-checked on every read, making content
 * tamper-evident even if the storage layer is modified underneath us.
 */
export async function verifyArticleContent(
  entry: ArticleManifestEntry,
  content: string,
): Promise<void> {
  const bytes = new TextEncoder().encode(content);
  if (bytes.byteLength !== entry.byte_length) {
    throw new KnowledgeVerificationError(
      `Article ${entry.article_id} length mismatch`,
      'CONTENT_HASH_MISMATCH',
    );
  }
  const hash = await hashFile(bytes.buffer as ArrayBuffer);
  if (hash !== entry.content_hash) {
    throw new KnowledgeVerificationError(
      `Article ${entry.article_id} content hash mismatch`,
      'CONTENT_HASH_MISMATCH',
    );
  }
}
