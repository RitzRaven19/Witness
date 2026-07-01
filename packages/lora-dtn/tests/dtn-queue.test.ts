import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { bytesToHex } from '@witness/crypto-core';
import {
  PROTOCOL_VERSION,
  PayloadType,
  MAX_HOPS,
  encodePacket,
  generatePacketId,
} from '../src/packet.js';
import { DTNQueue, MAX_BUFFER, SEEN_WINDOW } from '../src/dtn-queue.js';

const MESH_KEY = new Uint8Array(32).fill(7);
const WRONG_KEY = new Uint8Array(32).fill(9);

function payload(n = 16): Uint8Array {
  return new Uint8Array(Array.from({ length: n }, (_, i) => i & 0xff));
}

async function frame(hopCount = 0, key = MESH_KEY): Promise<Uint8Array> {
  return encodePacket(
    { version: PROTOCOL_VERSION, packetId: generatePacketId(), hopCount, payloadType: PayloadType.HashReceipt, payload: payload() },
    key,
  );
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('DTNQueue enqueue / pending', () => {
  it('queues a local frame and lists it as pending', async () => {
    const q = await DTNQueue.open();
    const f = await frame();
    const id = await q.enqueueLocal(f);
    const pend = await q.pending();
    expect(pend).toHaveLength(1);
    expect(pend[0]).toEqual(f);
    // enqueued frames are marked seen so they are not re-relayed on echo
    expect(await q.hasSeen(id)).toBe(true);
    q.close();
  });

  it('markDelivered removes a frame from pending', async () => {
    const q = await DTNQueue.open();
    const f = await frame();
    const id = await q.enqueueLocal(f);
    await q.markDelivered(id);
    expect(await q.pending()).toHaveLength(0);
    q.close();
  });
});

describe('DTNQueue.processIncoming (epidemic routing)', () => {
  it('accepts a valid frame, relays with hop+1, honours connectivity', async () => {
    const q = await DTNQueue.open();
    const f = await frame(0);
    const res = await q.processIncoming(f, MESH_KEY, { hasConnectivity: true });
    expect(res.action).toBe('accept');
    if (res.action !== 'accept') return;
    expect(res.deliver).toBe(true);
    expect(res.relayFrame).not.toBeNull();
    expect(res.payloadType).toBe(PayloadType.HashReceipt);
    q.close();
  });

  it('discards a duplicate on the second receive', async () => {
    const q = await DTNQueue.open();
    const f = await frame(0);
    await q.processIncoming(f, MESH_KEY);
    const res = await q.processIncoming(f, MESH_KEY);
    expect(res).toEqual({ action: 'discard', reason: 'duplicate' });
    q.close();
  });

  it('discards frames past the hop limit', async () => {
    const q = await DTNQueue.open();
    const f = await frame(MAX_HOPS + 1);
    const res = await q.processIncoming(f, MESH_KEY);
    expect(res).toEqual({ action: 'discard', reason: 'max_hops' });
    q.close();
  });

  it('accepts a frame exactly at MAX_HOPS but does not relay it further', async () => {
    const q = await DTNQueue.open();
    const f = await frame(MAX_HOPS);
    const res = await q.processIncoming(f, MESH_KEY);
    expect(res.action).toBe('accept');
    if (res.action !== 'accept') return;
    expect(res.relayFrame).toBeNull();
    q.close();
  });

  it('discards frames with an invalid MAC', async () => {
    const q = await DTNQueue.open();
    const f = await frame(0, WRONG_KEY); // signed with a key we do not trust
    const res = await q.processIncoming(f, MESH_KEY);
    expect(res).toEqual({ action: 'discard', reason: 'bad_hmac' });
    q.close();
  });

  it('discards malformed frames', async () => {
    const q = await DTNQueue.open();
    const res = await q.processIncoming(new Uint8Array(4), MESH_KEY);
    expect(res).toEqual({ action: 'discard', reason: 'malformed' });
    q.close();
  });
});

describe('DTNQueue bounds', () => {
  it('caps the relay buffer at MAX_BUFFER (FIFO)', async () => {
    const q = await DTNQueue.open();
    for (let i = 0; i < MAX_BUFFER + 5; i++) {
      await q.bufferRelay(await frame(1), 1000 + i);
    }
    expect(await q.pending()).toHaveLength(MAX_BUFFER);
    q.close();
  });

  it('trims the dedup window to SEEN_WINDOW, evicting oldest first', async () => {
    const q = await DTNQueue.open();
    const ids: string[] = [];
    for (let i = 0; i < SEEN_WINDOW + 5; i++) {
      const id = bytesToHex(generatePacketId());
      ids.push(id);
      await q.markSeen(id, 1000 + i);
    }
    // oldest 5 evicted, newest retained
    expect(await q.hasSeen(ids[0])).toBe(false);
    expect(await q.hasSeen(ids[4])).toBe(false);
    expect(await q.hasSeen(ids[5])).toBe(true);
    expect(await q.hasSeen(ids[ids.length - 1])).toBe(true);
    q.close();
  });
});

describe('DTNQueue.purgeAll', () => {
  it('wipes queued packets and dedup history', async () => {
    const q = await DTNQueue.open();
    const f = await frame();
    const id = await q.enqueueLocal(f);
    await q.purgeAll();
    expect(await q.pending()).toHaveLength(0);
    expect(await q.hasSeen(id)).toBe(false);
    q.close();
  });
});
