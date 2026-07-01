/**
 * Delay-tolerant packet store and epidemic routing decision (architecture.md §6.2).
 *
 * Persists two things in IndexedDB:
 *  - `packets`: outbound (locally-originated) + relayed frames awaiting broadcast.
 *    Relayed frames form a bounded FIFO buffer (max 50); locally-originated frames
 *    are retained until delivery is confirmed.
 *  - `seen`: a rolling window of the last 200 packet ids for deduplication.
 *
 * The routing decision ({@link DTNQueue.processIncoming}) is pure control logic —
 * it never performs radio or network I/O. It returns an intent describing what
 * the caller should do (rebroadcast a relay frame, and/or forward the payload to
 * the ingestion endpoint), keeping the store fully unit-testable.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { bytesToHex } from '@witness/crypto-core';
import {
  MAX_HOPS,
  PayloadType,
  decodePacket,
  relayPacket,
  verifyPacket,
} from './packet.js';

export const DTN_DB_NAME = 'witness-lora-dtn';
export const DTN_DB_VERSION = 1;
export const MAX_BUFFER = 50; // relayed frames retained (FIFO)
export const SEEN_WINDOW = 200; // deduplication history depth
export const REBROADCAST_JITTER_MS = 5000; // 0–5s jitter reduces collision storms

const PACKET_STORE = 'packets';
const SEEN_STORE = 'seen';

export type PacketSource = 'local' | 'relay';

interface StoredPacket {
  packetIdHex: string;
  frame: Uint8Array;
  hopCount: number;
  payloadType: PayloadType;
  source: PacketSource;
  createdAt: number;
  delivered: boolean;
}

interface SeenEntry {
  packetIdHex: string;
  seenAt: number;
}

interface DTNDB extends DBSchema {
  packets: {
    key: string;
    value: StoredPacket;
    indexes: { by_created: number };
  };
  seen: {
    key: string;
    value: SeenEntry;
    indexes: { by_seen: number };
  };
}

export type DiscardReason = 'malformed' | 'max_hops' | 'bad_hmac' | 'duplicate';

export type IncomingResult =
  | { action: 'discard'; reason: DiscardReason }
  | {
      action: 'accept';
      packetIdHex: string;
      payloadType: PayloadType;
      payload: Uint8Array;
      /** Rebroadcast this frame (after {@link rebroadcastDelayMs}); null if hop limit reached. */
      relayFrame: Uint8Array | null;
      /** True when this node has connectivity and should forward the payload upstream. */
      deliver: boolean;
    };

/** Random rebroadcast delay in ms, in [0, maxMs). */
export function rebroadcastDelayMs(maxMs: number = REBROADCAST_JITTER_MS): number {
  return Math.floor(Math.random() * maxMs);
}

export class DTNQueue {
  private constructor(private readonly db: IDBPDatabase<DTNDB>) {}

  static async open(): Promise<DTNQueue> {
    const db = await openDB<DTNDB>(DTN_DB_NAME, DTN_DB_VERSION, {
      upgrade(database) {
        const packets = database.createObjectStore(PACKET_STORE, {
          keyPath: 'packetIdHex',
        });
        packets.createIndex('by_created', 'createdAt');
        const seen = database.createObjectStore(SEEN_STORE, {
          keyPath: 'packetIdHex',
        });
        seen.createIndex('by_seen', 'seenAt');
      },
    });
    return new DTNQueue(db);
  }

  /**
   * Queue a locally-originated frame for broadcast and mark it seen (so it is not
   * re-relayed if it echoes back). Returns the packet id hex.
   */
  async enqueueLocal(frame: Uint8Array, now: number = Date.now()): Promise<string> {
    const decoded = decodePacket(frame);
    const packetIdHex = bytesToHex(decoded.packetId);
    await this.db.put(PACKET_STORE, {
      packetIdHex,
      frame,
      hopCount: decoded.hopCount,
      payloadType: decoded.payloadType,
      source: 'local',
      createdAt: now,
      delivered: false,
    });
    await this.markSeen(packetIdHex, now);
    return packetIdHex;
  }

  /** Store a relayed frame in the bounded FIFO relay buffer. */
  async bufferRelay(frame: Uint8Array, now: number = Date.now()): Promise<void> {
    const decoded = decodePacket(frame);
    await this.db.put(PACKET_STORE, {
      packetIdHex: bytesToHex(decoded.packetId),
      frame,
      hopCount: decoded.hopCount,
      payloadType: decoded.payloadType,
      source: 'relay',
      createdAt: now,
      delivered: false,
    });
    await this.evictRelayOverflow();
  }

  async hasSeen(packetIdHex: string): Promise<boolean> {
    return (await this.db.get(SEEN_STORE, packetIdHex)) !== undefined;
  }

  /** Record a packet id as seen and trim the dedup window to {@link SEEN_WINDOW}. */
  async markSeen(packetIdHex: string, now: number = Date.now()): Promise<void> {
    await this.db.put(SEEN_STORE, { packetIdHex, seenAt: now });
    const count = await this.db.count(SEEN_STORE);
    if (count > SEEN_WINDOW) {
      const tx = this.db.transaction(SEEN_STORE, 'readwrite');
      let cursor = await tx.store.index('by_seen').openCursor();
      let toRemove = count - SEEN_WINDOW;
      while (cursor && toRemove > 0) {
        await cursor.delete();
        toRemove -= 1;
        cursor = await cursor.continue();
      }
      await tx.done;
    }
  }

  /** Frames still awaiting broadcast (not yet delivered), oldest first. */
  async pending(): Promise<Uint8Array[]> {
    const all = await this.db.getAllFromIndex(PACKET_STORE, 'by_created');
    return all.filter((p) => !p.delivered).map((p) => p.frame);
  }

  /** Mark a packet delivered so it is no longer rebroadcast. */
  async markDelivered(packetIdHex: string): Promise<void> {
    const rec = await this.db.get(PACKET_STORE, packetIdHex);
    if (rec) {
      rec.delivered = true;
      await this.db.put(PACKET_STORE, rec);
    }
  }

  /**
   * The epidemic routing decision for an inbound frame. Verifies, deduplicates,
   * buffers, and returns the intent (relay frame + deliver flag). Performs no I/O
   * beyond the local store.
   */
  async processIncoming(
    frame: Uint8Array,
    meshKey: Uint8Array,
    opts: { hasConnectivity: boolean } = { hasConnectivity: false },
    now: number = Date.now(),
  ): Promise<IncomingResult> {
    let decoded;
    try {
      decoded = decodePacket(frame);
    } catch {
      return { action: 'discard', reason: 'malformed' };
    }
    if (decoded.hopCount > MAX_HOPS) {
      return { action: 'discard', reason: 'max_hops' };
    }
    if (!(await verifyPacket(frame, meshKey))) {
      return { action: 'discard', reason: 'bad_hmac' };
    }
    const packetIdHex = bytesToHex(decoded.packetId);
    if (await this.hasSeen(packetIdHex)) {
      return { action: 'discard', reason: 'duplicate' };
    }

    await this.markSeen(packetIdHex, now);
    await this.bufferRelay(frame, now);
    const relayFrame = await relayPacket(frame, meshKey);

    return {
      action: 'accept',
      packetIdHex,
      payloadType: decoded.payloadType,
      payload: decoded.payload,
      relayFrame,
      deliver: opts.hasConnectivity,
    };
  }

  /** Panic purge — wipe the queue and dedup history. */
  async purgeAll(): Promise<void> {
    await this.db.clear(PACKET_STORE);
    await this.db.clear(SEEN_STORE);
  }

  close(): void {
    this.db.close();
  }

  /** Evict oldest relayed frames beyond MAX_BUFFER (local frames are exempt). */
  private async evictRelayOverflow(): Promise<void> {
    const all = await this.db.getAllFromIndex(PACKET_STORE, 'by_created');
    const relay = all.filter((p) => p.source === 'relay');
    let overflow = relay.length - MAX_BUFFER;
    if (overflow <= 0) return;
    const tx = this.db.transaction(PACKET_STORE, 'readwrite');
    for (const p of relay) {
      if (overflow <= 0) break;
      await tx.store.delete(p.packetIdHex);
      overflow -= 1;
    }
    await tx.done;
  }
}
