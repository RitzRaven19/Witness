/**
 * User-clipped articles (Plane D.2 — docs/plane-d-knowledge-library.md).
 *
 * Unlike NGO-signed bundles (D.1), clips are private, unsigned, user-owned
 * content: a URL or pasted text saved for later offline reading. Design
 * constraints from the spec:
 *  - Never transmitted anywhere — purely local.
 *  - Encrypted at rest. Each clip gets its own fresh AES-256-GCM key; this
 *    package encrypts/decrypts with it but never touches device key
 *    management — sealing/unsealing that key to the device vault is injected
 *    by the caller (apps/pwa/src/store/clipStore.ts), the same separation
 *    KnowledgeStore keeps from publisher trust and MapStore keeps from OPFS
 *    tile management. That keeps this package portable and testable with a
 *    fake seal/unseal pair, no device or DOM APIs required.
 *  - `source_url` is stored only if the caller explicitly opts in.
 *  - No read history: reads write nothing.
 *  - Panic purge deletes clips unconditionally (never "hidden" — spec's
 *    hide/escrow model is proposed for D.1 bundles only, and isn't built for
 *    any plane in this codebase yet; clips have no canonical copy elsewhere,
 *    so escrow wouldn't help recover them anyway).
 *
 * Storage: the spec allows IndexedDB for "small" content and reserves OPFS
 * for "large" content. Clips are text, always small in practice, so this
 * stores the encrypted blob in IndexedDB alongside metadata — one storage
 * backend, consistent with how KnowledgeStore already persists full article
 * bodies. Only `tags` and `clipped_at` are plaintext row fields (explicitly
 * permitted by the spec's storage section); `title` and `source_url` live
 * INSIDE the encrypted blob — more conservative than the spec's literal
 * ClippedArticle shape, but a title alone can reveal what someone was
 * researching, which is exactly what the design constraints rule out.
 */

import { generateEncryptionKey, exportKey, encrypt, decrypt, bytesToHex, hexToBytes } from '@witness/crypto-core';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export const CLIPS_DB_NAME = 'witness-clips';
export const CLIPS_DB_VERSION = 1;
const CLIP_STORE = 'clips';

export interface ClippedArticle {
  clip_id: string;
  source_url?: string;
  title: string;
  plaintext_content: string;
  clipped_at: number;
  tags: string[];
}

/** Input for saving a new clip — everything except the generated id/timestamp. */
export type NewClip = Pick<ClippedArticle, 'title' | 'plaintext_content' | 'tags'> & {
  source_url?: string;
};

/** Metadata-only listing — safe to render without decrypting anything. */
export interface ClipListing {
  clip_id: string;
  clipped_at: number;
  tags: string[];
}

interface StoredClip {
  clip_id: string;
  clipped_at: number;
  tags: string[];
  /** Opaque to this package — produced by the caller's vault-sealing. */
  sealedKeyHex: string;
  ivHex: string;
  /** AES-GCM ciphertext of { title, plaintext_content, source_url }. */
  cipherHex: string;
}

interface ClipsDB extends DBSchema {
  clips: {
    key: string;
    value: StoredClip;
    indexes: { by_clipped_at: number };
  };
}

/** Seal raw AES key bytes for storage (e.g. to a device vault public key). */
export type SealKeyFn = (rawKey: ArrayBuffer) => Promise<string>;
/** Recover a CryptoKey from its sealed form; null if unavailable (e.g. vault locked). */
export type UnsealKeyFn = (sealedHex: string) => Promise<CryptoKey | null>;

export class ClipStore {
  private constructor(private readonly db: IDBPDatabase<ClipsDB>) {}

  static async open(): Promise<ClipStore> {
    const db = await openDB<ClipsDB>(CLIPS_DB_NAME, CLIPS_DB_VERSION, {
      upgrade(database) {
        const store = database.createObjectStore(CLIP_STORE, { keyPath: 'clip_id' });
        store.createIndex('by_clipped_at', 'clipped_at');
      },
    });
    return new ClipStore(db);
  }

  /**
   * Encrypt and store a new clip under a fresh per-clip AES key. `sealKey`
   * seals the raw key bytes for storage — the raw key itself is never
   * persisted. Returns the new clip's id.
   */
  async saveClip(input: NewClip, sealKey: SealKeyFn, now: number = Date.now()): Promise<string> {
    const key = await generateEncryptionKey();
    const rawKey = await exportKey(key);
    const plaintext = new TextEncoder().encode(
      JSON.stringify({
        title: input.title,
        plaintext_content: input.plaintext_content,
        source_url: input.source_url,
      }),
    );
    const { ciphertext, iv } = await encrypt(key, plaintext.buffer as ArrayBuffer);

    const clipId = crypto.randomUUID();
    await this.db.put(CLIP_STORE, {
      clip_id: clipId,
      clipped_at: now,
      tags: input.tags,
      sealedKeyHex: await sealKey(rawKey),
      ivHex: bytesToHex(iv),
      cipherHex: bytesToHex(new Uint8Array(ciphertext)),
    });
    return clipId;
  }

  /** Metadata-only listing, newest first. Decrypts nothing. */
  async listClips(): Promise<ClipListing[]> {
    const all = await this.db.getAllFromIndex(CLIP_STORE, 'by_clipped_at');
    return all
      .map((c) => ({ clip_id: c.clip_id, clipped_at: c.clipped_at, tags: c.tags }))
      .reverse();
  }

  /**
   * Decrypt one clip. `unsealKey` recovers the per-clip key from its sealed
   * form; returns null (without throwing) if that fails — the normal case
   * when the device vault is locked. Writes nothing: reads leave no trace.
   */
  async readClip(clipId: string, unsealKey: UnsealKeyFn): Promise<ClippedArticle | null> {
    const stored = await this.db.get(CLIP_STORE, clipId);
    if (!stored) return null;
    const key = await unsealKey(stored.sealedKeyHex);
    if (!key) return null;

    const plaintext = await decrypt(
      key,
      hexToBytes(stored.cipherHex).buffer as ArrayBuffer,
      hexToBytes(stored.ivHex),
    );
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as {
      title: string;
      plaintext_content: string;
      source_url?: string;
    };
    return {
      clip_id: stored.clip_id,
      clipped_at: stored.clipped_at,
      tags: stored.tags,
      title: parsed.title,
      plaintext_content: parsed.plaintext_content,
      source_url: parsed.source_url,
    };
  }

  async deleteClip(clipId: string): Promise<void> {
    await this.db.delete(CLIP_STORE, clipId);
  }

  /** Panic purge — clips are always fully deleted, never hidden (see file header). */
  async purgeAll(): Promise<void> {
    await this.db.clear(CLIP_STORE);
  }

  close(): void {
    this.db.close();
  }
}
