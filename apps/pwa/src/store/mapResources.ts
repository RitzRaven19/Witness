/**
 * Plane C resource loading for the tactical map.
 *
 * Bridges the map UI to the @witness/offline-map MapStore. Resources are read
 * from IndexedDB and are only ever those that passed hybrid-signature
 * verification against a trusted publisher.
 *
 * DEMO SEED: there is not yet a real NGO bundle ingestion channel (QR / BLE /
 * Wi-Fi Direct — see architecture.md §13.5). Until that lands, when the store is
 * empty we synthesise a locally-signed demo bundle around the map centre and run
 * it through the real sign → verify → store → read pipeline. This keeps the demo
 * populated while genuinely exercising the verification path. Replace
 * `syncDemoResources` with the ingestion channel once available.
 */

import {
  generateHybridKeyPair,
  hybridSign,
  exportHybridPublicKey,
} from '@witness/crypto-core';
import {
  MapStore,
  type ResourceBundle,
  type ResourceLocation,
  type ResourceStatus,
  type ResourceType,
  type TrustBundle,
} from '@witness/offline-map';

const HOUR = 60 * 60 * 1000;

/**
 * localStorage key holding the last verified { bundle, trust } JSON so the
 * device can re-share it to nearby devices via QR sequence. Wiped on purge.
 */
export const SHARE_BUNDLE_STORAGE = 'witness_share_bundle';

function saveShareable(bundle: ResourceBundle, trust: TrustBundle): void {
  try {
    localStorage.setItem(SHARE_BUNDLE_STORAGE, JSON.stringify({ bundle, trust }));
  } catch {
    /* storage full — sharing is best-effort */
  }
}

/** The last verified { bundle, trust } JSON for device-to-device QR sharing. */
export function getShareableBundleJson(): string | null {
  return localStorage.getItem(SHARE_BUNDLE_STORAGE);
}

export interface LatLon {
  lat: number;
  lon: number;
}

interface DemoSpec {
  type: ResourceType;
  status: ResourceStatus;
  label: string;
  latOffset: number;
  lonOffset: number;
  capacity: 'low' | 'medium' | 'high';
}

const DEMO_SPECS: DemoSpec[] = [
  { type: 'water_point',         status: 'open',    label: 'Water Point Alpha',         latOffset:  0.0032, lonOffset:  0.0045, capacity: 'high'   },
  { type: 'underground_shelter', status: 'open',    label: 'Underground Shelter North', latOffset: -0.0021, lonOffset:  0.0058, capacity: 'medium' },
  { type: 'granary',             status: 'limited', label: 'Food Store East',           latOffset:  0.0047, lonOffset: -0.0031, capacity: 'low'    },
  { type: 'clinic',              status: 'open',    label: 'Emergency Clinic',          latOffset: -0.0038, lonOffset: -0.0022, capacity: 'medium' },
  { type: 'surface_shelter',     status: 'open',    label: 'Surface Shelter West',      latOffset:  0.0011, lonOffset: -0.0065, capacity: 'high'   },
  { type: 'water_point',         status: 'unknown', label: 'Water Point Bravo',         latOffset: -0.0055, lonOffset:  0.0038, capacity: 'low'    },
  { type: 'granary',             status: 'open',    label: 'Food Store South',          latOffset:  0.0062, lonOffset:  0.0021, capacity: 'high'   },
  { type: 'underground_shelter', status: 'limited', label: 'Underground Shelter South', latOffset: -0.0028, lonOffset: -0.0049, capacity: 'low'    },
];

/** Canonical signed payload — must byte-match verifyBundle's canonicalBundlePayload. */
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

/** Build a freshly-signed demo bundle + a trust bundle that trusts its publisher. */
async function buildDemoBundle(
  center: LatLon,
): Promise<{ bundle: ResourceBundle; trust: TrustBundle }> {
  const kp = await generateHybridKeyPair();
  const pub = await exportHybridPublicKey(kp);
  const now = Date.now();

  const resources: ResourceLocation[] = DEMO_SPECS.map((s, i) => ({
    resource_id: `demo-${i}`,
    type: s.type,
    status: s.status,
    lat: center.lat + s.latOffset,
    lon: center.lon + s.lonOffset,
    label: s.label,
    capacity_hint: s.capacity,
    last_verified: now,
    expires_at: now + 12 * HOUR,
  }));

  const lats = resources.map((r) => r.lat);
  const lons = resources.map((r) => r.lon);
  const unsigned: Omit<ResourceBundle, 'signature'> = {
    bundle_id: crypto.randomUUID(),
    publisher_id: pub.key_id,
    valid_from: now - HOUR,
    valid_to: now + 12 * HOUR,
    bounding_box: {
      north: Math.max(...lats) + 0.01,
      east: Math.max(...lons) + 0.01,
      south: Math.min(...lats) - 0.01,
      west: Math.min(...lons) - 0.01,
    },
    resources,
  };

  const signature = await hybridSign(kp, canonicalPayload(unsigned));
  const trust: TrustBundle = {
    publishers: [
      {
        publisher_id: pub.key_id,
        display_name: 'Demo NGO (local dev seed)',
        ecdsa_public_key: pub.ecdsa_p256,
        ml_dsa_public_key: pub.ml_dsa_65,
        valid_from: now - HOUR,
        valid_to: now + 1000 * HOUR,
      },
    ],
    revoked_publisher_ids: [],
  };

  return { bundle: { ...unsigned, signature }, trust };
}

/**
 * Read the verified resources the map should render.
 *
 * If the store already holds valid bundles they are returned untouched. If it is
 * empty, a demo bundle centred on `center` is signed, verified, and stored first
 * (see the DEMO SEED note at the top of this file).
 */
export async function loadMapResources(
  center: LatLon,
): Promise<ResourceLocation[]> {
  const store = await MapStore.open();
  try {
    let resources = await store.getActiveResources();
    if (resources.length === 0) {
      const { bundle, trust } = await buildDemoBundle(center);
      await store.putBundle(bundle, trust);
      saveShareable(bundle, trust);
      resources = await store.getActiveResources();
    }
    return resources;
  } finally {
    store.close();
  }
}

/**
 * Demo-only: re-centre the demo resources on `center` (e.g. after a GPS lock so
 * markers appear near the user). Purges existing bundles first, then re-seeds.
 * A real ingestion channel would never move resources — remove alongside the
 * demo seed once bundle ingestion exists.
 */
export async function reseedDemoResources(
  center: LatLon,
): Promise<ResourceLocation[]> {
  const store = await MapStore.open();
  try {
    await store.purgeAll();
    const { bundle, trust } = await buildDemoBundle(center);
    await store.putBundle(bundle, trust);
    saveShareable(bundle, trust);
    return store.getActiveResources();
  } finally {
    store.close();
  }
}

/** All currently-active resources from verified bundles in the store. */
export async function getStoredResources(): Promise<ResourceLocation[]> {
  const store = await MapStore.open();
  try {
    return await store.getActiveResources();
  } finally {
    store.close();
  }
}

export interface ImportResult {
  ok: boolean;
  count: number;
  error?: string;
}

/**
 * Ingest a signed ResourceBundle scanned from a QR code (or pasted). The payload
 * is JSON of `{ bundle, trust }` — the NGO-signed bundle plus the publisher trust
 * bundle to verify it against. The bundle is verified (hybrid signature + expiry)
 * before it is stored; invalid bundles are rejected. On success returns the total
 * number of active resources now in the store.
 */
export async function importBundleJson(json: string): Promise<ImportResult> {
  let parsed: { bundle?: ResourceBundle; trust?: TrustBundle };
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, count: 0, error: 'Not valid bundle data' };
  }
  const bundle = parsed.bundle;
  const trust = parsed.trust;
  if (!bundle || !trust) {
    return { ok: false, count: 0, error: 'Missing bundle or trust info' };
  }

  const store = await MapStore.open();
  try {
    await store.putBundle(bundle, trust); // throws on verification failure
    saveShareable(bundle, trust);
    const resources = await store.getActiveResources();
    return { ok: true, count: resources.length };
  } catch {
    // Never surface verification details to the user (avoids leaking trust infra).
    return { ok: false, count: 0, error: 'Bundle rejected — signature or expiry invalid' };
  } finally {
    store.close();
  }
}
