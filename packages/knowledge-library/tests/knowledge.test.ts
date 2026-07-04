import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import {
  generateHybridKeyPair,
  hybridSign,
  exportHybridPublicKey,
  hashFile,
  type HybridKeyPair,
  type TrustBundle,
} from '@witness/crypto-core';
import {
  verifyKnowledgeBundle,
  canonicalKnowledgePayload,
  type KnowledgeBundle,
  type ArticleManifestEntry,
} from '../src/bundle-verify.js';
import { KnowledgeStore } from '../src/knowledge-store.js';

const HOUR = 60 * 60 * 1000;

async function manifestEntry(
  id: string,
  content: string,
  priority: ArticleManifestEntry['offline_priority'] = 'normal',
): Promise<ArticleManifestEntry> {
  const bytes = new TextEncoder().encode(content);
  return {
    article_id: id,
    title: `Article ${id}`,
    content_hash: await hashFile(bytes.buffer as ArrayBuffer),
    byte_length: bytes.byteLength,
    tags: ['first-aid'],
    offline_priority: priority,
  };
}

async function makeSigned(
  kp: HybridKeyPair,
  articles: Record<string, string>,
  now: number,
  overrides: Partial<Omit<KnowledgeBundle, 'signature'>> = {},
): Promise<{ bundle: KnowledgeBundle; trust: TrustBundle }> {
  const pub = await exportHybridPublicKey(kp);
  const entries = await Promise.all(
    Object.entries(articles).map(([id, content], i) =>
      manifestEntry(id, content, i === 0 ? 'critical' : 'normal'),
    ),
  );
  const unsigned: Omit<KnowledgeBundle, 'signature'> = {
    bundle_id: 'kb-1',
    publisher_id: pub.key_id,
    title: 'Field Survival Guide',
    language: 'en',
    version: 1,
    valid_from: now - HOUR,
    articles: entries,
    ...overrides,
  };
  const signature = await hybridSign(
    kp,
    canonicalKnowledgePayload(unsigned).buffer as ArrayBuffer,
  );
  const trust: TrustBundle = {
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
  };
  return { bundle: { ...unsigned, signature }, trust };
}

const ARTICLES = {
  bleeding: 'Apply firm pressure to the wound with clean gauze.',
  water: 'Boil water for at least one minute before drinking.',
};

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('verifyKnowledgeBundle', () => {
  it('accepts a correctly signed bundle (evergreen, no valid_to)', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, ARTICLES, now);
    await expect(verifyKnowledgeBundle(bundle, trust, now)).resolves.toBeUndefined();
  });

  it('rejects a manifest tampered after signing', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, ARTICLES, now);
    bundle.articles[0].content_hash = 'ff'.repeat(32); // swap in attacker hash
    await expect(verifyKnowledgeBundle(bundle, trust, now)).rejects.toMatchObject({
      code: 'SIGNATURE_INVALID',
    });
  });

  it('rejects unknown and revoked publishers', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, ARTICLES, now);
    await expect(
      verifyKnowledgeBundle(bundle, { publishers: [], revoked_publisher_ids: [] }, now),
    ).rejects.toMatchObject({ code: 'UNKNOWN_PUBLISHER' });
    trust.revoked_publisher_ids.push(bundle.publisher_id);
    await expect(verifyKnowledgeBundle(bundle, trust, now)).rejects.toMatchObject({
      code: 'REVOKED_PUBLISHER',
    });
  });

  it('honours valid_to when present', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, ARTICLES, now, {
      valid_from: now - 10 * HOUR,
      valid_to: now - HOUR,
    });
    await expect(verifyKnowledgeBundle(bundle, trust, now)).rejects.toMatchObject({
      code: 'EXPIRED',
    });
  });
});

describe('KnowledgeStore', () => {
  it('installs a verified bundle and reads hash-verified articles', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, ARTICLES, now);

    const store = await KnowledgeStore.open();
    await store.installBundle(bundle, ARTICLES, trust, now);

    const listings = await store.listArticles();
    expect(listings).toHaveLength(2);
    // critical priority sorts first
    expect(listings[0].entry.offline_priority).toBe('critical');
    expect(listings[0].publisherName).toBe('Test NGO');

    const content = await store.readArticle('bleeding');
    expect(content).toBe(ARTICLES.bleeding);
    store.close();
  });

  it('refuses to install when an article body does not match its signed hash', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, ARTICLES, now);
    const forged = { ...ARTICLES, bleeding: 'Rub dirt on it.' }; // content swap

    const store = await KnowledgeStore.open();
    await expect(store.installBundle(bundle, forged, trust, now)).rejects.toMatchObject({
      code: 'CONTENT_HASH_MISMATCH',
    });
    expect(await store.listArticles()).toHaveLength(0);
    store.close();
  });

  it('refuses to install when an article is missing from the payload', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, ARTICLES, now);
    const store = await KnowledgeStore.open();
    await expect(
      store.installBundle(bundle, { bleeding: ARTICLES.bleeding }, trust, now),
    ).rejects.toMatchObject({ code: 'CONTENT_HASH_MISMATCH' });
    store.close();
  });

  it('detects storage tampering on read', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, ARTICLES, now);
    const store = await KnowledgeStore.open();
    await store.installBundle(bundle, ARTICLES, trust, now);
    store.close();

    // Attacker writes directly to IndexedDB, bypassing the store API.
    const raw = indexedDB.open('witness-knowledge', 1);
    await new Promise<void>((resolve, reject) => {
      raw.onsuccess = () => {
        const tx = raw.result.transaction('articles', 'readwrite');
        tx.objectStore('articles').put({
          article_id: 'bleeding',
          bundle_id: 'kb-1',
          content: 'Rub dirt on it.',
        });
        tx.oncomplete = () => {
          raw.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      raw.onerror = () => reject(raw.error);
    });

    const store2 = await KnowledgeStore.open();
    await expect(store2.readArticle('bleeding')).rejects.toMatchObject({
      code: 'CONTENT_HASH_MISMATCH',
    });
    store2.close();
  });

  it('replaces a bundle on re-install and purges everything on purgeAll', async () => {
    const now = Date.now();
    const kp = await generateHybridKeyPair();
    const { bundle, trust } = await makeSigned(kp, ARTICLES, now);
    const store = await KnowledgeStore.open();
    await store.installBundle(bundle, ARTICLES, trust, now);
    await store.installBundle(bundle, ARTICLES, trust, now); // idempotent replace
    expect(await store.listArticles()).toHaveLength(2);

    await store.purgeAll();
    expect(await store.listArticles()).toHaveLength(0);
    expect(await store.listBundles()).toHaveLength(0);
    store.close();
  });
});
