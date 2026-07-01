/**
 * LoRaDTNPacket binary codec + HMAC integrity, and the compact HashReceipt
 * payload encoding (architecture.md §6.2).
 *
 * Wire format (big-endian, fixed 11-byte header + variable payload + 8-byte MAC):
 *
 *   offset 0        version      uint8   (protocol version; currently 1)
 *   offset 1..8     packet_id    8 bytes (random; used for dedup)
 *   offset 9        hop_count    uint8   (incremented at each relay)
 *   offset 10       payload_type uint8   (0x01 HashReceipt | 0x02 TrustBundleFragment | 0x03 ResourceBundle)
 *   offset 11..N-8  payload      ≤200 bytes (compressed/encrypted application payload)
 *   offset N-8..N   hmac         8 bytes (truncated HMAC-SHA256 over packet_id || hop_count || payload)
 *
 * The HMAC uses a network-wide pre-shared mesh key. It proves a packet came
 * from a legitimate mesh member and lets relays reject injected/mutated frames;
 * because `hop_count` is covered, a relay that increments the hop MUST recompute
 * the MAC (see {@link relayPacket}). End-to-end evidence authenticity is NOT the
 * MAC's job — that is the ECDSA/ML-DSA signature carried inside the payload and
 * verified by the server on ingestion.
 */

import { bytesToHex, hexToBytes } from '@witness/crypto-core';

export const PROTOCOL_VERSION = 1;
export const MAX_HOPS = 7;
export const PACKET_ID_BYTES = 8;
export const HEADER_BYTES = 11; // version + packet_id(8) + hop_count + payload_type
export const HMAC_BYTES = 8;
export const MAX_PAYLOAD_BYTES = 200;

export enum PayloadType {
  HashReceipt = 0x01,
  TrustBundleFragment = 0x02,
  ResourceBundle = 0x03,
}

export interface LoRaPacketFields {
  version: number;
  packetId: Uint8Array; // 8 bytes
  hopCount: number;
  payloadType: PayloadType;
  payload: Uint8Array; // ≤200 bytes
}

export interface DecodedPacket extends LoRaPacketFields {
  /** The 8-byte MAC carried in the frame (not yet verified). */
  hmac: Uint8Array;
}

export class PacketError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'TOO_SHORT'
      | 'PAYLOAD_TOO_LARGE'
      | 'BAD_PACKET_ID'
      | 'UNSUPPORTED_VERSION',
  ) {
    super(message);
    this.name = 'PacketError';
  }
}

/** 8 cryptographically-random bytes for use as a packet id. */
export function generatePacketId(): Uint8Array {
  const id = new Uint8Array(PACKET_ID_BYTES);
  crypto.getRandomValues(id);
  return id;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, data as unknown as ArrayBuffer);
  return new Uint8Array(sig);
}

/** Bytes the MAC is computed over: packet_id || hop_count || payload. */
function macInput(packetId: Uint8Array, hopCount: number, payload: Uint8Array): Uint8Array {
  const buf = new Uint8Array(packetId.length + 1 + payload.length);
  buf.set(packetId, 0);
  buf[packetId.length] = hopCount & 0xff;
  buf.set(payload, packetId.length + 1);
  return buf;
}

/** Length-constant comparison to avoid leaking match position via timing. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Serialize a packet and append its truncated HMAC. `meshKey` is the shared
 * pre-shared network key.
 */
export async function encodePacket(
  fields: LoRaPacketFields,
  meshKey: Uint8Array,
): Promise<Uint8Array> {
  if (fields.packetId.length !== PACKET_ID_BYTES) {
    throw new PacketError('packet_id must be 8 bytes', 'BAD_PACKET_ID');
  }
  if (fields.payload.length > MAX_PAYLOAD_BYTES) {
    throw new PacketError(
      `payload exceeds ${MAX_PAYLOAD_BYTES} bytes`,
      'PAYLOAD_TOO_LARGE',
    );
  }

  const frame = new Uint8Array(HEADER_BYTES + fields.payload.length + HMAC_BYTES);
  frame[0] = fields.version & 0xff;
  frame.set(fields.packetId, 1);
  frame[9] = fields.hopCount & 0xff;
  frame[10] = fields.payloadType & 0xff;
  frame.set(fields.payload, HEADER_BYTES);

  const mac = await hmacSha256(
    meshKey,
    macInput(fields.packetId, fields.hopCount, fields.payload),
  );
  frame.set(mac.subarray(0, HMAC_BYTES), HEADER_BYTES + fields.payload.length);
  return frame;
}

/** Parse a frame into its fields + carried MAC. Does not verify the MAC. */
export function decodePacket(frame: Uint8Array): DecodedPacket {
  if (frame.length < HEADER_BYTES + HMAC_BYTES) {
    throw new PacketError('frame shorter than header + mac', 'TOO_SHORT');
  }
  const version = frame[0];
  if (version !== PROTOCOL_VERSION) {
    throw new PacketError(`unsupported version ${version}`, 'UNSUPPORTED_VERSION');
  }
  const payloadEnd = frame.length - HMAC_BYTES;
  return {
    version,
    packetId: frame.slice(1, 9),
    hopCount: frame[9],
    payloadType: frame[10] as PayloadType,
    payload: frame.slice(HEADER_BYTES, payloadEnd),
    hmac: frame.slice(payloadEnd),
  };
}

/**
 * Recompute the MAC over the frame's current fields and compare (constant time)
 * against the carried MAC. Returns false for malformed frames rather than throwing.
 */
export async function verifyPacket(
  frame: Uint8Array,
  meshKey: Uint8Array,
): Promise<boolean> {
  let decoded: DecodedPacket;
  try {
    decoded = decodePacket(frame);
  } catch {
    return false;
  }
  const expected = await hmacSha256(
    meshKey,
    macInput(decoded.packetId, decoded.hopCount, decoded.payload),
  );
  return constantTimeEqual(expected.subarray(0, HMAC_BYTES), decoded.hmac);
}

/** Convenience: id of a decoded/raw frame as a hex string, for use as a map/DB key. */
export function packetIdHex(packetIdOrFrame: Uint8Array): string {
  const id =
    packetIdOrFrame.length === PACKET_ID_BYTES
      ? packetIdOrFrame
      : decodePacket(packetIdOrFrame).packetId;
  return bytesToHex(id);
}

/**
 * Produce the relayed form of a frame: hop_count incremented and MAC recomputed.
 * Returns null when the incremented hop count would exceed {@link MAX_HOPS}
 * (the packet must be dropped rather than relayed).
 */
export async function relayPacket(
  frame: Uint8Array,
  meshKey: Uint8Array,
): Promise<Uint8Array | null> {
  const decoded = decodePacket(frame);
  const nextHop = decoded.hopCount + 1;
  if (nextHop > MAX_HOPS) return null;
  return encodePacket(
    {
      version: decoded.version,
      packetId: decoded.packetId,
      hopCount: nextHop,
      payloadType: decoded.payloadType,
      payload: decoded.payload,
    },
    meshKey,
  );
}

// ---------------------------------------------------------------------------
// HashReceipt payload (156 bytes) — the only evidence carried over LoRa.
// Full ML-DSA-65 signature (3,309 B) never travels here; only a 32-byte prefix,
// enough to prove the signing key was used. The full signature is uploaded via a
// higher-bandwidth channel and verified server-side.
// ---------------------------------------------------------------------------

export const HASH_RECEIPT_PAYLOAD_BYTES = 156;

const OFF_MEDIA_HASH = 0; // 32
const OFF_BLOB_ID = 32; // 8
const OFF_CAPTURE_TIME = 40; // 4 (uint32 seconds)
const OFF_ECDSA_SIG = 44; // 64
const OFF_MLDSA_PREFIX = 108; // 32
const OFF_KEY_ID = 140; // 16  (ends at 156)

export interface HashReceipt {
  /** SHA-256 of the plaintext media, hex (64 chars). */
  mediaHash: string;
  /** Evidence blob UUID; first 8 bytes are encoded for dedup. */
  blobId: string;
  /** Capture time (Unix ms); encoded as uint32 seconds. */
  captureTime: number;
  /** Raw ECDSA P-256 signature, r||s (64 bytes). */
  ecdsaSig: Uint8Array;
  /** Full ML-DSA-65 signature; first 32 bytes are encoded. */
  mlDsaSig: Uint8Array;
  /** Signing key fingerprint, hex; first 16 bytes are encoded. */
  keyId: string;
}

function uuidToBytes(uuid: string): Uint8Array {
  return hexToBytes(uuid.replace(/-/g, ''));
}

/** Encode a HashReceipt into its fixed 156-byte LoRa payload. */
export function encodeHashReceiptPayload(r: HashReceipt): Uint8Array {
  const out = new Uint8Array(HASH_RECEIPT_PAYLOAD_BYTES);

  const mediaHash = hexToBytes(r.mediaHash);
  if (mediaHash.length !== 32) throw new PacketError('mediaHash must be 32 bytes', 'PAYLOAD_TOO_LARGE');
  out.set(mediaHash, OFF_MEDIA_HASH);

  out.set(uuidToBytes(r.blobId).subarray(0, 8), OFF_BLOB_ID);

  const seconds = Math.floor(r.captureTime / 1000);
  new DataView(out.buffer).setUint32(OFF_CAPTURE_TIME, seconds >>> 0, false);

  if (r.ecdsaSig.length !== 64) throw new PacketError('ecdsaSig must be 64 bytes', 'PAYLOAD_TOO_LARGE');
  out.set(r.ecdsaSig, OFF_ECDSA_SIG);

  out.set(r.mlDsaSig.subarray(0, 32), OFF_MLDSA_PREFIX);
  out.set(hexToBytes(r.keyId).subarray(0, 16), OFF_KEY_ID);
  return out;
}

export interface DecodedHashReceipt {
  mediaHash: string;
  blobIdPrefix: string; // first 8 bytes, hex
  captureTime: number; // Unix ms
  ecdsaSig: Uint8Array; // 64 bytes
  mlDsaSigPrefix: Uint8Array; // 32 bytes (truncated)
  keyIdPrefix: string; // first 16 bytes, hex
}

/**
 * Decode a 156-byte HashReceipt payload. Note the ML-DSA signature and key id
 * are truncated on the wire, so these fields are prefixes only.
 */
export function decodeHashReceiptPayload(payload: Uint8Array): DecodedHashReceipt {
  if (payload.length !== HASH_RECEIPT_PAYLOAD_BYTES) {
    throw new PacketError('HashReceipt payload must be 156 bytes', 'TOO_SHORT');
  }
  const seconds = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  ).getUint32(OFF_CAPTURE_TIME, false);
  return {
    mediaHash: bytesToHex(payload.slice(OFF_MEDIA_HASH, OFF_MEDIA_HASH + 32)),
    blobIdPrefix: bytesToHex(payload.slice(OFF_BLOB_ID, OFF_BLOB_ID + 8)),
    captureTime: seconds * 1000,
    ecdsaSig: payload.slice(OFF_ECDSA_SIG, OFF_ECDSA_SIG + 64),
    mlDsaSigPrefix: payload.slice(OFF_MLDSA_PREFIX, OFF_MLDSA_PREFIX + 32),
    keyIdPrefix: bytesToHex(payload.slice(OFF_KEY_ID, OFF_KEY_ID + 16)),
  };
}
