/**
 * LoRa DTN mesh runtime for the PWA.
 *
 * A small singleton that owns the persistent DTNQueue and the (optional)
 * companion-device transport, drives the epidemic receive/relay loop, and
 * turns captured evidence into signed HashReceipts queued for broadcast.
 *
 * React subscribes via useLoraMesh; capture calls enqueueEvidenceReceipt.
 *
 * Mesh key note: the HMAC pre-shared key is generated per-device and stored in
 * localStorage for this build. In a real deployment every node in a mesh must
 * share the same key (provisioned by the NGO), otherwise relays reject each
 * other's frames.
 */

import {
  DTNQueue,
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

function loadMeshKey(): Uint8Array {
  let hex = localStorage.getItem(MESH_KEY_STORAGE);
  if (!hex || hex.length !== 64) {
    const k = new Uint8Array(32);
    crypto.getRandomValues(k);
    hex = bytesToHex(k);
    localStorage.setItem(MESH_KEY_STORAGE, hex);
  }
  return hexToBytes(hex);
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
  /** Count of frames this node forwarded upstream (had connectivity) this session. */
  delivered: number;
  lastError: string | null;
}

type Listener = (s: LoraStatus) => void;

class LoraStore {
  private queue: DTNQueue | null = null;
  private transport: LoRaTransport | null = null;
  private unsubscribeFrames: (() => void) | null = null;
  private readonly meshKey = loadMeshKey();
  private readonly listeners = new Set<Listener>();

  private status: LoraStatus = {
    conn: 'disconnected',
    kind: null,
    deviceLabel: null,
    pending: 0,
    relayed: 0,
    delivered: 0,
    lastError: null,
  };

  getStatus(): LoraStatus {
    return this.status;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    // Surface the persisted queue depth even before a device connects.
    void this.refreshPending();
    return () => this.listeners.delete(listener);
  }

  private emit(patch: Partial<LoraStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const l of this.listeners) l(this.status);
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
      // User dismissing the chooser is not an error — return to idle.
      if (e.name === 'NotFoundError') {
        this.emit({ conn: 'disconnected', kind: null });
      } else {
        this.emit({ conn: 'error', kind: null, lastError: e.message });
      }
      return;
    }

    this.transport = transport;
    this.unsubscribeFrames = transport.onFrame((frame) => {
      void this.onFrame(frame);
    });
    this.emit({
      conn: 'connected',
      kind,
      deviceLabel: kind === 'serial' ? 'USB-C LoRa board' : 'BLE LoRa board',
    });

    await this.flushPending();
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
      hasConnectivity: navigator.onLine,
    });
    if (res.action !== 'accept') return;

    this.emit({ relayed: this.status.relayed + 1 });
    await this.refreshPending();

    if (res.relayFrame && this.transport) {
      const toSend = res.relayFrame;
      setTimeout(() => {
        this.transport?.send(toSend).catch(() => {});
      }, rebroadcastDelayMs());
    }

    if (res.deliver) {
      // This node has connectivity — the payload would be POSTed to the
      // ingestion endpoint here. Marking delivered stops rebroadcasting.
      await q.markDelivered(res.packetIdHex);
      this.emit({ delivered: this.status.delivered + 1 });
      await this.refreshPending();
    }
  }

  /**
   * Sign a captured evidence record's media hash and queue the resulting
   * HashReceipt for the mesh. Broadcasts immediately if a device is connected;
   * otherwise it stays queued until one connects. Best-effort — never throws
   * into the capture path.
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
  }
}

export const loraStore = new LoraStore();
