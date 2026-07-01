import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_VERSION,
  PayloadType,
  MAX_HOPS,
  MAX_PAYLOAD_BYTES,
  HASH_RECEIPT_PAYLOAD_BYTES,
  generatePacketId,
  encodePacket,
  decodePacket,
  verifyPacket,
  relayPacket,
  packetIdHex,
  encodeHashReceiptPayload,
  decodeHashReceiptPayload,
  PacketError,
  type HashReceipt,
} from '../src/packet.js';
import { frameForWire, FrameReader } from '../src/transport.js';

const MESH_KEY = new Uint8Array(32).fill(7);
const OTHER_KEY = new Uint8Array(32).fill(9);

function samplePayload(n = 20): Uint8Array {
  return new Uint8Array(Array.from({ length: n }, (_, i) => (i * 3) & 0xff));
}

async function makeFrame(hopCount = 0, key = MESH_KEY): Promise<Uint8Array> {
  return encodePacket(
    {
      version: PROTOCOL_VERSION,
      packetId: generatePacketId(),
      hopCount,
      payloadType: PayloadType.HashReceipt,
      payload: samplePayload(),
    },
    key,
  );
}

describe('encode/decode', () => {
  it('round-trips all fields', async () => {
    const packetId = generatePacketId();
    const payload = samplePayload(50);
    const frame = await encodePacket(
      { version: PROTOCOL_VERSION, packetId, hopCount: 3, payloadType: PayloadType.ResourceBundle, payload },
      MESH_KEY,
    );
    const d = decodePacket(frame);
    expect(d.version).toBe(PROTOCOL_VERSION);
    expect(d.packetId).toEqual(packetId);
    expect(d.hopCount).toBe(3);
    expect(d.payloadType).toBe(PayloadType.ResourceBundle);
    expect(d.payload).toEqual(payload);
    expect(d.hmac.length).toBe(8);
  });

  it('rejects oversized payloads and bad packet ids', async () => {
    await expect(
      encodePacket(
        { version: 1, packetId: generatePacketId(), hopCount: 0, payloadType: PayloadType.HashReceipt, payload: new Uint8Array(MAX_PAYLOAD_BYTES + 1) },
        MESH_KEY,
      ),
    ).rejects.toBeInstanceOf(PacketError);
    await expect(
      encodePacket(
        { version: 1, packetId: new Uint8Array(4), hopCount: 0, payloadType: PayloadType.HashReceipt, payload: samplePayload() },
        MESH_KEY,
      ),
    ).rejects.toBeInstanceOf(PacketError);
  });

  it('decode throws on truncated frame and unsupported version', () => {
    expect(() => decodePacket(new Uint8Array(5))).toThrow(PacketError);
    const bad = new Uint8Array(20);
    bad[0] = 2; // wrong version
    expect(() => decodePacket(bad)).toThrow(PacketError);
  });
});

describe('HMAC verification', () => {
  it('verifies a well-formed frame', async () => {
    const frame = await makeFrame();
    expect(await verifyPacket(frame, MESH_KEY)).toBe(true);
  });

  it('rejects the wrong mesh key', async () => {
    const frame = await makeFrame();
    expect(await verifyPacket(frame, OTHER_KEY)).toBe(false);
  });

  it('rejects a mutated payload', async () => {
    const frame = await makeFrame();
    frame[12] ^= 0xff; // flip a payload byte
    expect(await verifyPacket(frame, MESH_KEY)).toBe(false);
  });

  it('rejects a mutated hop_count (relay must recompute the MAC)', async () => {
    const frame = await makeFrame(0);
    frame[9] = 1; // bump hop without recomputing MAC
    expect(await verifyPacket(frame, MESH_KEY)).toBe(false);
  });
});

describe('relayPacket', () => {
  it('increments hop_count and produces a frame that re-verifies', async () => {
    const frame = await makeFrame(2);
    const relayed = await relayPacket(frame, MESH_KEY);
    expect(relayed).not.toBeNull();
    const d = decodePacket(relayed!);
    expect(d.hopCount).toBe(3);
    expect(await verifyPacket(relayed!, MESH_KEY)).toBe(true);
    // same packet id survives relaying (needed for dedup)
    expect(packetIdHex(relayed!)).toBe(packetIdHex(frame));
  });

  it('returns null when the next hop would exceed MAX_HOPS', async () => {
    const frame = await makeFrame(MAX_HOPS);
    expect(await relayPacket(frame, MESH_KEY)).toBeNull();
  });
});

describe('generatePacketId', () => {
  it('returns 8 unique random bytes', () => {
    const a = generatePacketId();
    const b = generatePacketId();
    expect(a.length).toBe(8);
    expect(a).not.toEqual(b);
  });
});

describe('HashReceipt payload', () => {
  const receipt: HashReceipt = {
    mediaHash: 'a'.repeat(64),
    blobId: '123e4567-e89b-12d3-a456-426614174000',
    captureTime: 1_700_000_123_456,
    ecdsaSig: new Uint8Array(64).fill(0x11),
    mlDsaSig: new Uint8Array(3309).fill(0x22),
    keyId: 'f'.repeat(64),
  };

  it('encodes to exactly 156 bytes', () => {
    expect(encodeHashReceiptPayload(receipt).length).toBe(HASH_RECEIPT_PAYLOAD_BYTES);
  });

  it('round-trips the non-truncated fields', () => {
    const d = decodeHashReceiptPayload(encodeHashReceiptPayload(receipt));
    expect(d.mediaHash).toBe(receipt.mediaHash);
    expect(d.ecdsaSig).toEqual(receipt.ecdsaSig);
    expect(d.blobIdPrefix).toBe('123e4567e89b12d3'); // first 8 bytes of the UUID
    expect(d.keyIdPrefix).toBe('f'.repeat(32)); // first 16 bytes
    expect(d.mlDsaSigPrefix).toEqual(new Uint8Array(32).fill(0x22));
    // capture time truncates to whole seconds
    expect(d.captureTime).toBe(Math.floor(receipt.captureTime / 1000) * 1000);
  });
});

describe('frame wire framing', () => {
  it('reassembles frames across arbitrary chunk boundaries', () => {
    const f1 = new Uint8Array([1, 2, 3]);
    const f2 = new Uint8Array([9, 8, 7, 6, 5]);
    const wire = new Uint8Array([...frameForWire(f1), ...frameForWire(f2)]);

    const reader = new FrameReader();
    const out: Uint8Array[] = [];
    // feed one byte at a time to stress the de-framer
    for (const b of wire) out.push(...reader.push(new Uint8Array([b])));
    expect(out).toEqual([f1, f2]);
  });
});
