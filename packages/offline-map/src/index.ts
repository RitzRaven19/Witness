/**
 * @witness/offline-map — Plane C offline resource map.
 *
 * Public surface:
 *  - PMTiles/OPFS tile loading and MapLibre protocol registration.
 *  - ResourceBundle hybrid-signature verification and freshness filtering.
 *  - IndexedDB persistence (MapStore) with automatic expiry eviction.
 *
 * See architecture.md §13 for the full design.
 */

// Tile loading + MapLibre integration (OPFS/PMTiles)
export {
  OPFS_MAP_DIR,
  registerPMTilesProtocol,
  getOPFSTileFile,
  writeOPFSTileFile,
  purgeOPFSTiles,
  buildOfflineMapStyle,
  type OPFSTileFile,
} from './pmtiles.js';

// Resource bundle verification + types
export {
  verifyBundle,
  activeResources,
  BundleVerificationError,
  type ResourceType,
  type ResourceStatus,
  type ResourceLocation,
  type HybridSignature,
  type ResourceBundle,
  type PublisherEntry,
  type TrustBundle,
} from './resource-bundle.js';

// IndexedDB persistence
export {
  MapStore,
  MAP_DB_NAME,
  MAP_DB_VERSION,
} from './map-store.js';
