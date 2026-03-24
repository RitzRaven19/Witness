import { getDb, type EvidenceRecord, type EvidenceStatus } from './db';

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
  // 1. Wipe IndexedDB
  const db = await getDb();
  await db.clear('evidence');

  // 2. Wipe OPFS encrypted blobs
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('evidence', { recursive: true });
  } catch {
    // Directory may not exist yet — that's fine
  }
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
