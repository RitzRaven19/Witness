/**
 * Upload queue processor for Plane A evidence blobs.
 *
 * Reads all evidence records with status 'queued' from IndexedDB,
 * fetches each encrypted blob from OPFS, and POSTs it to the vault endpoint.
 *
 * Set VITE_VAULT_ENDPOINT in .env to enable uploads.
 * If the variable is absent the queue is processed but uploads are skipped
 * (evidence stays 'queued' until a vault is configured).
 */

/// <reference types="vite/client" />
import { getDb } from './db';
import { updateStatus } from './evidenceStore';
import { appendEvent } from '@witness/crypto-core';

const VAULT_ENDPOINT: string = import.meta.env.VITE_VAULT_ENDPOINT ?? '';
const VAULT_KEY: string = import.meta.env.VITE_VAULT_KEY ?? '';

const MAX_RETRIES = 3;
// Exponential backoff base: 5 s, 10 s, 20 s
const RETRY_BASE_MS = 5_000;

// Guard against concurrent runs (e.g. online event fires while a run is active)
let _running = false;

/**
 * Process all queued evidence records.
 * Safe to call multiple times — concurrent calls are dropped.
 */
export async function processUploadQueue(): Promise<void> {
  if (_running) return;
  if (!VAULT_ENDPOINT) return; // no vault configured — stay queued

  _running = true;
  try {
    const db = await getDb();
    const queued = await db.getAllFromIndex('evidence', 'by_status', 'queued');
    // Upload in capture order (oldest first)
    for (const record of queued) {
      await _attemptUpload(record.id, 1);
    }
  } finally {
    _running = false;
  }
}

async function _attemptUpload(id: string, attempt: number): Promise<void> {
  const db = await getDb();
  const record = await db.get('evidence', id);
  if (!record) return;

  await updateStatus(id, 'uploading');

  try {
    // Read encrypted blob from OPFS
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('evidence');
    const fileHandle = await dir.getFileHandle(`${id}.enc`);
    const file = await fileHandle.getFile();
    const body = await file.arrayBuffer();

    const res = await fetch(`${VAULT_ENDPOINT}/functions/v1/evidence`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/octet-stream',
        'Authorization': `Bearer ${VAULT_KEY}`,
        'X-Blob-Id':     id,
        'X-Media-Hash':  record.hash,
        'X-Media-Type':  record.type,
        'X-Captured-At': String(record.capturedAt),
        'X-IV':          record.ivHex,
        // Key is NOT sent — vault stores ciphertext only; decryption key
        // stays with the authorised investigator. See architecture §9.
      },
      body,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Append upload event to custody log and mark uploaded
    const tx = db.transaction('evidence', 'readwrite');
    const rec = await tx.store.get(id);
    if (rec) {
      rec.custodyLog = await appendEvent(rec.custodyLog, 'uploaded', {
        vault: VAULT_ENDPOINT,
        respondedAt: String(Date.now()),
      });
      rec.status = 'uploaded';
      await tx.store.put(rec);
    }
    await tx.done;

  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await updateStatus(id, 'queued');
      await _sleep(RETRY_BASE_MS * attempt);
      await _attemptUpload(id, attempt + 1);
    } else {
      await updateStatus(id, 'failed');
    }
  }
}

function _sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Register a one-time Background Sync tag so the browser can wake the
 * service worker to trigger an upload even if the app tab is closed.
 * Falls back silently if the Background Sync API is not available.
 */
export async function registerBackgroundSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if ('sync' in reg) {
      await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } })
        .sync.register('witness-upload');
    }
  } catch {
    // Not supported or permission denied — in-app queue handles it
  }
}
