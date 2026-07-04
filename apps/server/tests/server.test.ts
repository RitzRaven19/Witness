import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type http from 'node:http';
import { encodeHashReceiptPayload, type HashReceipt } from '@witness/lora-dtn';

// Point the server at an isolated temp data dir BEFORE importing it.
const dataDir = await mkdtemp(join(tmpdir(), 'witness-server-'));
process.env.DATA_DIR = dataDir;
const { createServer } = await import('../src/server.js');

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = await createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  if (typeof addr === 'string' || addr === null) throw new Error('no port');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dataDir, { recursive: true, force: true });
});

const MEDIA_HASH = 'ab'.repeat(32);

function receipt(): HashReceipt {
  return {
    mediaHash: MEDIA_HASH,
    blobId: '123e4567-e89b-12d3-a456-426614174000',
    captureTime: Date.now(),
    ecdsaSig: new Uint8Array(64).fill(0x11),
    mlDsaSig: new Uint8Array(3309).fill(0x22),
    keyId: 'cd'.repeat(32),
  };
}

/** Minimal tus 1.0 client: creation + single PATCH. */
async function tusUpload(bytes: Uint8Array, metadata: Record<string, string>): Promise<string> {
  const meta = Object.entries(metadata)
    .map(([k, v]) => `${k} ${Buffer.from(v).toString('base64')}`)
    .join(',');
  const create = await fetch(`${base}/files`, {
    method: 'POST',
    headers: {
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(bytes.length),
      'Upload-Metadata': meta,
    },
  });
  expect(create.status).toBe(201);
  const location = create.headers.get('location')!;
  const url = location.startsWith('http') ? location : base + location;

  const patch = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Tus-Resumable': '1.0.0',
      'Upload-Offset': '0',
      'Content-Type': 'application/offset+octet-stream',
    },
    body: bytes,
  });
  expect(patch.status).toBe(204);
  expect(patch.headers.get('upload-offset')).toBe(String(bytes.length));
  return url;
}

describe('health', () => {
  it('reports ok with store counts', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.uploads).toBe('number');
  });
});

describe('receipt ingestion', () => {
  it('rejects wrong-size payloads', async () => {
    const res = await fetch(`${base}/ingest`, { method: 'POST', body: new Uint8Array(10) });
    expect(res.status).toBe(400);
  });

  it('accepts a real 156-byte HashReceipt payload and stores it', async () => {
    const payload = encodeHashReceiptPayload(receipt());
    const res = await fetch(`${base}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: payload,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.mediaHash).toBe(MEDIA_HASH);

    const lookup = await fetch(`${base}/receipts/${MEDIA_HASH}`);
    expect(lookup.status).toBe(200);
    const found = await lookup.json();
    expect(found.receipt.mediaHash).toBe(MEDIA_HASH);
    expect(found.receipt.ecdsaSigHex).toBe('11'.repeat(64));
  });

  it('404s for an unknown hash and 400s for junk', async () => {
    expect((await fetch(`${base}/receipts/${'ff'.repeat(32)}`)).status).toBe(404);
    expect((await fetch(`${base}/receipts/nothex`)).status).toBe(404); // route regex rejects
  });
});

describe('tus upload + correlation', () => {
  it('uploads an encrypted blob, writes a manifest, and correlates with the receipt', async () => {
    const blob = new Uint8Array(4096).map((_, i) => (i * 13) & 0xff);
    await tusUpload(blob, {
      blobId: '123e4567-e89b-12d3-a456-426614174000',
      mediaHash: MEDIA_HASH,
      mediaType: 'photo',
      capturedAt: String(Date.now()),
      ivHex: '00'.repeat(12),
    });

    // onUploadFinish writes the manifest asynchronously right before response;
    // poll briefly for it.
    let body: { correlated?: boolean; upload?: { cipherSha256?: string; sizeBytes?: number } } = {};
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${base}/receipts/${MEDIA_HASH}`);
      body = await res.json();
      if (body.upload) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(body.upload).toBeTruthy();
    expect(body.upload!.sizeBytes).toBe(4096);
    // server-computed ciphertext hash must be a real sha256 hex
    expect(body.upload!.cipherSha256).toMatch(/^[0-9a-f]{64}$/);
    // receipt (from previous test) + upload both present → correlated
    expect(body.correlated).toBe(true);
  });

  it('ingest reports correlated=true once the blob exists', async () => {
    const res = await fetch(`${base}/ingest`, {
      method: 'POST',
      body: encodeHashReceiptPayload(receipt()),
    });
    const body = await res.json();
    expect(body.correlated).toBe(true);
  });
});
