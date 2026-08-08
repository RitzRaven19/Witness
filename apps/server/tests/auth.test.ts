import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type http from 'node:http';
import { encodeHashReceiptPayload, type HashReceipt } from '@witness/lora-dtn';

// AUTH_TOKEN is read once at module load, so it must be set before import —
// a separate file/module instance from server.test.ts (which runs with no
// token configured, exercising the auth-disabled default).
const dataDir = await mkdtemp(join(tmpdir(), 'witness-server-auth-'));
process.env.DATA_DIR = dataDir;
process.env.INGEST_TOKEN = 'test-secret-token';
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
  delete process.env.INGEST_TOKEN;
});

function receipt(): HashReceipt {
  return {
    mediaHash: 'cd'.repeat(32),
    blobId: '123e4567-e89b-12d3-a456-426614174000',
    captureTime: Date.now(),
    ecdsaSig: new Uint8Array(64).fill(0x11),
    mlDsaSig: new Uint8Array(3309).fill(0x22),
    keyId: 'ef'.repeat(32),
  };
}

describe('bearer token auth (INGEST_TOKEN set)', () => {
  it('rejects /ingest with no Authorization header', async () => {
    const res = await fetch(`${base}/ingest`, {
      method: 'POST',
      body: encodeHashReceiptPayload(receipt()),
    });
    expect(res.status).toBe(401);
  });

  it('rejects /ingest with the wrong token', async () => {
    const res = await fetch(`${base}/ingest`, {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-token' },
      body: encodeHashReceiptPayload(receipt()),
    });
    expect(res.status).toBe(401);
  });

  it('accepts /ingest with the correct token', async () => {
    const res = await fetch(`${base}/ingest`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret-token' },
      body: encodeHashReceiptPayload(receipt()),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('rejects tus upload creation with no token', async () => {
    const res = await fetch(`${base}/files`, {
      method: 'POST',
      headers: { 'Tus-Resumable': '1.0.0', 'Upload-Length': '10' },
    });
    expect(res.status).toBe(401);
  });

  it('accepts tus upload creation with the correct token', async () => {
    const res = await fetch(`${base}/files`, {
      method: 'POST',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Length': '10',
        Authorization: 'Bearer test-secret-token',
      },
    });
    expect(res.status).toBe(201);
  });

  it('does not gate read endpoints (/health, /receipts)', async () => {
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect((await fetch(`${base}/receipts/${'00'.repeat(32)}`)).status).toBe(404); // not 401
  });

  it('CORS preflight (OPTIONS) succeeds without a token', async () => {
    // Browsers never attach Authorization to a preflight; if OPTIONS were
    // gated, real cross-origin requests could never get past the preflight.
    const res = await fetch(`${base}/files`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
  });
});
