# Witness — Plane E: Proximity Mesh

**Version:** 0.1 (draft)
**Date:** 2026-03-27
**Status:** Proposal — pending review

---

## Overview

Plane E is Witness's proximity-based communication fabric. It replaces two separate apps — **Bridgefy** (Bluetooth mesh) and **LoRa DTN** (long-range store-and-forward) — with a single unified mesh layer that any Witness plane can use to relay content between devices without internet.

The mesh is **not a chat app**. It is a content-addressed, store-and-forward relay network. Payloads are identified by their hash, not by the identity of the sender or recipient. There are no accounts, no phone numbers, and no persistent device identifiers in any packet.

---

## Design constraints

| Constraint | Rationale |
|---|---|
| No persistent device identifiers in packets | Prevents traffic analysis revealing who is communicating with whom |
| Content-addressed routing | Payloads are routed by hash, not by destination identity |
| Store-and-forward only | No real-time delivery guarantee; mesh is inherently delay-tolerant |
| HMAC-authenticated packets | Prevents packet injection or tampering in transit |
| No plaintext payloads | All mesh payloads are encrypted before entering the mesh |
| Epidemic/gossip routing | No centralised routing table; no node is a single point of failure |
| Battery-aware scanning | Bluetooth and LoRa scanning pause below 20% battery |
| Panic purge clears outbound queue | Stops relay of any queued content immediately |

---

## Transport layers

Plane E uses two physical transports, unified behind a common packet format and routing layer.

### E.1 — Bluetooth Low Energy (BLE)

**Range:** ~10–100 m (building-scale, through walls)
**API:** Web Bluetooth API (browser) / native BLE on mobile
**Use case:** Dense urban environments, camps, shelters

BLE operates in two modes:

- **Advertise mode:** device broadcasts a compact beacon containing its `seen_ids` bloom filter, allowing nearby devices to determine which content the advertiser already has
- **Connect mode:** two devices connect and exchange missing payloads via GATT characteristic writes

BLE scanning is duty-cycled to reduce battery impact:

```
Default duty cycle: scan 5 s every 60 s
On active event (new content to relay): scan 30 s every 60 s
Below 20% battery: scanning suspended
```

### E.2 — LoRa (Long-Range Radio)

**Range:** 2–15 km line-of-sight (urban: 1–3 km)
**Hardware:** USB-C LoRa dongle (e.g. Heltec LoRa 32, RAK4631) or embedded module
**API:** Web Serial API (browser) / native serial on mobile
**Use case:** Rural areas, across checkpoints, multi-hop relay beyond BLE range

LoRa operates at configurable spreading factors (SF7–SF12). Higher spreading factors increase range at the cost of throughput and battery. Default configuration:

| Parameter | Value | Notes |
|---|---|---|
| Spreading factor | SF9 | Balance of range and throughput |
| Bandwidth | 125 kHz | Standard for long-range operation |
| Coding rate | 4/5 | Standard |
| Max payload | 222 bytes | LoRa hardware limit at SF9/125kHz |
| Effective throughput | ~300 bps | After protocol overhead |

Large payloads are chunked (see Section: Chunked transfer).

---

## Unified packet format

All mesh packets share the same format regardless of transport:

```typescript
interface MeshPacket {
  /** Protocol version. Current: 1. */
  version: 1;

  /**
   * Content-addressed packet ID.
   * SHA-256 of (payload_hash + created_at + ttl).
   * Used for deduplication — never a device or user identifier.
   */
  packet_id: string;

  /**
   * SHA-256 of the encrypted payload.
   * Receivers verify this before accepting the packet.
   */
  payload_hash: string;

  /**
   * Payload type — determines how the receiver processes the content.
   */
  payload_type:
    | 'evidence_receipt'      // Plane A: HashReceipt (small, high priority)
    | 'bulletin'              // Plane B: SignedBulletin chunk
    | 'map_bundle_chunk'      // Plane C: PMTiles chunk
    | 'knowledge_chunk'       // Plane D: KnowledgeBundle chunk
    | 'trust_bundle_update'   // Cross-plane: NGO trust bundle delta
    | 'mesh_message';         // Plain encrypted message between devices

  /**
   * Encrypted payload bytes.
   * Encryption is applied by the originating plane before entering the mesh.
   * The mesh layer treats this as opaque bytes.
   */
  payload: Uint8Array;

  /**
   * Unix timestamp (seconds) when the packet was first created.
   * Used for TTL calculation. Not a device identifier.
   */
  created_at: number;

  /**
   * Time-to-live in seconds from created_at.
   * Packet is dropped by any relay after this time has elapsed.
   */
  ttl: number;

  /**
   * Hop count. Incremented by each relay.
   * Packets with hop_count >= max_hops (default: 10) are not re-relayed.
   */
  hop_count: number;

  /**
   * HMAC-SHA-256 over all fields above (excluding this field).
   * Keyed with a per-session ephemeral key exchanged via ECDH on connect.
   * Prevents packet injection and tampering.
   */
  hmac: Uint8Array;
}
```

### Packet size budgets

| Transport | Max packet bytes | Notes |
|---|---|---|
| BLE (GATT write) | 512 bytes | ATT_MTU negotiated; 512 is practical max |
| LoRa | 222 bytes | Hardware limit at SF9/125kHz |

The mesh packet header consumes approximately 120–150 bytes (IDs, hashes, timestamps, HMAC). This leaves:

| Transport | Effective payload bytes |
|---|---|
| BLE | ~360 bytes |
| LoRa | ~70 bytes |

All large content is chunked before entering the mesh.

---

## Routing

Plane E uses **epidemic routing** (gossip protocol):

1. Device A advertises its `seen_ids` bloom filter (compact representation of packet IDs it has already relayed)
2. Device B compares A's bloom filter against its own outbound queue
3. B sends packets that A does not yet have
4. A relays those packets to any subsequent devices it encounters

No routing table. No destination address. No concept of a "path" to a recipient. Content propagates until every reachable device has seen it or TTL expires.

**Priority queue:** payloads are ordered by `priority` field when queuing for relay:

| Priority | Payload type |
|---|---|
| Critical | `evidence_receipt`, `trust_bundle_update` |
| High | `bulletin`, `mesh_message` |
| Normal | `map_bundle_chunk`, `knowledge_chunk` |

---

## Chunked transfer

Payloads larger than the single-packet payload limit are split into chunks before entering the mesh:

```typescript
interface ChunkedPayload {
  transfer_id: string;         // UUID for this chunked transfer session
  total_chunks: number;
  chunk_index: number;         // Zero-based
  payload_type: MeshPacket['payload_type'];
  content_hash: string;        // SHA-256 of the complete reassembled payload
  chunk_data: Uint8Array;      // This chunk's encrypted bytes
}
```

Receivers accumulate chunks in IndexedDB. Once all chunks are received, the content hash is verified before the payload is processed. Missing chunks are re-requested on next peer contact.

---

## Mesh messages (encrypted peer-to-peer)

For human-to-human messaging (the Bridgefy use case), Plane E supports `mesh_message` payloads:

- Messages are **not addressed by identity** — there is no "send to user X"
- Instead, messages are encrypted to a **recipient public key** (Ed25519), shared out-of-band (e.g. QR code exchange in person)
- Any device relays any `mesh_message` without knowing if it is the intended recipient — it simply tries to decrypt; if decryption succeeds, the message is for this device
- **No delivery receipts** — mesh messaging is fire-and-forget; no read status, no typing indicators, no "online" presence
- Message history is stored encrypted; panic purge clears it entirely

```typescript
interface MeshMessage {
  /** Random ID — not derived from sender or recipient identity. */
  message_id: string;
  /**
   * Encrypted message body.
   * Encrypted with recipient's Ed25519 public key (via X25519 key exchange).
   * Any relaying device cannot read the content.
   */
  ciphertext: Uint8Array;
  /** Ephemeral sender public key for ECDH key exchange. Not a persistent identity. */
  ephemeral_sender_key: Uint8Array;
  created_at: number;
  ttl: number;
}
```

**Key exchange:** recipients share their Ed25519 public key via QR code scan, printed card, or Plane B bulletin attachment. There is no key server.

---

## Panic purge scope

The global panic purge clears:

```
IndexedDB plane-e-outbound-queue     # All queued outbound packets
IndexedDB plane-e-seen-ids           # Deduplication cache
IndexedDB plane-e-chunk-store        # Partially received chunked payloads
IndexedDB plane-e-messages           # Received mesh messages
```

After purge, the device stops relaying immediately. Any BLE or LoRa connection in progress is terminated.

---

## Package

`@witness/proximity-mesh`

Extends and replaces the earlier `@witness/lora-dtn` package (BLE transport is new; LoRa transport is carried forward and refactored into the unified packet format).

```
packages/proximity-mesh/
  src/
    transports/
      ble-transport.ts       # Web Bluetooth API — advertise, scan, GATT connect
      lora-transport.ts      # Web Serial API — AT command framing for LoRa modules
      transport-interface.ts # Common interface implemented by both transports
    routing/
      epidemic-router.ts     # Gossip routing, priority queue, TTL management
      bloom-filter.ts        # seen_ids bloom filter for efficient peer sync
    packets/
      packet.ts              # MeshPacket encode/decode + HMAC verify
      chunker.ts             # Chunk splitting and reassembly
    messaging/
      mesh-message.ts        # MeshMessage encrypt/decrypt (X25519 + AES-GCM)
      message-store.ts       # IndexedDB persistence for received messages
    index.ts                 # Package exports
```

---

## Relationship to other planes

| Plane | How Plane E serves it |
|---|---|
| Plane A | Relays evidence receipts (HashReceipt) to reach a device with connectivity |
| Plane B | Relays signed bulletins between devices when publisher cannot be reached directly |
| Plane C | Distributes map tile chunks between nearby devices |
| Plane D | Distributes knowledge bundle chunks between nearby devices |
| Plane F | Distributes model bundle chunks (low priority; large; long-running transfer) |

---

## Open questions

1. Should BLE and LoRa operate simultaneously, or should the user explicitly select the active transport? (Current proposal: both active when hardware is available; BLE preferred for throughput, LoRa for range.)
2. What is the correct default TTL for each payload type? (Proposal: evidence receipts 7 days, bulletins 24 hours, map/knowledge chunks 30 days.)
3. For mesh messages: should there be a maximum message history size, or is this managed by the user and cleared by panic purge only?
4. LoRa hardware availability: which specific USB-C LoRa dongles should be the primary supported hardware for field deployment?
