/**
 * IndexedDB persistence layer for verified ResourceBundle objects (Plane C).
 *
 * Responsibilities:
 *  - Persist ResourceBundles that have passed hybrid signature verification.
 *  - Automatically evict bundles whose validity window has ended, both on open
 *    and on demand (staleness-aware; see architecture.md §13.2, §13.5).
 *  - Provide the flattened, freshness-filtered resource points the map overlay
 *    renders, without exposing expired or stale data.
 *  - Support panic purge — a full wipe of all stored bundles.
 *
 * The database is intentionally separate from the evidence DB so the map plane
 * can be reasoned about (and purged) independently. Both are covered by the
 * app-level panic purge routine.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  activeResources,
  verifyBundle,
  type ResourceBundle,
  type ResourceLocation,
  type TrustBundle,
} from './resource-bundle.js';

export const MAP_DB_NAME = 'witness-map';
export const MAP_DB_VERSION = 1;
const BUNDLE_STORE = 'resource_bundles';

interface MapDB extends DBSchema {
  resource_bundles: {
    key: string; // bundle_id
    value: ResourceBundle;
    indexes: {
      by_valid_to: number;
      by_publisher: string;
    };
  };
}

/**
 * Persistent store for signed resource bundles. Open with {@link MapStore.open},
 * which also performs an initial expiry sweep.
 */
export class MapStore {
  private constructor(private readonly db: IDBPDatabase<MapDB>) {}

  /**
   * Open (creating if needed) the map database and evict any already-expired
   * bundles. Pass `now` in tests to control the eviction clock.
   */
  static async open(now: number = Date.now()): Promise<MapStore> {
    const db = await openDB<MapDB>(MAP_DB_NAME, MAP_DB_VERSION, {
      upgrade(database) {
        const store = database.createObjectStore(BUNDLE_STORE, {
          keyPath: 'bundle_id',
        });
        store.createIndex('by_valid_to', 'valid_to');
        store.createIndex('by_publisher', 'publisher_id');
      },
    });
    const store = new MapStore(db);
    await store.evictExpired(now);
    return store;
  }

  /**
   * Verify a bundle against the trust bundle, and persist it only if valid.
   * Throws BundleVerificationError on any verification failure — callers should
   * catch and silently reject (never surface verification errors to the user).
   */
  async putBundle(
    bundle: ResourceBundle,
    trust: TrustBundle,
    now: number = Date.now(),
  ): Promise<void> {
    await verifyBundle(bundle, trust, now);
    await this.db.put(BUNDLE_STORE, bundle);
  }

  /** Fetch a single bundle by id, or undefined if absent. */
  async getBundle(bundleId: string): Promise<ResourceBundle | undefined> {
    return this.db.get(BUNDLE_STORE, bundleId);
  }

  /** All stored bundles currently within their [valid_from, valid_to] window. */
  async getActiveBundles(now: number = Date.now()): Promise<ResourceBundle[]> {
    const all = await this.db.getAll(BUNDLE_STORE);
    return all.filter((b) => now >= b.valid_from && now <= b.valid_to);
  }

  /**
   * Flattened, freshness-filtered resource points across all active bundles —
   * the exact set the map overlay should render. Expired and stale-closed
   * resources are removed via {@link activeResources}.
   */
  async getActiveResources(
    now: number = Date.now(),
  ): Promise<ResourceLocation[]> {
    const bundles = await this.getActiveBundles(now);
    return bundles.flatMap((b) => activeResources(b, now));
  }

  /**
   * Remove every bundle whose validity window has ended (valid_to < now).
   * Returns the number of bundles evicted. Called automatically on open.
   */
  async evictExpired(now: number = Date.now()): Promise<number> {
    const tx = this.db.transaction(BUNDLE_STORE, 'readwrite');
    const index = tx.store.index('by_valid_to');
    let removed = 0;
    // Upper bound `now` exclusive → strictly-expired bundles only.
    let cursor = await index.openCursor(IDBKeyRange.upperBound(now, true));
    while (cursor) {
      await cursor.delete();
      removed += 1;
      cursor = await cursor.continue();
    }
    await tx.done;
    return removed;
  }

  /** Delete a specific bundle by id. No-op if it does not exist. */
  async deleteBundle(bundleId: string): Promise<void> {
    await this.db.delete(BUNDLE_STORE, bundleId);
  }

  /**
   * Panic purge — wipe all stored resource bundles. Map data is treated as
   * equally sensitive to evidence (architecture.md §13.7).
   */
  async purgeAll(): Promise<void> {
    await this.db.clear(BUNDLE_STORE);
  }

  /** Close the underlying connection. Call before deleting the database. */
  close(): void {
    this.db.close();
  }
}
