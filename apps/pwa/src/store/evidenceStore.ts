import { getDb, closeDb, type EvidenceRecord, type EvidenceStatus } from './db';
import { resetDeviceKeyCache } from './deviceKey';

export async function addEvidence(record: EvidenceRecord): Promise<void> {
  const db = await getDb();
  await db.put('evidence', record);
}

export async function getAllEvidence(): Promise<EvidenceRecord[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('evidence', 'by_captured_at');
  return all.reverse(); // newest first
}

export async function updateStatus(id: string, status: EvidenceStatus): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('evidence', 'readwrite');
  const record = await tx.store.get(id);
  if (record) {
    record.status = status;
    await tx.store.put(record);
  }
  await tx.done;
}

export async function getQueueCount(): Promise<number> {
  const db = await getDb();
  return db.countFromIndex('evidence', 'by_status', 'queued');
}

export async function purgeAll(): Promise<void> {
  // 1. Close and delete the IndexedDB databases (evidence + offline-map resource bundles)
  await getDb(); // ensure it was opened at least once before closing
  closeDb();
  const deleteDb = (name: string) =>
    new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();   // best-effort — continue even if blocked
      req.onblocked = () => resolve(); // another tab has it open; will delete on close
    });
  await deleteDb('witness');          // keys, evidence
  await deleteDb('witness-map');      // Plane C resource bundles
  await deleteDb('witness-lora-dtn'); // LoRa DTN queue + dedup history
  await deleteDb('witness-keys');     // device signing key
  resetDeviceKeyCache();              // drop in-memory device key after wipe

  // 2. Wipe OPFS (encrypted blobs + any future offline-map tile cache)
  try {
    const root = await navigator.storage.getDirectory();
    // Remove all known Witness directories
    for (const dir of ['evidence', 'map-tiles']) {
      try { await root.removeEntry(dir, { recursive: true }); } catch { /* ok */ }
    }
  } catch { /* OPFS unavailable */ }

  // 3. Delete all service-worker caches (precache + runtime)
  if ('caches' in self) {
    const names = await caches.keys();
    await Promise.all(names.map(n => caches.delete(n)));
  }

  // 4. Clear sessionStorage
  try { sessionStorage.clear(); } catch { /* ok */ }

  // 5. Remove sensitive localStorage keys. witness_pin and witness_decoy are
  // deliberately kept — the decoy calculator needs them to unlock afterwards.
  try {
    for (const key of ['witness_share_bundle', 'witness_mesh_key', 'witness_ingest_url', 'witness_mesh_peers', 'witness_callsign']) {
      localStorage.removeItem(key);
    }
  } catch { /* ok */ }
}

// Store an encrypted blob in OPFS at evidence/{id}.enc
export async function storeBlob(id: string, data: ArrayBuffer): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('evidence', { create: true });
  const file = await dir.getFileHandle(`${id}.enc`, { create: true });
  const writable = await file.createWritable();
  await writable.write(data);
  await writable.close();
}
