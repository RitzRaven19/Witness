/**
 * IndexedDB persistence for verified knowledge bundles and their articles.
 *
 * Design constraints from the Plane D draft honoured here:
 *  - No read history: reads write nothing — no timestamps, no counters.
 *  - Tamper-evident: bundles are signature-verified before install, and every
 *    article read re-verifies content against the signed manifest hash.
 *  - Panic purge wipes the entire database.
 *
 * Deliberate MVP divergence: the draft calls for AES-GCM encryption at rest
 * for D.1 (NGO-signed) content. Signed bundles are public documents — the
 * sensitive datum is what a person READ, which is never recorded. Encryption
 * at rest arrives with D.2 user clips, which are genuinely private.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TrustBundle } from '@witness/crypto-core';
import {
  verifyKnowledgeBundle,
  verifyArticleContent,
  KnowledgeVerificationError,
  type ArticleManifestEntry,
  type KnowledgeBundle,
} from './bundle-verify.js';

export const KNOWLEDGE_DB_NAME = 'witness-knowledge';
export const KNOWLEDGE_DB_VERSION = 1;
const BUNDLE_STORE = 'bundles';
const ARTICLE_STORE = 'articles';

interface StoredBundle {
  bundle_id: string;
  bundle: KnowledgeBundle;
  /** Display name of the publisher entry that verified this bundle. */
  publisherName: string;
  installedAt: number;
}

interface StoredArticle {
  article_id: string;
  bundle_id: string;
  content: string;
}

interface KnowledgeDB extends DBSchema {
  bundles: { key: string; value: StoredBundle };
  articles: {
    key: string;
    value: StoredArticle;
    indexes: { by_bundle: string };
  };
}

/** A listable article: manifest entry + where it came from. */
export interface ArticleListing {
  entry: ArticleManifestEntry;
  bundleId: string;
  bundleTitle: string;
  publisherId: string;
  publisherName: string;
  language: string;
}

export class KnowledgeStore {
  private constructor(private readonly db: IDBPDatabase<KnowledgeDB>) {}

  static async open(): Promise<KnowledgeStore> {
    const db = await openDB<KnowledgeDB>(KNOWLEDGE_DB_NAME, KNOWLEDGE_DB_VERSION, {
      upgrade(database) {
        database.createObjectStore(BUNDLE_STORE, { keyPath: 'bundle_id' });
        const articles = database.createObjectStore(ARTICLE_STORE, {
          keyPath: 'article_id',
        });
        articles.createIndex('by_bundle', 'bundle_id');
      },
    });
    return new KnowledgeStore(db);
  }

  /**
   * Verify and install a bundle with its article contents. Every article in
   * the manifest must be provided and must match its signed hash; otherwise
   * nothing is stored. A re-install of the same bundle_id replaces it.
   */
  async installBundle(
    bundle: KnowledgeBundle,
    articles: Record<string, string>,
    trust: TrustBundle,
    now: number = Date.now(),
  ): Promise<void> {
    await verifyKnowledgeBundle(bundle, trust, now);

    for (const entry of bundle.articles) {
      const content = articles[entry.article_id];
      if (content === undefined) {
        throw new KnowledgeVerificationError(
          `Article ${entry.article_id} missing from payload`,
          'CONTENT_HASH_MISMATCH',
        );
      }
      await verifyArticleContent(entry, content);
    }

    const publisherName =
      trust.publishers.find((p) => p.publisher_id === bundle.publisher_id)
        ?.display_name ?? bundle.publisher_id.slice(0, 8);

    const tx = this.db.transaction([BUNDLE_STORE, ARTICLE_STORE], 'readwrite');
    // Replace any previous version of this bundle (and its articles).
    let cursor = await tx
      .objectStore(ARTICLE_STORE)
      .index('by_bundle')
      .openCursor(bundle.bundle_id);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.objectStore(BUNDLE_STORE).put({
      bundle_id: bundle.bundle_id,
      bundle,
      publisherName,
      installedAt: now,
    });
    for (const entry of bundle.articles) {
      await tx.objectStore(ARTICLE_STORE).put({
        article_id: entry.article_id,
        bundle_id: bundle.bundle_id,
        content: articles[entry.article_id],
      });
    }
    await tx.done;
  }

  /** All installed bundles (metadata only). */
  async listBundles(): Promise<
    Array<{ bundle: KnowledgeBundle; publisherName: string; installedAt: number }>
  > {
    const all = await this.db.getAll(BUNDLE_STORE);
    return all.map((s) => ({
      bundle: s.bundle,
      publisherName: s.publisherName,
      installedAt: s.installedAt,
    }));
  }

  /** Flattened article listings across installed bundles, critical first. */
  async listArticles(): Promise<ArticleListing[]> {
    const bundles = await this.db.getAll(BUNDLE_STORE);
    const order: Record<string, number> = { critical: 0, high: 1, normal: 2 };
    const out: ArticleListing[] = [];
    for (const s of bundles) {
      for (const entry of s.bundle.articles) {
        out.push({
          entry,
          bundleId: s.bundle_id,
          bundleTitle: s.bundle.title,
          publisherId: s.bundle.publisher_id,
          publisherName: s.publisherName,
          language: s.bundle.language,
        });
      }
    }
    return out.sort(
      (a, b) =>
        (order[a.entry.offline_priority] ?? 3) - (order[b.entry.offline_priority] ?? 3),
    );
  }

  /**
   * Read an article, re-verifying its content against the signed manifest
   * hash. Throws CONTENT_HASH_MISMATCH if storage was tampered with.
   * Writes nothing — no read history exists anywhere.
   */
  async readArticle(articleId: string): Promise<string> {
    const stored = await this.db.get(ARTICLE_STORE, articleId);
    if (!stored) throw new Error(`Unknown article ${articleId}`);
    const bundle = await this.db.get(BUNDLE_STORE, stored.bundle_id);
    const entry = bundle?.bundle.articles.find((a) => a.article_id === articleId);
    if (!entry) throw new Error(`Article ${articleId} has no manifest entry`);
    await verifyArticleContent(entry, stored.content);
    return stored.content;
  }

  /** Remove a bundle and its articles. */
  async removeBundle(bundleId: string): Promise<void> {
    const tx = this.db.transaction([BUNDLE_STORE, ARTICLE_STORE], 'readwrite');
    await tx.objectStore(BUNDLE_STORE).delete(bundleId);
    let cursor = await tx
      .objectStore(ARTICLE_STORE)
      .index('by_bundle')
      .openCursor(bundleId);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  /** Panic purge — wipe everything. */
  async purgeAll(): Promise<void> {
    await this.db.clear(BUNDLE_STORE);
    await this.db.clear(ARTICLE_STORE);
  }

  close(): void {
    this.db.close();
  }
}
