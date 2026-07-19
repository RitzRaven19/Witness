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
  PROTOCOL_VERSION,
  MAX_PAYLOAD_BYTES,
  decodePacket,
  encodePacket,
  generatePacketId,
  enqueueHashReceipt,
  rebroadcastDelayMs,
  MeshtasticTransport,
  type HashReceipt,
  type LoRaTransport,
} from '@witness/lora-dtn';
import {
  sign,
  mldsaSign,
  keyFingerprint,
  hexToBytes,
  bytesToHex,
  sealToPublicKey,
  openSealed,
  importEcdhPublicKey,
} from '@witness/crypto-core';
import { getDeviceKey, getDeviceEcdhKey, getDeviceEcdhPublicRaw } from './deviceKey';
import { storageGet, storageSet, storageRemove } from '../utils/safeStorage';
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
  let hex = storageGet(MESH_KEY_STORAGE);
  if (!hex || !HEX64.test(hex)) {
    hex = DEFAULT_MESH_KEY_HEX;
    storageSet(MESH_KEY_STORAGE, hex);
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

/** A mesh message this device successfully decrypted (i.e. addressed to us). */
export interface InboxMessage {
  id: string;
  /** Sender contact-key fingerprint (16 hex) carried inside the sealed box. */
  fromFp: string;
  text: string;
  receivedAt: number;
}

type InboxListener = (messages: InboxMessage[]) => void;

/** First 16 hex chars of SHA-256 over a raw contact public key. */
export async function contactFingerprint(pubRaw: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', pubRaw.slice().buffer as ArrayBuffer);
  return bytesToHex(new Uint8Array(digest)).slice(0, 16);
}

class LoraStore {
  private queue: DTNQueue | null = null;
  private transport: LoRaTransport | null = null;
  private unsubscribeFrames: (() => void) | null = null;
  private meshKeyHex = loadMeshKeyHex();
  private meshKey = hexToBytes(this.meshKeyHex);
  private ingestUrl = storageGet(INGEST_URL_STORAGE);
  private readonly listeners = new Set<Listener>();
  private inbox: InboxMessage[] = [];
  private readonly inboxListeners = new Set<InboxListener>();

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
    storageSet(MESH_KEY_STORAGE, clean);
    this.emit({ meshKeyFp: clean.slice(0, 8) });
  }

  // ── Ingestion endpoint ───────────────────────────────────────────────────
  getIngestUrl(): string | null {
    return this.ingestUrl;
  }

  setIngestUrl(url: string | null): void {
    const clean = url?.trim() || null;
    this.ingestUrl = clean;
    if (clean) storageSet(INGEST_URL_STORAGE, clean);
    else storageRemove(INGEST_URL_STORAGE);
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

  /**
   * Connect a companion Meshtastic board over USB-C (Web Serial) or BLE
   * (Web Bluetooth). Stock Meshtastic firmware — our DTN frames ride the
   * PRIVATE_APP port and are flooded by the whole Meshtastic mesh.
   */
  async connect(kind: TransportKind): Promise<void> {
    if (this.status.conn === 'connected' || this.status.conn === 'connecting') return;
    this.emit({ conn: 'connecting', kind, lastError: null });

    const transport: LoRaTransport = new MeshtasticTransport(kind);
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
      deviceLabel: kind === 'serial' ? 'Meshtastic (USB-C)' : 'Meshtastic (BLE)',
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

    // Decrypt-if-yours: every node tries to open MeshMessage payloads; only the
    // holder of the recipient key succeeds. Failure is the normal relay case.
    if (res.payloadType === PayloadType.MeshMessage) {
      await this.tryReceiveMeshMessage(res.packetIdHex, res.payload);
    }

    // Only HashReceipts are forwarded to the ingestion endpoint — bundles and
    // mesh messages have no server-side meaning.
    if (
      res.deliver &&
      res.payloadType === PayloadType.HashReceipt &&
      (await this.deliverPayload(res.payload))
    ) {
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

  // ── Mesh messaging (Plane E MeshMessage over the LoRa DTN) ────────────────

  /** Subscribe to this session's decrypted inbox. Emits the current list immediately. */
  subscribeInbox(listener: InboxListener): () => void {
    this.inboxListeners.add(listener);
    listener(this.inbox);
    return () => this.inboxListeners.delete(listener);
  }

  getInbox(): InboxMessage[] {
    return this.inbox;
  }

  /** Wipe the session inbox (messages are memory-only; also called on purge). */
  clearInbox(): void {
    this.inbox = [];
    for (const l of this.inboxListeners) l(this.inbox);
  }

  /**
   * Seal a short text to a peer's contact public key and queue it for the mesh.
   * The sealed box carries our contact-key fingerprint INSIDE the ciphertext so
   * only the recipient learns who sent it; the wire packet has no identities.
   * Broadcasts immediately when a companion is connected, else waits queued.
   */
  async sendMeshMessage(peerPubRawHex: string, text: string): Promise<void> {
    const body = text.trim();
    if (!body) throw new Error('Empty message');

    const myFp = await contactFingerprint(await getDeviceEcdhPublicRaw());
    const plaintext = new TextEncoder().encode(JSON.stringify({ f: myFp, t: body }));

    const recipientPub = await importEcdhPublicKey(hexToBytes(peerPubRawHex));
    const sealed = await sealToPublicKey(recipientPub, plaintext);
    if (sealed.length > MAX_PAYLOAD_BYTES) {
      throw new Error(`Message too long for a LoRa frame (${sealed.length}/${MAX_PAYLOAD_BYTES} bytes)`);
    }

    const frame = await encodePacket(
      {
        version: PROTOCOL_VERSION,
        packetId: generatePacketId(),
        hopCount: 0,
        payloadType: PayloadType.MeshMessage,
        payload: sealed,
      },
      this.meshKey,
    );

    const q = await this.getQueue();
    await q.enqueueLocal(frame);
    if (this.transport?.isConnected()) {
      await this.transport.send(frame).catch(() => {});
    }
    await this.refreshPending();
  }

  /** Attempt to open an inbound sealed box; keep it only if it is addressed to us. */
  private async tryReceiveMeshMessage(
    packetIdHex: string,
    sealed: Uint8Array,
  ): Promise<void> {
    try {
      const key = await getDeviceEcdhKey();
      const plaintext = await openSealed(key.privateKey, sealed);
      if (!plaintext) return; // not for us — relay only

      const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as {
        f?: string;
        t?: string;
      };
      if (typeof parsed.t !== 'string' || typeof parsed.f !== 'string') return;

      this.inbox = [
        ...this.inbox,
        { id: packetIdHex, fromFp: parsed.f, text: parsed.t, receivedAt: Date.now() },
      ];
      for (const l of this.inboxListeners) l(this.inbox);
    } catch {
      /* malformed inner payload — ignore */
    }
  }
}

export const loraStore = new LoraStore();
