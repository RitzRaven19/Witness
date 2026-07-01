/**
 * LoRa DTN mesh runtime for the PWA.
 *
 * A small singleton that owns the persistent DTNQueue and the (optional)
 * companion-device transport, drives the epidemic receive/relay loop, turns
 * captured evidence into signed HashReceipts, and — when this node has
 * connectivity — forwards receipts to the ingestion endpoint.
 *
 * React subscribes via useLoraMesh; capture calls enqueueEvidenceReceipt.
 *
 * Mesh key: the HMAC pre-shared key is shared across nodes. Out of the box every
 * install uses DEFAULT_MESH_KEY_HEX (like a default Meshtastic channel) so nodes
 * can relay immediately; an operation provisions its own NGO key via setMeshKey.
 */

import {
  DTNQueue,
  PayloadType,
  decodePacket,
  enqueueHashReceipt,
  rebroadcastDelayMs,
  SerialTransport,
  BleTransport,
  type HashReceipt,
  type LoRaTransport,
} from '@witness/lora-dtn';
import { sign, mldsaSign, keyFingerprint, hexToBytes, bytesToHex } from '@witness/crypto-core';
import { getDeviceKey } from './deviceKey';
import type { EvidenceRecord } from './db';

const MESH_KEY_STORAGE = 'witness_mesh_key';
const INGEST_URL_STORAGE = 'witness_ingest_url';

/**
 * Published default mesh key so freshly-installed nodes can relay to one another.
 * NOT secret — replace with an NGO-provisioned key (setMeshKey) for an operation
 * that needs its mesh isolated from the public default.
 */
export const DEFAULT_MESH_KEY_HEX =
  '5749544e4553530000006d6573680000006b6579000000006465666175000001';

const HEX64 = /^[0-9a-fA-F]{64}$/;

function loadMeshKeyHex(): string {
  let hex = localStorage.getItem(MESH_KEY_STORAGE);
  if (!hex || !HEX64.test(hex)) {
    hex = DEFAULT_MESH_KEY_HEX;
    localStorage.setItem(MESH_KEY_STORAGE, hex);
  }
  return hex.toLowerCase();
}

export type LoraConnState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type TransportKind = 'serial' | 'ble';

export interface LoraStatus {
  conn: LoraConnState;
  kind: TransportKind | null;
  deviceLabel: string | null;
  /** Frames still awaiting broadcast (locally-originated + buffered relays). */
  pending: number;
  /** Count of frames this node relayed onward this session. */
  relayed: number;
  /** Count of receipts this node forwarded to the ingestion endpoint this session. */
  delivered: number;
  /** Short fingerprint (first 8 hex) of the active mesh key, for the UI. */
  meshKeyFp: string;
  /** Whether an ingestion endpoint URL is configured. */
  ingestConfigured: boolean;
  lastError: string | null;
}

type Listener = (s: LoraStatus) => void;

class LoraStore {
  private queue: DTNQueue | null = null;
  private transport: LoRaTransport | null = null;
  private unsubscribeFrames: (() => void) | null = null;
  private meshKeyHex = loadMeshKeyHex();
  private meshKey = hexToBytes(this.meshKeyHex);
  private ingestUrl = localStorage.getItem(INGEST_URL_STORAGE);
  private readonly listeners = new Set<Listener>();

  private status: LoraStatus = {
    conn: 'disconnected',
    kind: null,
    deviceLabel: null,
    pending: 0,
    relayed: 0,
    delivered: 0,
    meshKeyFp: this.meshKeyHex.slice(0, 8),
    ingestConfigured: false,
    lastError: null,
  };

  constructor() {
    this.status.ingestConfigured = !!this.ingestUrl;
    // Deliver queued receipts whenever connectivity returns.
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.flushDeliveries());
    }
  }

  getStatus(): LoraStatus {
    return this.status;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    void this.refreshPending();
    return () => this.listeners.delete(listener);
  }

  private emit(patch: Partial<LoraStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const l of this.listeners) l(this.status);
  }

  // ── Mesh key provisioning ────────────────────────────────────────────────
  getMeshKeyHex(): string {
    return this.meshKeyHex;
  }

  /** Provision a shared 64-hex mesh key (e.g. NGO-issued). Throws if malformed. */
  setMeshKey(hex: string): void {
    const clean = hex.trim().toLowerCase();
    if (!HEX64.test(clean)) throw new Error('Mesh key must be 64 hex characters');
    this.meshKeyHex = clean;
    this.meshKey = hexToBytes(clean);
    localStorage.setItem(MESH_KEY_STORAGE, clean);
    this.emit({ meshKeyFp: clean.slice(0, 8) });
  }

  // ── Ingestion endpoint ───────────────────────────────────────────────────
  getIngestUrl(): string | null {
    return this.ingestUrl;
  }

  setIngestUrl(url: string | null): void {
    const clean = url?.trim() || null;
    this.ingestUrl = clean;
    if (clean) localStorage.setItem(INGEST_URL_STORAGE, clean);
    else localStorage.removeItem(INGEST_URL_STORAGE);
    this.emit({ ingestConfigured: !!clean });
    void this.flushDeliveries();
  }

  /** POST a receipt payload to the ingestion endpoint. Returns true on 2xx. */
  private async deliverPayload(payload: Uint8Array): Promise<boolean> {
    if (!this.ingestUrl || !navigator.onLine) return false;
    try {
      const res = await fetch(this.ingestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: payload as unknown as BodyInit,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Forward every queued HashReceipt to the ingestion endpoint (if online and
   * configured), marking each delivered on success so it stops rebroadcasting.
   */
  async flushDeliveries(): Promise<void> {
    if (!this.ingestUrl || !navigator.onLine) return;
    const q = await this.getQueue();
    for (const frame of await q.pending()) {
      const d = decodePacket(frame);
      if (d.payloadType !== PayloadType.HashReceipt) continue;
      if (await this.deliverPayload(d.payload)) {
        await q.markDelivered(bytesToHex(d.packetId));
        this.emit({ delivered: this.status.delivered + 1 });
      }
    }
    await this.refreshPending();
  }

  private async getQueue(): Promise<DTNQueue> {
    if (!this.queue) this.queue = await DTNQueue.open();
    return this.queue;
  }

  private async refreshPending(): Promise<void> {
    const q = await this.getQueue();
    this.emit({ pending: (await q.pending()).length });
  }

  /** Connect a companion device over USB-C (Web Serial) or BLE (Web Bluetooth). */
  async connect(kind: TransportKind): Promise<void> {
    if (this.status.conn === 'connected' || this.status.conn === 'connecting') return;
    this.emit({ conn: 'connecting', kind, lastError: null });

    const transport: LoRaTransport =
      kind === 'serial' ? new SerialTransport() : new BleTransport();
    try {
      await transport.connect();
    } catch (err) {
      const e = err as Error;
      if (e.name === 'NotFoundError') {
        this.emit({ conn: 'disconnected', kind: null });
      } else {
        this.emit({ conn: 'error', kind: null, lastError: e.message });
      }
      return;
    }

    this.transport = transport;
    this.unsubscribeFrames = transport.onFrame((frame) => void this.onFrame(frame));
    this.emit({
      conn: 'connected',
      kind,
      deviceLabel: kind === 'serial' ? 'USB-C LoRa board' : 'BLE LoRa board',
    });

    await this.flushPending();
    await this.flushDeliveries();
    await this.refreshPending();
  }

  async disconnect(): Promise<void> {
    this.unsubscribeFrames?.();
    this.unsubscribeFrames = null;
    await this.transport?.disconnect().catch(() => {});
    this.transport = null;
    this.emit({ conn: 'disconnected', kind: null, deviceLabel: null });
  }

  /** Broadcast every queued (not-yet-delivered) frame to the connected device. */
  private async flushPending(): Promise<void> {
    if (!this.transport) return;
    const q = await this.getQueue();
    for (const frame of await q.pending()) {
      try {
        await this.transport.send(frame);
      } catch {
        /* keep going; frame stays queued */
      }
    }
  }

  /** Epidemic receive handler: verify/dedup/buffer, then relay and/or deliver. */
  private async onFrame(frame: Uint8Array): Promise<void> {
    const q = await this.getQueue();
    const res = await q.processIncoming(frame, this.meshKey, {
      hasConnectivity: navigator.onLine && !!this.ingestUrl,
    });
    if (res.action !== 'accept') return;

    this.emit({ relayed: this.status.relayed + 1 });
    await this.refreshPending();

    if (res.relayFrame && this.transport) {
      const toSend = res.relayFrame;
      setTimeout(() => void this.transport?.send(toSend).catch(() => {}), rebroadcastDelayMs());
    }

    if (res.deliver && (await this.deliverPayload(res.payload))) {
      await q.markDelivered(res.packetIdHex);
      this.emit({ delivered: this.status.delivered + 1 });
      await this.refreshPending();
    }
  }

  /**
   * Sign a captured evidence record's media hash and queue the resulting
   * HashReceipt for the mesh. Broadcasts immediately if a device is connected;
   * forwards upstream immediately if this node is online. Best-effort — never
   * throws into the capture path.
   */
  async enqueueEvidenceReceipt(ev: EvidenceRecord): Promise<void> {
    const q = await this.getQueue();
    const key = await getDeviceKey();
    const hashBytes = hexToBytes(ev.hash);

    const [ecdsaSig, keyId] = await Promise.all([
      sign(key.classical.privateKey, hashBytes.buffer as ArrayBuffer),
      keyFingerprint(key.classical.publicKey),
    ]);
    const mlDsaSig = mldsaSign(key.pqc.secretKey, hashBytes);

    const receipt: HashReceipt = {
      mediaHash: ev.hash,
      blobId: ev.id,
      captureTime: ev.capturedAt,
      ecdsaSig: new Uint8Array(ecdsaSig),
      mlDsaSig,
      keyId,
    };

    await enqueueHashReceipt(receipt, this.meshKey, q, this.transport ?? undefined);
    await this.refreshPending();
    void this.flushDeliveries();
  }
}

export const loraStore = new LoraStore();
