/**
 * @witness/knowledge-library — Plane D offline knowledge library.
 *
 * NGO-signed survival and reference content (first aid, water safety, legal
 * rights) verified against the shared publisher trust chain, with
 * hash-verified reads and no read history. See docs/plane-d-knowledge-library.md.
 */

export {
  verifyKnowledgeBundle,
  verifyArticleContent,
  canonicalKnowledgePayload,
  KnowledgeVerificationError,
  type KnowledgeBundle,
  type ArticleManifestEntry,
  type OfflinePriority,
} from './bundle-verify.js';

export {
  KnowledgeStore,
  KNOWLEDGE_DB_NAME,
  KNOWLEDGE_DB_VERSION,
  type ArticleListing,
} from './knowledge-store.js';

export {
  ClipStore,
  CLIPS_DB_NAME,
  CLIPS_DB_VERSION,
  type ClippedArticle,
  type NewClip,
  type ClipListing,
  type SealKeyFn,
  type UnsealKeyFn,
} from './clip-store.js';
