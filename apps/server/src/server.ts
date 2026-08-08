/**
 * Witness ingestion server (architecture.md §7).
 *
 * Endpoints:
 *   /files/*            tus 1.0 resumable uploads of encrypted evidence blobs.
 *                       On completion the ciphertext SHA-256 is computed and a
 *                       manifest is written, indexed by the client-claimed
 *                       plaintext media hash for receipt correlation.
 *   POST /ingest        LoRa DTN HashReceipt payloads (156-byte binary, the
 *                       exact bytes the mesh carries). Decoded, stored, and
 *                       correlated against any uploaded blob with the same
 *                       media hash.
 *   GET /receipts/:hash Receipt + correlation status for a media hash.
 *   GET /health         Liveness + store counts.
 *
 * The server never sees plaintext or decryption keys: blobs arrive AES-256-GCM
 * encrypted, and only the tamper-evident receipt metadata is readable. The
 * plaintext media hash cannot be verified server-side (by design); what the
 * server proves is WHICH ciphertext arrived, WHEN, and that a signed receipt
 * for the same media hash exists.
 *
 * Storage is plain files under DATA_DIR — deliberately dependency-free so an
 * NGO can run this anywhere Node runs and inspect the store with `ls`.
 */

import http from 'node:http';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Server as TusServer, type Upload } from '@tus/server';
import { FileStore } from '@tus/file-store';
import {
  decodeHashReceiptPayload,
  HASH_RECEIPT_PAYLOAD_BYTES,
} from '@witness/lora-dtn';

const PORT = Number(process.env.PORT ?? 3001);
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data');
const UPLOAD_DIR = join(DATA_DIR, 'uploads');
const MANIFEST_DIR = join(DATA_DIR, 'manifests'); // one JSON per completed upload, named <mediaHash>.json
const RECEIPT_DIR = join(DATA_DIR, 'receipts'); // one JSON per mesh receipt, named <mediaHash>.json

/**
 * Optional shared bearer token gating the write paths (tus uploads + LoRa
 * receipt ingestion). Unset by default so local dev / the existing tests need
 * no configuration; an NGO deployment should set INGEST_TOKEN so this server
 * cannot be flooded with garbage evidence or used to plant fake receipts by
 * anyone who finds the URL. Read endpoints (/health, /receipts) stay open —
 * they leak nothing beyond hashes that are already public once redeemed.
 */
const AUTH_TOKEN = process.env.INGEST_TOKEN || null;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True if the request carries the correct bearer token, or auth is disabled. */
function isAuthorized(req: http.IncomingMessage): boolean {
  if (!AUTH_TOKEN) return true;
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && !!token && timingSafeEqual(token, AUTH_TOKEN);
}

interface UploadManifest {
  blobId: string;
  mediaHash: string; // client-claimed plaintext SHA-256 (hex)
  cipherSha256: string; // server-computed SHA-256 of the stored ciphertext
  sizeBytes: number;
  mediaType?: string;
  capturedAt?: string;
  ivHex?: string;
  uploadedAt: number;
}

interface StoredReceipt {
  mediaHash: string;
  blobIdPrefix: string;
  captureTime: number;
  ecdsaSigHex: string;
  mlDsaSigPrefixHex: string;
  keyIdPrefix: string;
  receivedAt: number;
}

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', resolve)
      .on('error', reject);
  });
  return hash.digest('hex');
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

function isHexHash(s: string): boolean {
  return /^[0-9a-f]{64}$/i.test(s);
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function setCors(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, HEAD, OPTIONS, DELETE');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Tus-Resumable, Upload-Length, Upload-Metadata, Upload-Offset, X-HTTP-Method-Override, x-upsert',
  );
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Location, Tus-Resumable, Upload-Length, Upload-Metadata, Upload-Offset',
  );
}

async function readBody(req: http.IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error('payload too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Persist a manifest for a completed upload, keyed by claimed media hash. */
async function onUploadFinish(upload: Upload): Promise<void> {
  const meta = upload.metadata ?? {};
  const mediaHash = (meta.mediaHash ?? '').toLowerCase();
  if (!isHexHash(mediaHash)) return; // no correlatable hash — blob is still stored

  const filePath = join(UPLOAD_DIR, upload.id);
  const manifest: UploadManifest = {
    blobId: meta.blobId ?? upload.id,
    mediaHash,
    cipherSha256: await sha256File(filePath),
    sizeBytes: upload.size ?? 0,
    mediaType: meta.mediaType ?? undefined,
    capturedAt: meta.capturedAt ?? undefined,
    ivHex: meta.ivHex ?? undefined,
    uploadedAt: Date.now(),
  };
  await writeFile(join(MANIFEST_DIR, `${mediaHash}.json`), JSON.stringify(manifest, null, 2));
}

async function handleIngest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body: Buffer;
  try {
    body = await readBody(req, 4096);
  } catch {
    return json(res, 413, { ok: false, error: 'payload too large' });
  }
  if (body.length !== HASH_RECEIPT_PAYLOAD_BYTES) {
    return json(res, 400, {
      ok: false,
      error: `expected ${HASH_RECEIPT_PAYLOAD_BYTES}-byte HashReceipt payload, got ${body.length}`,
    });
  }

  let decoded;
  try {
    decoded = decodeHashReceiptPayload(new Uint8Array(body));
  } catch {
    return json(res, 400, { ok: false, error: 'malformed HashReceipt payload' });
  }

  const receipt: StoredReceipt = {
    mediaHash: decoded.mediaHash,
    blobIdPrefix: decoded.blobIdPrefix,
    captureTime: decoded.captureTime,
    ecdsaSigHex: toHex(decoded.ecdsaSig),
    mlDsaSigPrefixHex: toHex(decoded.mlDsaSigPrefix),
    keyIdPrefix: decoded.keyIdPrefix,
    receivedAt: Date.now(),
  };
  await writeFile(join(RECEIPT_DIR, `${decoded.mediaHash}.json`), JSON.stringify(receipt, null, 2));

  const manifest = await readJson<UploadManifest>(join(MANIFEST_DIR, `${decoded.mediaHash}.json`));
  json(res, 200, { ok: true, mediaHash: decoded.mediaHash, correlated: manifest !== null });
}

async function handleReceiptLookup(hash: string, res: http.ServerResponse): Promise<void> {
  if (!isHexHash(hash)) return json(res, 400, { ok: false, error: 'invalid media hash' });
  const mediaHash = hash.toLowerCase();
  const [receipt, manifest] = await Promise.all([
    readJson<StoredReceipt>(join(RECEIPT_DIR, `${mediaHash}.json`)),
    readJson<UploadManifest>(join(MANIFEST_DIR, `${mediaHash}.json`)),
  ]);
  if (!receipt && !manifest) return json(res, 404, { ok: false, error: 'unknown media hash' });
  json(res, 200, {
    ok: true,
    mediaHash,
    receipt,
    upload: manifest,
    correlated: receipt !== null && manifest !== null,
  });
}

async function handleHealth(res: http.ServerResponse): Promise<void> {
  const [uploads, receipts] = await Promise.all([
    readdir(MANIFEST_DIR).then((f) => f.length).catch(() => 0),
    readdir(RECEIPT_DIR).then((f) => f.length).catch(() => 0),
  ]);
  json(res, 200, { ok: true, uploads, receipts });
}

export async function createServer(): Promise<http.Server> {
  await Promise.all([
    mkdir(UPLOAD_DIR, { recursive: true }),
    mkdir(MANIFEST_DIR, { recursive: true }),
    mkdir(RECEIPT_DIR, { recursive: true }),
  ]);

  const tus = new TusServer({
    path: '/files',
    datastore: new FileStore({ directory: UPLOAD_DIR }),
    respectForwardedHeaders: true,
    async onUploadFinish(_req, res, upload) {
      await onUploadFinish(upload).catch((err) => {
        console.error('manifest write failed:', err);
      });
      return res;
    },
  });

  return http.createServer((req, res) => {
    setCors(res);
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname === '/files' || url.pathname.startsWith('/files/')) {
      if (!isAuthorized(req)) return json(res, 401, { ok: false, error: 'unauthorized' });
      void tus.handle(req, res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/ingest') {
      if (!isAuthorized(req)) return json(res, 401, { ok: false, error: 'unauthorized' });
      void handleIngest(req, res).catch(() => json(res, 500, { ok: false }));
      return;
    }
    const receiptMatch = /^\/receipts\/([0-9a-fA-F]+)$/.exec(url.pathname);
    if (req.method === 'GET' && receiptMatch) {
      void handleReceiptLookup(receiptMatch[1], res).catch(() => json(res, 500, { ok: false }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      void handleHealth(res).catch(() => json(res, 500, { ok: false }));
      return;
    }
    json(res, 404, { ok: false, error: 'not found' });
  });
}

// Start when run directly (not when imported by tests).
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const server = await createServer();
  server.listen(PORT, () => {
    console.log(`witness ingestion server listening on :${PORT} (data: ${DATA_DIR})`);
  });
}
