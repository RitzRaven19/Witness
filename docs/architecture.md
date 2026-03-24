# Witness — Architecture Specification

**Version:** 1.0
**Date:** 2026-03-20
**Classification:** Public
**Status:** MVP + Phase 2 Design

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Data Object Model](#2-data-object-model)
3. [Cryptographic Operations](#3-cryptographic-operations)
4. [Storage Architecture](#4-storage-architecture)
5. [Upload and Sync](#5-upload-and-sync)
6. [Transfer Channels](#6-transfer-channels)
7. [Backend Ingestion](#7-backend-ingestion)
8. [Trust Model](#8-trust-model)
9. [Key Management](#9-key-management)
10. [Phase B Governance](#10-phase-b-governance)
11. [Component Inventory](#11-component-inventory)
12. [Standards Alignment](#12-standards-alignment)
13. [Offline Resource Map](#13-offline-resource-map)

---

## 1. System Overview

Witness is an offline-first Progressive Web App (PWA) for civilian evidence preservation in active conflict zones. It is structured as a **two-plane architecture**, where each plane has a distinct security model, data flow, and threat profile.

### 1.1 Two-Plane Design

```
┌──────────────────────────────────────────────────────────────────┐
│                         WITNESS                                  │
│                                                                  │
│  ┌─────────────────────────┐   ┌──────────────────────────────┐  │
│  │       PLANE A           │   │          PLANE B             │  │
│  │   Evidence Vault        │   │     Safe Info Layer          │  │
│  │                         │   │                              │  │
│  │  Capture → Hash         │   │  Trusted NGO publishers      │  │
│  │  Encrypt → Store        │   │  issue signed bulletins      │  │
│  │  Queue → Upload         │   │  (shelters, clinics,         │  │
│  │  Custody log            │   │   safety status)             │  │
│  │                         │   │                              │  │
│  │  Witness-facing         │   │  Survivor-facing             │  │
│  └─────────────────────────┘   └──────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │            PLANE C — OFFLINE RESOURCE MAP                │    │
│  │  PMTiles base map (OSM) + NGO-signed resource bundles    │    │
│  │  Granaries · Water points · Underground shelters         │    │
│  │  Civilian-facing · Zero connectivity required            │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │               ANALYST DASHBOARD                          │    │
│  │  WorldMonitor conflict map + Witness evidence layer      │    │
│  │  For NGOs, investigators, ICC teams                      │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Plane A — Evidence Vault

Plane A implements the evidence capture, encryption, custody logging, and upload pipeline. Its primary design constraints are:

- **Offline-first:** all operations from capture through local storage must succeed without any network connection.
- **Evidence integrity:** SHA-256 hashes computed at the moment of capture; hash-chained custody log; server re-verification on ingestion.
- **Witness safety:** no plaintext evidence stored on device; panic purge available; no persistent identity binding.
- **Legal admissibility:** NIST IR 8387-aligned hash-and-custody approach; hybrid classical + post-quantum signatures for future-proof non-repudiation.

### 1.3 Plane B — Safe Information Layer

Plane B delivers time-limited, cryptographically signed information from trusted humanitarian publishers to survivors and civilians. Its primary design constraints are:

- **No targetable directory:** bulletins are framed as service information, never directives; no centralised routing.
- **Offline verification:** signature verification and expiry checking work without network access.
- **Publisher accountability:** short-lived certificates, revocation lists, multi-party key management.
- **Privacy:** token redemption generates aggregate counts only; no individual tracking.

### 1.4 Monorepo Structure

```
witness/
├── packages/
│   ├── crypto-core/          # @witness/crypto-core
│   │   └── src/
│   │       ├── hash.ts        # SHA-256 via Web Crypto API + hash-wasm
│   │       ├── encrypt.ts     # AES-256-GCM via Web Crypto API
│   │       ├── signing.ts     # ECDSA P-256 via Web Crypto API
│   │       ├── kdf.ts         # Argon2id via hash-wasm
│   │       ├── custody-log.ts # Hash-chained custody log
│   │       └── index.ts       # Package exports
│   ├── offline-map/          # @witness/offline-map (Phase 2)
│   │   └── src/
│   │       ├── pmtiles.ts     # PMTiles OPFS loader + MapLibre protocol handler
│   │       ├── resource-bundle.ts  # ResourceBundle signature verification
│   │       ├── map-store.ts   # IndexedDB persistence for bundles + tile metadata
│   │       └── index.ts       # Package exports
│   └── lora-dtn/             # @witness/lora-dtn (Phase 2)
│       └── src/
│           ├── serial-transport.ts  # Web Serial API transport (USB-C)
│           ├── ble-transport.ts     # Web Bluetooth API transport (BLE)
│           ├── packet.ts            # LoRaDTNPacket encode/decode + HMAC
│           ├── dtn-queue.ts         # IndexedDB outbound queue + seen_ids cache
│           └── index.ts             # Package exports
├── apps/
│   └── pwa/                  # @witness/pwa (Phase 2)
│       └── src/               # React + TypeScript + Vite
├── docs/
│   ├── architecture.md        # This document
│   └── threat-model.md        # STRIDE + LINDDUN threat model
├── package.json               # Monorepo root (pnpm workspaces)
└── pnpm-workspace.yaml
```

---

## 2. Data Object Model

All interfaces are defined in TypeScript. Types marked `// server-assigned` are added during server ingestion and are not present in the initial client-side object.

### 2.1 Evidence Blob

The `EvidenceBlob` is the primary storage unit. It contains only ciphertext — no plaintext media is stored at any layer.

```typescript
/** A per-chunk hash entry in the chunk manifest. */
interface ChunkHash {
  /** Zero-based chunk index. */
  index: number;
  /** SHA-256 hex digest of the plaintext chunk (computed before encryption). */
  plaintext_hash: string;
  /** Byte offset of this chunk in the original plaintext. */
  byte_offset: number;
  /** Length of this chunk in bytes. */
  byte_length: number;
}

/**
 * An encrypted media blob stored in OPFS (large files) or IndexedDB (small files).
 * All fields except blob_id and chunk_manifest are opaque to the storage layer.
 */
interface EvidenceBlob {
  /** Random, non-guessable UUID generated at capture. Never derived from content. */
  blob_id: string;
  /**
   * AES-256-GCM ciphertext. Includes the 16-byte GCM authentication tag
   * appended by the Web Crypto API (tagLength: 128).
   */
  ciphertext: ArrayBuffer;
  /**
   * 12-byte random IV used for AES-GCM encryption.
   * Stored separately from ciphertext to enable re-encryption if key rotated.
   */
  iv: Uint8Array;
  /**
   * For files larger than the chunk threshold (default: 2 MB),
   * the blob is split and each chunk is independently encrypted.
   * chunk_manifest records the SHA-256 hash of each plaintext chunk.
   */
  chunk_manifest?: ChunkHash[];
  /** MIME type of the original plaintext media (e.g. 'video/mp4', 'image/jpeg'). */
  media_type: string;
  /** Total byte length of the plaintext media. */
  plaintext_byte_length: number;
  /** Client-assigned creation timestamp (Unix ms). Corroborated by server on ingestion. */
  created_at: number;
}
```

### 2.2 Hash Receipt

A `HashReceipt` is generated immediately at capture and is the primary integrity instrument. It is the minimal artefact that can prove a file existed and was unmodified at a point in time.

```typescript
/**
 * Integrity receipt generated at the moment of capture.
 * This is the document that provides legal evidence of file integrity.
 */
interface HashReceipt {
  /** Must match EvidenceBlob.blob_id. */
  blob_id: string;
  /**
   * SHA-256 hex digest of the plaintext media, computed before encryption.
   * This is the canonical integrity reference for the evidence item.
   */
  media_hash: string;
  /**
   * Local device timestamp (Unix ms) at the moment of hash computation.
   * This is a witness claim, not a trusted timestamp; it is corroborated
   * against server ingestion time and network time protocols.
   */
  capture_time_claim: number;
  /**
   * ECDSA P-256 signature over the canonical form:
   * JSON.stringify({ blob_id, media_hash, capture_time_claim })
   * Signed by the device signing key.
   */
  device_signature: HybridSignature;
  /**
   * Server-signed receipt added on successful ingestion.
   * Contains server timestamp, server-assigned ingest_id, and server signature.
   * Null until upload and ingestion complete.
   */
  server_receipt?: ServerReceipt;
}

/** Server-assigned receipt, appended to HashReceipt after successful ingestion. */
interface ServerReceipt {
  /** Server-assigned ingestion identifier. */
  ingest_id: string;
  /** Server timestamp (Unix ms) at receipt of upload. */
  server_time: number;
  /** Server's re-verification of media_hash. Must match client-supplied value. */
  verified_hash: string;
  /**
   * Server's hybrid signature over:
   * JSON.stringify({ ingest_id, server_time, verified_hash, blob_id })
   */
  server_signature: HybridSignature;
}
```

### 2.3 Custody Event and Custody Log

The custody log is a hash-chained, append-only audit trail. It is the primary instrument for chain-of-custody documentation meeting international evidence standards.

```typescript
/** All valid event types in the custody lifecycle. */
type EventType =
  | 'captured'         // Media captured and hash computed
  | 'encrypted'        // Plaintext encrypted, ciphertext written to OPFS/IndexedDB
  | 'queued'           // Added to upload queue
  | 'transferred_p2p'  // Transferred to a second device via Wi-Fi Direct
  | 'exported_qr'      // Hash receipt exported as QR code
  | 'uploaded'         // Successfully received by server; server_receipt appended
  | 'purged';          // Blob deleted from local storage (panic purge or post-upload cleanup)

/**
 * A single immutable event in the custody chain.
 * Each event includes a hash of the previous event, forming a tamper-evident chain.
 */
interface CustodyEvent {
  type: EventType;
  /** Unix millisecond timestamp from device clock. */
  timestamp: number;
  /**
   * SHA-256 hex digest of the previous CustodyEvent's canonical JSON form.
   * The first event in a log uses the sentinel value 'GENESIS'.
   * Any modification to a prior event invalidates all subsequent prev_hash values.
   */
  prev_hash: string;
  /**
   * Optional structured metadata relevant to the event type.
   * Example: { "transfer_target_device_key_fingerprint": "ab12..." } for transferred_p2p.
   * No personal data stored in metadata.
   */
  metadata?: Record<string, string>;
}

/**
 * The complete custody log for a single evidence item.
 * Stored encrypted in IndexedDB alongside the EvidenceBlob.
 */
interface CustodyLog {
  /** Must match EvidenceBlob.blob_id and HashReceipt.blob_id. */
  evidence_id: string;
  /** Ordered array of events; append-only. */
  events: CustodyEvent[];
}
```

### 2.4 Signed Bulletin (Plane B)

```typescript
/** A single service update within a bulletin. */
interface ServiceUpdate {
  /** Human-readable service name (e.g. 'Emergency clinic — North sector'). */
  service_name: string;
  /** Current availability status. */
  status: 'open' | 'limited' | 'closed' | 'unknown';
  /**
   * Optional contact information. No precise GPS coordinates stored here by default.
   * Location expressed as a named area or grid reference, not lat/lon.
   */
  contact_info?: string;
  /** ISO 639-1 language code for this update. */
  language: string;
}

/**
 * A time-limited, cryptographically signed bulletin issued by a trusted NGO publisher.
 * Designed for offline verification — no network call required to validate.
 */
interface SignedBulletin {
  /** Unique identifier for this bulletin instance. Random UUID. */
  bulletin_id: string;
  /**
   * Publisher identifier — the SHA-256 fingerprint of the publisher's public key.
   * Used to look up the publisher's entry in the local trust bundle.
   */
  publisher_id: string;
  /** Bulletin validity window start (Unix ms). */
  valid_from: number;
  /**
   * Bulletin validity window end (Unix ms).
   * Short-lived: typically 6–24 hours. Devices reject expired bulletins.
   */
  valid_to: number;
  /**
   * Safety status phase. Semantics defined by the Plane B governance framework.
   * 'green' = normal operations | 'amber' = elevated caution | 'red' = active emergency.
   */
  phase: 'green' | 'amber' | 'red';
  /** Service updates included in this bulletin. Maximum 10 entries. */
  service_updates: ServiceUpdate[];
  /**
   * Hybrid ECDSA P-256 + ML-DSA-65 signature over the canonical bulletin payload:
   * JSON.stringify({ bulletin_id, publisher_id, valid_from, valid_to, phase, service_updates })
   */
  signature: HybridSignature;
}
```

### 2.5 Redeemable Token

```typescript
/**
 * A one-time-use service access token issued by a trusted publisher.
 * Encoded as a QR code for offline redemption at service sites.
 */
interface RedeemableToken {
  /** Random UUID. Non-guessable, non-sequential. */
  token_id: string;
  /** References the SignedBulletin that authorised this token's issuance. */
  bulletin_id: string;
  /** Publisher identifier (SHA-256 fingerprint of publisher public key). */
  publisher_id: string;
  /**
   * Service category this token grants access to.
   * E.g. 'clinic_triage' | 'transport_seat' | 'shelter_registration'
   */
  service_type: string;
  /**
   * Minimal eligibility claims. Categorical only — no personal data.
   * E.g. ['adult', 'unaccompanied_minor', 'medical_urgent']
   */
  eligibility_claims: string[];
  /** Token expiry (Unix ms). Must fall within the issuing bulletin's valid_to window. */
  expiry: number;
  /** Whether this token can be redeemed only once. Always true in current design. */
  one_time_use: true;
  /**
   * Hybrid signature over:
   * JSON.stringify({ token_id, bulletin_id, publisher_id, service_type,
   *                  eligibility_claims, expiry, one_time_use })
   */
  signature: HybridSignature;
}
```

### 2.6 Resource Location and Resource Bundle (Plane C)

```typescript
/** Types of civilian resources displayed on the offline map. */
type ResourceType =
  | 'granary'            // Food / grain storage accessible to civilians
  | 'water_point'        // Safe drinking water access
  | 'underground_shelter'// Below-ground civilian shelter
  | 'surface_shelter'    // Above-ground protected shelter
  | 'clinic'             // Medical access point
  | 'transit_corridor';  // Safe movement route (represented as a line feature)

/** Operational status of a resource location. */
type ResourceStatus = 'open' | 'limited' | 'closed' | 'unknown';

/**
 * A single mappable civilian resource point.
 * Coordinates are WGS-84 decimal degrees.
 */
interface ResourceLocation {
  /** Stable identifier for this resource. Random UUID assigned by publisher. */
  resource_id: string;
  type: ResourceType;
  status: ResourceStatus;
  /** WGS-84 latitude, decimal degrees. */
  lat: number;
  /** WGS-84 longitude, decimal degrees. */
  lon: number;
  /**
   * Optional display label — icon-first; leave empty to render icon only.
   * E.g. 'North sector food store'. No precise address or names of custodians.
   */
  label?: string;
  /**
   * Approximate capacity or quantity indicator. Deliberately imprecise to
   * avoid creating actionable targeting intelligence about stockpile sizes.
   */
  capacity_hint?: 'low' | 'medium' | 'high';
  /**
   * Unix ms timestamp when this location was last verified by the publisher.
   * Devices display a staleness warning if age exceeds publisher-defined threshold.
   */
  last_verified: number;
  /**
   * Unix ms expiry. Resource marker is hidden from the map after this time.
   * Typically 6–48 hours, aligned with the parent ResourceBundle.
   */
  expires_at: number;
}

/**
 * A signed bundle of resource locations issued by a trusted NGO publisher.
 * Verified offline using the same HybridSignature mechanism as SignedBulletin.
 * Stored in IndexedDB; signature is re-verified before every map render.
 */
interface ResourceBundle {
  /** Random UUID. */
  bundle_id: string;
  /** Publisher identifier — SHA-256 fingerprint of publisher public key. */
  publisher_id: string;
  /** Bundle validity start (Unix ms). */
  valid_from: number;
  /**
   * Bundle validity end (Unix ms). Typically 6–48 hours.
   * Devices reject and remove expired bundles automatically.
   */
  valid_to: number;
  /** Geographic bounding box covered by this bundle (WGS-84 decimal degrees). */
  bounding_box: {
    north: number;
    east: number;
    south: number;
    west: number;
  };
  /** The resource points included in this bundle. */
  resources: ResourceLocation[];
  /**
   * Hybrid ECDSA P-256 + ML-DSA-65 signature over the canonical bundle payload:
   * JSON.stringify({ bundle_id, publisher_id, valid_from, valid_to,
   *                  bounding_box, resources })
   * Both signatures must verify for the bundle to be accepted.
   */
  signature: HybridSignature;
}
```

### 2.7 Hybrid Signature

Every signing operation in the system produces a `HybridSignature`. Both the classical (ECDSA P-256) and post-quantum (ML-DSA-65) signatures must independently verify for the signature to be considered valid.

```typescript
/**
 * A combined classical + post-quantum signature.
 * Both signatures MUST verify for the payload to be accepted.
 * This design provides security under the assumption that at most one
 * of the two signature schemes is broken.
 */
interface HybridSignature {
  /**
   * ECDSA P-256 signature over SHA-256(payload), encoded as base64url.
   * Produced via Web Crypto API: crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, ...)
   */
  ecdsa_p256: string;
  /**
   * ML-DSA-65 signature over the same payload, encoded as base64url.
   * Produced via @noble/post-quantum ml_dsa.sign()
   * ML-DSA-65 is a NIST FIPS 204 post-quantum digital signature standard.
   */
  ml_dsa_65: string;
  /** Key identifier: SHA-256 fingerprint of the public key that produced this signature. */
  key_id: string;
}
```

---

## 3. Cryptographic Operations

All cryptographic operations are performed client-side within the browser's JavaScript sandbox. Server-side cryptographic operations are documented separately in Section 7.

### 3.1 Cryptographic Primitive Summary

| Operation | Algorithm | Implementation | Key Size | Notes |
|---|---|---|---|---|
| File hashing | SHA-256 | Web Crypto API `crypto.subtle.digest` | N/A | NIST IR 8387-aligned |
| Streaming hash | SHA-256 | hash-wasm `createSHA256` | N/A | For files too large to buffer |
| Symmetric encryption | AES-256-GCM | Web Crypto API `crypto.subtle.encrypt` | 256-bit | 12-byte random IV; 128-bit auth tag |
| Symmetric decryption | AES-256-GCM | Web Crypto API `crypto.subtle.decrypt` | 256-bit | Auth tag verification built-in |
| Classical signing | ECDSA P-256 | Web Crypto API `crypto.subtle.sign` | P-256 curve | SHA-256 digest of payload |
| Classical verification | ECDSA P-256 | Web Crypto API `crypto.subtle.verify` | P-256 curve | — |
| Post-quantum signing | ML-DSA-65 | @noble/post-quantum `ml_dsa.sign` | NIST FIPS 204 level 3 | Hybrid pair with ECDSA |
| Post-quantum verification | ML-DSA-65 | @noble/post-quantum `ml_dsa.verify` | NIST FIPS 204 level 3 | Both must verify |
| Key derivation | Argon2id | hash-wasm `argon2id` | 256-bit output | OWASP parameters |
| Random IV generation | CSPRNG | Web Crypto API `crypto.getRandomValues` | 96-bit (12 bytes) | Per-encryption |
| Random salt generation | CSPRNG | Web Crypto API `crypto.getRandomValues` | 128-bit (16 bytes) | Per-passphrase |

### 3.2 Hashing

SHA-256 is used for all file integrity operations. Two implementation paths exist depending on file size and streaming requirements:

**Single-buffer hashing** (files up to ~100 MB that fit in memory):
```
data: ArrayBuffer
  → crypto.subtle.digest('SHA-256', data)
  → hex-encoded string
```

**Streaming hashing** (large files, LoRa/satellite chunked transfers):
```
chunks: AsyncIterable<Uint8Array>
  → hash-wasm createSHA256() hasher
  → hasher.init()
  → for each chunk: hasher.update(chunk)
  → hasher.digest('hex')
```

Hex encoding is done via a constant-time byte-by-byte implementation to avoid timing side channels on hash comparison.

### 3.3 AES-256-GCM Encryption

All encryption operations use AES-256-GCM with a 12-byte (96-bit) random IV and a 128-bit authentication tag. The authentication tag is appended to the ciphertext by the Web Crypto API.

**Key generation:**
```
crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 },
  extractable: true,
  keyUsages: ['encrypt', 'decrypt']
)
```

**Encryption:**
```
iv = crypto.getRandomValues(new Uint8Array(12))  // 96-bit random IV
ciphertext = crypto.subtle.encrypt(
  { name: 'AES-GCM', iv, tagLength: 128 },
  key,
  plaintext: ArrayBuffer
)
// ciphertext includes 16-byte authentication tag appended
```

**IV handling:** The IV is stored separately from the ciphertext. It is not secret but is required for decryption. It is stored alongside the encrypted blob in IndexedDB and transmitted with the upload.

### 3.4 ECDSA P-256 Signing

Device signing keys are ECDSA P-256 key pairs. Key generation produces an extractable key pair; the private key is exported as PKCS#8 and wrapped under the device master key before being stored.

**Key generation:**
```
crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  extractable: true,
  keyUsages: ['sign', 'verify']
)
```

**Signing:**
```
signature = crypto.subtle.sign(
  { name: 'ECDSA', hash: 'SHA-256' },
  privateKey,
  data: ArrayBuffer
)
```

**Verification:**
```
valid = crypto.subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  publicKey,
  signature: ArrayBuffer,
  data: ArrayBuffer
)
```

### 3.5 ML-DSA-65 Post-Quantum Signing

ML-DSA-65 (formerly Dilithium3) is a lattice-based digital signature scheme standardised as NIST FIPS 204. It is used in conjunction with ECDSA P-256 in every signing operation, forming the `HybridSignature` type.

**Library:** `@noble/post-quantum` version `^0.2.1`

**Key sizes:**
- Public key: 1,952 bytes
- Private key: 4,032 bytes
- Signature: 3,309 bytes

**Security level:** NIST Level 3 — approximately 128-bit classical / 128-bit quantum security.

**Signing:**
```typescript
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa';
const signature = ml_dsa65.sign(privateKey, message);
```

**Verification:**
```typescript
const valid = ml_dsa65.verify(publicKey, message, signature);
```

### 3.6 Hybrid Signature Construction and Verification

A `HybridSignature` is produced by signing the same payload with both schemes. Both signatures are required to be valid for any verification to succeed.

**Construction:**
```
payload = ArrayBuffer  // typically canonical JSON encoded as UTF-8 bytes
ecdsa_sig = crypto.subtle.sign(ECDSA_P256_PARAMS, ecdsaPrivKey, payload)
ml_dsa_sig = ml_dsa65.sign(mlDsaPrivKey, payload)

HybridSignature {
  ecdsa_p256: base64url(ecdsa_sig),
  ml_dsa_65: base64url(ml_dsa_sig),
  key_id: sha256(ecdsaPublicKey)  // both keys share the same key_id namespace
}
```

**Verification (both must pass):**
```
ecdsa_valid = crypto.subtle.verify(ECDSA_P256_PARAMS, ecdsaPubKey,
                                    base64url_decode(sig.ecdsa_p256), payload)
ml_dsa_valid = ml_dsa65.verify(mlDsaPubKey, payload,
                                base64url_decode(sig.ml_dsa_65))
return ecdsa_valid AND ml_dsa_valid
```

If either verification fails, the signature is rejected. This ensures the system is secure as long as at least one of the two schemes remains unbroken.

### 3.7 Key Derivation — Argon2id

When a passphrase is used to protect the device master key (optional; hardware-backed storage is preferred), the passphrase is processed through Argon2id with the following parameters, aligned with OWASP password hashing recommendations:

```typescript
const KDF_PARAMS = {
  memory:      19456,   // 19 MiB
  iterations:  2,       // 2 passes
  parallelism: 1,       // 1 lane
  hashLength:  32,      // 256-bit output
} as const;
```

These parameters are designed to be feasible on constrained mobile hardware (approximately 100–400ms on mid-range devices) while providing meaningful resistance to GPU-accelerated brute-force attacks.

**Salt:** 16 bytes (128-bit) randomly generated per device installation. Stored in IndexedDB alongside the wrapped key.

**Output:** 32 bytes used directly as the raw material for an AES-256-GCM key via `crypto.subtle.importKey('raw', ...)`.

---

## 4. Storage Architecture

### 4.1 Storage Layer Overview

```
┌────────────────────────────────────────────────────────┐
│                  APPLICATION LAYER                     │
│    All data encrypted before reaching storage layer    │
└─────────────────────────┬──────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
┌─────────────────────┐       ┌────────────────────────┐
│       OPFS          │       │       IndexedDB         │
│                     │       │                         │
│  Large encrypted    │       │  Metadata               │
│  media blobs        │       │  Custody logs           │
│  (> 2 MB)           │       │  Upload queue state     │
│                     │       │  Key material (wrapped) │
│  Origin-isolated    │       │  Trust bundle cache     │
│  Not accessible to  │       │  Bulletin cache         │
│  other origins      │       │  Token redemption state │
└─────────────────────┘       └────────────────────────┘
```

### 4.2 OPFS (Origin Private File System)

OPFS is used for large encrypted media blobs (threshold configurable; default 2 MB). OPFS provides:

- **Origin isolation:** only the Witness PWA origin can read/write its OPFS files.
- **Synchronous access from workers:** synchronous file handles available in dedicated workers, enabling streaming without blocking the main thread.
- **Quota management:** subject to browser storage quota; pre-checked before capture.

**File naming convention:** `evidence/{blob_id}.enc` — opaque, non-descriptive filenames. No metadata in filenames.

**What is stored in OPFS:**
- `EvidenceBlob.ciphertext` as a `.enc` file
- Nothing else — all metadata remains in IndexedDB

### 4.3 IndexedDB

IndexedDB stores all structured data. All fields containing any sensitive information are encrypted at the application layer before the IndexedDB write.

**Object stores:**

| Store Name | Primary Key | Encrypted | Contents |
|---|---|---|---|
| `evidence_blobs` | `blob_id` | Yes (metadata fields) | `EvidenceBlob` record minus ciphertext (ciphertext in OPFS for large files) |
| `hash_receipts` | `blob_id` | Yes | `HashReceipt` objects |
| `custody_logs` | `evidence_id` | Yes | `CustodyLog` objects |
| `upload_queue` | `blob_id` | Yes | Upload queue entries with retry state |
| `wrapped_keys` | `key_id` | N/A (key material is already wrapped) | Argon2id-wrapped device keys |
| `trust_bundle` | `publisher_id` | No (public data) | Publisher public keys and certificate metadata |
| `bulletin_cache` | `bulletin_id` | No (public data, signature-protected) | Cached `SignedBulletin` objects |
| `token_state` | `token_id` | No | Redemption state for issued tokens |

### 4.4 Key Hierarchy

```
                    ┌─────────────────────────┐
                    │   Device Master Key      │
                    │   (AES-256-GCM)          │
                    │   Generated at install   │
                    │   Stored in Web Crypto   │
                    │   key storage            │
                    └────────────┬────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
         ┌──────────▼──────────┐   ┌──────────▼──────────┐
         │  Per-Evidence Keys  │   │  Device Signing Key  │
         │  (AES-256-GCM)      │   │  (ECDSA P-256)       │
         │  One per blob_id    │   │  One per device      │
         │  Wrapped under      │   │  Private key wrapped │
         │  master key         │   │  under master key    │
         └─────────────────────┘   └─────────────────────┘

Optional passphrase path:
         ┌─────────────────────┐
         │  Passphrase         │
         │  + Argon2id salt    │
         │  → Argon2id KDF     │
         │  → Wrapping Key     │
         │  → Wraps Master Key │
         └─────────────────────┘
```

**Key storage properties:**

- The device master key is generated using `crypto.subtle.generateKey` and ideally stored as a non-extractable `CryptoKey` object in the browser's internal key storage (where the browser supports hardware-backed key storage, the key may be hardware-bound).
- When passphrase protection is enabled, the master key is exported as raw bytes, encrypted under the Argon2id-derived wrapping key (AES-256-GCM), and the resulting ciphertext is stored in IndexedDB. The master key `CryptoKey` is re-imported from the decrypted raw bytes at each session.
- Per-evidence keys are generated fresh for each capture, wrapped under the master key, and stored alongside the evidence metadata in IndexedDB.

---

## 5. Upload and Sync

### 5.1 tus Resumable Upload Protocol

Uploads use the **tus v1.0.0** resumable upload protocol. This protocol is designed for unreliable networks and supports resuming interrupted uploads from the last acknowledged byte offset.

**Upload flow:**
```
1. POST /files — Create upload resource on server
   Request: Content-Length, Upload-Length, Tus-Resumable: 1.0.0
   Response: Location: /files/{upload_id}

2. PATCH /files/{upload_id} — Upload chunk(s)
   Request: Content-Type: application/offset+octet-stream
            Upload-Offset: {current_offset}
            Body: encrypted chunk bytes

3. On interruption: HEAD /files/{upload_id}
   Response: Upload-Offset: {last_acknowledged_offset}

4. Resume: PATCH /files/{upload_id} with Upload-Offset: {resumed_from}

5. On completion: server ingestion triggered (see Section 7)
```

### 5.2 Chunk-Level Encryption

For large files, the plaintext is split into chunks before encryption. Each chunk is independently encrypted with a unique IV derived from the per-evidence key. This enables:

- Resumable uploads without decrypting the entire file on retry.
- Verification of individual chunks on server ingestion.
- Partial evidence recovery if only some chunks are uploaded before network loss.

**Chunk size:** 2 MB (configurable at build time; must match server-side expectation).

```
Chunk i:
  iv_i = HKDF(per_evidence_key, info='chunk' || i, length=12)
  ciphertext_i = AES-256-GCM(per_evidence_key, iv_i, plaintext_i)
  chunk_hash_i = SHA-256(plaintext_i)  // stored in ChunkHash manifest
```

### 5.3 Background Sync API

The Background Sync API (via Service Worker) enables deferred uploads. When the network is unavailable:

1. The encrypted blob is stored in the upload queue in IndexedDB with status `queued`.
2. A `sync` event tag is registered: `sync-evidence-upload`.
3. When the browser detects network connectivity, it fires the `sync` event.
4. The service worker processes the upload queue, attempting uploads in order.

**Retry strategy:** Exponential backoff with jitter.

```
base_delay = 30_000ms  // 30 seconds
max_delay = 3_600_000ms  // 1 hour
jitter_factor = 0.2  // ±20% random jitter

delay(attempt) = min(base_delay * 2^attempt, max_delay) * (1 + random(-jitter, +jitter))
```

**Battery awareness:** Background sync is paused when `navigator.getBattery().level < 0.20` and `charging === false`.

### 5.4 Upload Queue State Machine

```
         ┌─────────┐
         │ QUEUED  │──────────────────────────────────────────────┐
         └────┬────┘                                              │
              │ sync event fired                                  │
              ▼                                                   │
         ┌──────────────┐                                         │
         │ UPLOADING    │                                         │
         └──────┬───────┘                                         │
                │                                                 │
    ┌───────────┴──────────────────┐                              │
    │                              │                              │
    ▼                              ▼                              │
┌─────────┐                 ┌──────────────┐                      │
│COMPLETE │                 │    FAILED    │──── retry after ─────┘
│(purge   │                 │(increment    │     backoff delay
│local    │                 │ retry count) │     (max 10 retries)
│blob)    │                 └──────────────┘
└─────────┘
```

---

## 6. Transfer Channels

The five offline transfer channels, in order of payload capacity:

| Channel | Payload Capacity | Connectivity Requirement | Metadata Risk | Primary Use Case |
|---|---|---|---|---|
| **PWA service worker cache + IndexedDB** | Medium–Large (MBs to GBs, subject to storage quota) | None — fully offline after initial install | Medium (IP on install; none thereafter) | Primary evidence storage, upload queue, app shell offline availability |
| **QR air-gap transfer** | Small (~2,900 bytes per QR code; multi-QR for larger payloads) | None — optical transfer between devices | Low–Medium (device proximity visible to observer) | Hash receipts, signed tokens, trust bundle fragments, small key material |
| **Wi-Fi Direct / P2P (Nearby Connections API)** | Large (any file size; limited by transfer time) | None — device-to-device radio only | Medium–High (Wi-Fi probe frames visible; device presence revealed) | Moving encrypted blobs from witness device to exfiltration helper device |
| **LoRa DTN mesh** | Tiny–Small (250 bytes/packet at SF12; ~1 KB effective payload per hop) | None — LoRa companion hardware required (USB-C or BLE-connected board) | Low–Medium (RF emissions detectable; node density reveals activity) | Multi-hop store-and-forward escape network; hash receipts hop device-to-device until a connected node exfiltrates to server |
| **Satellite terminal** | Medium (Iridium SBD: 340 bytes/message; VSAT: MB+) | Satellite hardware required | Medium (uplink detectable; IP of ground station exposed) | Hash receipts via Iridium SBD; full blob upload via VSAT when available |

**Notes on metadata risk:**
- "Metadata risk" refers to the risk that using the channel reveals the witness's presence, location, or activity to an adversary.
- QR transfer requires physical proximity and line-of-sight, which is low-risk in most scenarios but reveals that two devices are exchanging data.
- Wi-Fi Direct probe frames expose the device's MAC address (unless MAC randomisation is active, which is default on Android 10+ and iOS 14+).
- LoRa RF emissions are detectable with RF monitoring equipment; the transmission pattern and timing may be analysed.
- LoRa mesh node density in an area may reveal civilian activity to an adversary with RF monitoring capability.

### 6.2 LoRa DTN Mesh — Design Detail

The LoRa channel is designed as a **Delay-Tolerant Network (DTN)** with epidemic store-and-forward routing. It solves the core problem: a witness device cannot reach the internet, and may never be able to — but data can still escape if other devices form a relay chain toward any node with eventual connectivity.

**The model:**
```
[Witness Phone A]──BLE/USB──[LoRa Node A]
                                   │ LoRa RF
                             [LoRa Node B] ← carried by a person moving away from conflict zone
                                   │ LoRa RF
                             [LoRa Node C]
                                   │ LoRa RF
                             [LoRa Node D] ← this node has intermittent satellite or cellular
                                   │
                             [Server / ingestion endpoint]
                                   │
                             [Hash receipt confirmed]
```

No single path is required. Any node that receives the packet and later gains connectivity — or passes it to another node that does — can complete the delivery. This is **epidemic routing**: the packet spreads outward until absorbed by a connected node.

**Hardware requirement:**

LoRa is not built into smartphones. Users require a small companion device:

| Device | Connection | Cost | Notes |
|---|---|---|---|
| Heltec WiFi LoRa 32 | USB-C or BLE | ~$20–35 | Arduino-based; open hardware |
| TTGO T-Beam | USB-C or BLE | ~$25–40 | Includes GPS; useful for geotag-free relay |
| RAK WisBlock | BLE | ~$30–50 | Modular; lower power draw |
| Meshtastic-compatible device | BLE | ~$20–50 | Any Meshtastic-supported board |

The PWA communicates with the companion device via Web Bluetooth API (BLE) or Web Serial API (USB-C). The companion device handles all RF operations.

**Packet format:**

Each LoRa packet carries a minimal, self-contained payload. Full encrypted blobs are never transmitted over LoRa — only the `HashReceipt` (the tamper-proof fingerprint). This keeps each packet under ~1 KB.

```
LoRaDTNPacket {
  version:     uint8          // Protocol version; currently 1
  packet_id:   bytes[8]       // Random 8-byte ID; used for deduplication
  hop_count:   uint8          // Incremented at each relay; dropped if > MAX_HOPS (default: 7)
  payload_type: uint8         // 0x01 = HashReceipt | 0x02 = TrustBundleFragment | 0x03 = ResourceBundle
  payload:     bytes[≤200]    // Compressed, encrypted payload (see below)
  hmac:        bytes[8]       // Truncated HMAC-SHA256 over (packet_id || hop_count || payload)
                              // Prevents relay nodes injecting or mutating packets
}
```

**Payload encoding for HashReceipt (~estimated compressed size: 150–220 bytes):**
```
media_hash:        32 bytes   // SHA-256 of plaintext media
blob_id:            8 bytes   // First 8 bytes of UUID (sufficient for dedup)
capture_time:       4 bytes   // Unix timestamp, uint32
ecdsa_sig:         64 bytes   // ECDSA P-256 signature (raw r||s, not DER)
ml_dsa_sig_prefix: 32 bytes   // First 32 bytes of ML-DSA-65 sig (truncated for size)
key_id:            16 bytes   // Publisher/device key fingerprint (first 16 bytes)
                  ─────────
Total:            156 bytes   // Fits in a single LoRa packet at SF12/BW125
```

Note: the truncated ML-DSA-65 signature is a bandwidth compromise. The full ML-DSA-65 signature (3,309 bytes) is stored locally and uploaded via any higher-bandwidth channel when available. The truncated prefix in the LoRa packet proves the signing key was used without transmitting the full signature.

**Routing protocol — epidemic with deduplication:**

```
On receive(packet):
  if packet.hop_count > MAX_HOPS → discard
  if packet.packet_id in seen_packet_ids → discard (already relayed)
  if hmac_verify(packet) == false → discard
  store packet in local DTN buffer (max 50 packets, FIFO eviction)
  add packet.packet_id to seen_packet_ids (rolling window of 200 IDs)
  increment packet.hop_count
  rebroadcast(packet) after random_delay(0–5s)  // jitter reduces collision storms
  if self has internet connectivity:
    forward payload to ingestion endpoint via HTTPS
    mark packet as delivered (stop rebroadcasting)
```

**Security properties of the mesh:**

| Property | Implementation |
|---|---|
| Packet integrity | HMAC-SHA256 (truncated) over packet body; relay nodes cannot mutate payload |
| Evidence authenticity | ECDSA signature in payload; server verifies full signature on ingestion (full sig uploaded separately when bandwidth allows) |
| No identity in packet | `blob_id` is a random UUID; `key_id` is a key fingerprint, not a person identifier |
| Replay resistance | `packet_id` deduplication at every node; `capture_time` checked against server time on ingestion |
| Adversarial relay | A malicious relay node can drop packets (denial of service) but cannot forge or modify evidence — the ECDSA signature will fail on server ingestion |
| RF detectability | LoRa transmissions are detectable. The packet content is encrypted and integrity-protected but the fact of transmission is visible to RF monitoring. Users should be aware of this risk. |

**PWA integration:**

The PWA connects to the companion LoRa device via Web Bluetooth (BLE) or Web Serial (USB-C):

```
@witness/lora-dtn  (new package, Phase 2)
├── serial-transport.ts    Web Serial API transport (USB-C connection)
├── ble-transport.ts       Web Bluetooth API transport (BLE connection)
├── packet.ts              LoRaDTNPacket encode/decode + HMAC verification
├── dtn-queue.ts           IndexedDB store for outbound packet queue + seen_ids cache
└── index.ts               exports: LoRaTransport, enqueuHashReceipt, DTNQueue
```

The `enqueueHashReceipt()` function takes a `HashReceipt` from `@witness/crypto-core`, encodes it into a `LoRaDTNPacket`, stores it in the DTN queue in IndexedDB, and sends it to the companion device for immediate broadcast. If the device is not connected, the packet remains queued and is sent when a device connects.

---

## 7. Backend Ingestion

### 7.1 Ingestion Pipeline

```
[tus upload complete]
         │
         ▼
[Hash re-verification]
  Compute SHA-256 of received ciphertext chunks
  Compare against client-supplied media_hash in HashReceipt
  Reject if mismatch → 409 Conflict with error detail

         │
         ▼
[Chunk manifest verification]
  Verify each chunk_hash in ChunkHash[] matches received chunk
  Reject if any chunk fails → 422 Unprocessable Entity

         │
         ▼
[Signature verification]
  Decode HybridSignature from HashReceipt.device_signature
  Verify ECDSA P-256 signature against device public key
  Verify ML-DSA-65 signature against device ML-DSA public key
  Both MUST verify → reject if either fails → 401 Unauthorized

         │
         ▼
[Write to PostgreSQL custody log]
  INSERT INTO custody_log (ingest_id, blob_id, evidence_id,
    media_hash, device_key_id, ingest_time, client_time_claim,
    chunk_count, byte_length)
  Table is append-only: no UPDATE, no DELETE privileges for app user

         │
         ▼
[Write to S3-compatible blob storage]
  Key: evidence/{ingest_id}/{blob_id}.enc
  Metadata: { ingest_id, media_hash, content_type }
  Body: encrypted blob bytes (already encrypted client-side)

         │
         ▼
[Sign server receipt]
  server_receipt = {
    ingest_id,
    server_time: Date.now(),
    verified_hash: media_hash,
    blob_id
  }
  server_signature = HybridSign(server_signing_key, canonical(server_receipt))

         │
         ▼
[Return 201 Created]
  Body: { ingest_id, server_receipt }
  Client appends server_receipt to local HashReceipt
  Client appends 'uploaded' CustodyEvent to local CustodyLog
```

### 7.2 PostgreSQL Custody Log Schema

```sql
CREATE TABLE custody_log (
  id              BIGSERIAL PRIMARY KEY,
  ingest_id       UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  blob_id         UUID        NOT NULL,
  evidence_id     UUID        NOT NULL,
  -- SHA-256 hex digest of plaintext media, as supplied by client and re-verified on server
  media_hash      CHAR(64)    NOT NULL,
  -- SHA-256 fingerprint of the device's ECDSA P-256 public key
  device_key_id   CHAR(64)    NOT NULL,
  -- Server-assigned ingestion timestamp; authoritative for evidence timeline
  ingest_time     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Client-supplied capture time claim; corroborative, not authoritative
  client_time_claim BIGINT    NOT NULL,
  chunk_count     INTEGER     NOT NULL DEFAULT 1,
  byte_length     BIGINT      NOT NULL,
  -- Server's hybrid signature over the receipt payload
  server_signature_ecdsa   TEXT NOT NULL,
  server_signature_mldsa   TEXT NOT NULL,
  -- Prevent future modification at DB level
  CONSTRAINT no_update CHECK (TRUE)  -- enforced via REVOKE UPDATE from app role
);

-- Append-only enforcement: application role has INSERT only
REVOKE UPDATE, DELETE ON custody_log FROM witness_ingestion_role;
GRANT INSERT, SELECT ON custody_log TO witness_ingestion_role;

-- Index for investigator queries
CREATE INDEX idx_custody_log_evidence_id ON custody_log (evidence_id);
CREATE INDEX idx_custody_log_ingest_time ON custody_log (ingest_time);
CREATE INDEX idx_custody_log_device_key_id ON custody_log (device_key_id);
```

### 7.3 S3 Blob Storage Layout

```
s3://witness-vault/
└── evidence/
    └── {ingest_id}/
        └── {blob_id}.enc      # AES-256-GCM encrypted blob
```

Blobs are stored with server-side encryption enabled at the S3 layer (SSE-S3 or SSE-KMS) as an additional defence-in-depth measure. This is separate from and in addition to the client-side AES-256-GCM encryption.

**Bucket policies:**
- Public access: disabled.
- Presigned URLs issued by ingestion service for investigator download, with 1-hour expiry.
- Lifecycle policy: no automatic deletion (evidence must be retained indefinitely).

---

## 8. Trust Model

### 8.1 Device Key

| Property | Value |
|---|---|
| Algorithm | ECDSA P-256 (signing) + ML-DSA-65 (post-quantum signing) |
| Generation | `crypto.subtle.generateKey` on first PWA launch |
| Storage | Web Crypto key storage (non-exportable in hardened mode); wrapped under Argon2id-derived key when passphrase is set |
| Identity binding | None — device keys are not registered against witness identity |
| Purpose | Signs `HashReceipt` to establish evidence integrity; not used for authentication |
| Lifecycle | Persists across sessions; cleared on panic purge; no revocation mechanism (by design — revocation would require identity registry) |

### 8.2 Publisher Keys (Plane B)

| Property | Value |
|---|---|
| Algorithm | ECDSA P-256 + ML-DSA-65 hybrid |
| Issuance | Multi-party managed; requires sign-off from governance committee |
| Certificate validity | Maximum 90 days; typically 30 days |
| Distribution | Trust bundle distributed via PWA update, P2P sync, printed QR, and official partner websites |
| Revocation | Revocation list distributed in trust bundle updates; devices check revocation on bulletin verification |
| Governance | See Section 10 |

### 8.3 Server Signing Key

| Property | Value |
|---|---|
| Algorithm | ECDSA P-256 + ML-DSA-65 hybrid |
| Purpose | Signs server receipts returned to clients after successful ingestion |
| Storage | Hardware Security Module (HSM) in production; key never in application memory |
| Rotation | Annual rotation; previous key retained for verification of historical receipts |
| Separation | Server signing key is separate from all storage encryption keys |

### 8.4 Evidence DAO — Threshold MPC

For sensitive metadata (precise GPS coordinates, witness identity claims where voluntarily provided):

| Property | Value |
|---|---|
| Scheme | M-of-N threshold secret sharing (Shamir's Secret Sharing) |
| Default parameters | 3-of-5 (3 keyholders must collaborate to decrypt) |
| Key custodians | Independent organisations: ICC OTP, trusted NGO, independent human rights monitor, technical operator, backup custodian |
| Access protocol | Documented access request process; dual authorisation required; access logged |
| Auditing | All access requests and responses logged in append-only audit trail |

---

## 9. Key Management

### 9.1 Key Lifecycle

```
GENERATION
  Device keys: generated at first PWA install via crypto.subtle.generateKey
  Publisher keys: generated in air-gapped ceremony, multi-party witnessed
  Server keys: generated in HSM, never extractable in plaintext

          ↓

DISTRIBUTION
  Device keys: stored locally; public key transmitted with first upload
  Publisher keys: public keys distributed via trust bundle
  Server keys: public key published in trust bundle and on official website

          ↓

USE
  Device keys: sign HashReceipt at each capture
  Publisher keys: sign bulletins and tokens at issuance
  Server keys: sign ingestion receipts

          ↓

STORAGE
  Device private keys: wrapped under master key in IndexedDB
  Publisher private keys: HSM or air-gapped hardware key (publisher-managed)
  Server private keys: HSM (never in application memory)

          ↓

ROTATION
  Device keys: on explicit user request or after panic purge
  Publisher keys: at certificate expiry (max 90 days) or on suspected compromise
  Server keys: annually or on suspected compromise

          ↓

REVOCATION
  Device keys: no revocation (no identity registry; by design)
  Publisher keys: revocation list in trust bundle; immediate effect on next bundle sync
  Server keys: new trust bundle issued immediately; clients verify on next connection

          ↓

DESTRUCTION
  Device keys: cleared on panic purge; cleared on IndexedDB wipe
  Publisher keys: hardware key destruction ceremony; documented
  Server keys: HSM key destruction; documented
```

### 9.2 Trust Bundle Format

The trust bundle is a signed JSON document distributed to all Witness clients. It contains the set of currently authorised publisher public keys and the current server public key.

```typescript
interface TrustBundle {
  /** Version number of this trust bundle. Monotonically increasing. */
  version: number;
  /** Bundle validity window (Unix ms). Clients reject bundles outside this window. */
  valid_from: number;
  valid_to: number;
  /** List of currently authorised publishers. */
  publishers: PublisherEntry[];
  /** Server's current signing public keys. */
  server_keys: ServerKeyEntry[];
  /** CRL: publisher IDs whose keys have been revoked since the previous bundle. */
  revoked_publisher_ids: string[];
  /**
   * Signature over canonical(bundle minus this field).
   * Signed by the trust bundle signing key (held by governance committee).
   */
  bundle_signature: HybridSignature;
}

interface PublisherEntry {
  publisher_id: string;         // SHA-256 fingerprint of ECDSA public key
  display_name: string;         // Human-readable organisation name
  ecdsa_public_key: string;     // base64url-encoded SPKI
  ml_dsa_public_key: string;    // base64url-encoded ML-DSA-65 public key
  valid_from: number;
  valid_to: number;
  service_types: string[];      // Authorised service types for token issuance
}
```

---

## 10. Phase B Governance

### 10.1 Publisher Trust Framework

Publishers are humanitarian organisations authorised to issue signed bulletins and redeemable tokens. The trust framework defines who can become a publisher, what they are authorised to issue, and how they are held accountable.

**Publisher eligibility criteria:**
- Registered humanitarian organisation or UN agency.
- Operates in-country in the relevant conflict theatre.
- Has signed the Witness Publisher Agreement, committing to the issuance principles.
- Has undergone key management training.

**Publisher authorisation process:**
1. Application submitted to governance committee.
2. Due diligence review (minimum 14 days).
3. Multi-party key generation ceremony (at least two governance committee members present).
4. Publisher key added to next trust bundle release.
5. Publisher listed in public registry with operational scope.

### 10.2 Bulletin Lifecycle

```
DRAFT
  Publisher composes bulletin payload
  Internal review (minimum: dual authorisation for 'red' phase bulletins)

          ↓

SIGNED
  Hybrid signature applied using publisher's key pair
  Bulletin ID assigned; valid_from and valid_to set

          ↓

DISTRIBUTED
  Distribution via available channels (PWA, P2P, QR, print)
  No centralised distribution server required

          ↓

ACTIVE
  Devices verify signature and expiry on each render
  Token issuance possible for service_updates that support it

          ↓

EXPIRED
  valid_to exceeded; devices reject and remove from cache
  Aggregate redemption counts synced (if connectivity available)

          ↓

ARCHIVED / REVOKED
  Archived: expired normally; retained in audit log
  Revoked: added to CRL in next trust bundle; all tokens invalidated
```

### 10.3 Token Redemption

Token redemption at service sites is designed to be offline-capable and privacy-preserving:

1. Site device displays QR code requesting token.
2. Witness device presents `RedeemableToken` QR code.
3. Site device verifies hybrid signature offline against cached trust bundle.
4. Site device checks expiry (`token.expiry > Date.now()`).
5. Site device checks local token state: has `token_id` been redeemed? If yes, reject.
6. If valid: mark `token_id` as redeemed in local state; provide service.
7. On next connectivity: sync aggregate redemption count per `service_type` and `bulletin_id` only. No `token_id` or eligibility claims transmitted.

### 10.4 Publisher Revocation

Revocation is triggered by:

- Confirmed key compromise.
- Publisher organisation ceasing operations.
- Governance committee vote following documented issuance abuse.

Revocation process:
1. Governance committee passes revocation resolution (majority vote).
2. Publisher ID added to `revoked_publisher_ids` in next trust bundle.
3. Emergency trust bundle issued within 4 hours of resolution.
4. Clients verify CRL on next connection and remove revoked publisher from local trust bundle.
5. All outstanding tokens issued by revoked publisher are considered invalid retroactively on the client side.

### 10.5 Incident Response Triggers

| Event | Response | Timeline |
|---|---|---|
| Compromised publisher key | Revocation + emergency trust bundle | Within 4 hours |
| Compromised server signing key | Key rotation + new trust bundle + client notification on next connection | Within 8 hours |
| Server breach (blob storage) | Key rotation; all wrapped keys considered compromised; re-encryption under new keys | Within 24 hours; immediate notification to governance committee |
| Malicious bulletin issued | Revocation + retroactive invalidation of all tokens from affected bulletin | Immediate |
| Coerced access event | Documented in access log; escrow key review initiated; affected key shares rotated | Within 72 hours |
| Insider threat confirmed | Immediate credential revocation; audit log review; evidence preservation of log data | Immediate |

---

## 11. Component Inventory

| Component | Package | Status | Description |
|---|---|---|---|
| SHA-256 hashing | `@witness/crypto-core` | Implemented | Single-buffer and streaming SHA-256 via Web Crypto + hash-wasm |
| AES-256-GCM encryption | `@witness/crypto-core` | Implemented | Encrypt/decrypt with random IV; key generation and import |
| ECDSA P-256 signing | `@witness/crypto-core` | Implemented | Key generation, signing, verification; PKCS#8 / SPKI import/export |
| Argon2id KDF | `@witness/crypto-core` | Implemented | Passphrase-to-key derivation with OWASP parameters |
| Hash-chained custody log | `@witness/crypto-core` | Implemented | Append, verify, canonical form |
| ML-DSA-65 signing | `@witness/crypto-core` | Dependency present (`@noble/post-quantum ^0.2.1`) | Integration pending Phase 2 |
| Hybrid signature | `@witness/crypto-core` | Designed | HybridSignature type; construction and verification pending Phase 2 |
| PWA capture UI | `@witness/pwa` | Phase 2 | React + TypeScript + Vite; not yet scaffolded |
| OPFS blob storage | `@witness/pwa` | Phase 2 | Large file storage via Origin Private File System |
| IndexedDB metadata | `@witness/pwa` | Phase 2 | Structured storage via `idb` |
| tus upload | `@witness/pwa` | Phase 2 | Resumable upload with chunk-level encryption |
| Background Sync | `@witness/pwa` | Phase 2 | Service worker-based deferred upload |
| Panic purge | `@witness/pwa` | Phase 2 | One-gesture evidence wipe |
| Plane B bulletin verification | `@witness/pwa` | Phase 2 | Offline hybrid signature verification |
| Server ingestion pipeline | Backend (TBD) | Phase 2 | Node.js + PostgreSQL + S3 |
| Analyst dashboard | Backend (TBD) | Phase 2 | WorldMonitor integration |
| PMTiles OPFS loader | `@witness/offline-map` | Phase 2 | Custom MapLibre protocol handler; reads tile ranges from OPFS PMTiles file |
| Resource bundle verification | `@witness/offline-map` | Phase 2 | Offline hybrid signature + expiry verification for `ResourceBundle` |
| Map IndexedDB store | `@witness/offline-map` | Phase 2 | Bundle persistence with automatic expiry eviction |
| MapLibre GL JS map renderer | `@witness/pwa` | Phase 2 | Icon-first resource map; granaries, water points, shelters |
| LoRa DTN packet encoder | `@witness/lora-dtn` | Phase 2 | Encodes HashReceipt into LoRaDTNPacket; HMAC signing; hop-count enforcement |
| LoRa Web Serial transport | `@witness/lora-dtn` | Phase 2 | USB-C connection to LoRa companion device via Web Serial API |
| LoRa Web Bluetooth transport | `@witness/lora-dtn` | Phase 2 | BLE connection to LoRa companion device via Web Bluetooth API |
| DTN outbound queue | `@witness/lora-dtn` | Phase 2 | IndexedDB queue for unsent packets + rolling seen_ids deduplication cache |

---

## 12. Standards Alignment

| Standard | Application in Witness |
|---|---|
| NIST IR 8387 — Digital Evidence Preservation | SHA-256 hash-at-capture; hash-chained custody log; server re-verification |
| NIST FIPS 204 — ML-DSA (Dilithium) | ML-DSA-65 used in hybrid signatures |
| OWASP Password Storage Cheat Sheet | Argon2id with m=19456, t=2, p=1 |
| OCHA Data Responsibility Guidelines 2021 | Metadata minimisation by default; no persistent identifiers; data escrow for sensitive fields |
| UN Principles on Personal Data Protection 2018 | Purpose limitation; data minimisation; security safeguards |
| UNHCR Policy for Personal Data Protection | Applied to any processing of displacement-related data |
| ICRC IHL principles | Plane B bulletins framed as service information; no forced movement directives |
| W3C Service Worker API | Background sync; offline cache strategy |
| tus Resumable Upload Protocol v1.0.0 | Upload and sync |
| DENSO WAVE QR Code Specification | QR air-gap transfer; maximum 2,953 bytes binary per code |
| RFC 7518 — JSON Web Algorithms | Base64url encoding for signature serialisation |
| OpenStreetMap ODbL Licence | Base map tile data for Plane C offline resource map |
| Protomaps PMTiles Specification | Single-file tile archive format; OPFS-stored; range-request addressable |
| W3C File System Access API (OPFS) | Storage of PMTiles regional file; excluded from browser history |

---

---

## 13. Offline Resource Map

### 13.1 Purpose

Plane C provides civilians with a visual, icon-first map of nearby life-critical resources: food stores (granaries), safe water access points, underground shelters, and surface shelters. It is designed to function with zero network connectivity once map tiles and resource bundles are downloaded or received via an offline channel.

This plane is distinct from Plane B (which delivers text bulletins) in that it provides spatial awareness — enabling a person to navigate to a resource without prior knowledge of the area. Both planes share the same publisher trust model and hybrid signature verification.

### 13.2 Design Constraints

- **Fully offline**: map tile rendering and resource display require no network after initial sync.
- **Privacy-preserving**: the device's GPS position is read once on explicit user gesture for "show my position" and is never stored, logged, or transmitted.
- **Tamper-evident**: resource bundles are cryptographically signed by trusted NGO publishers using the same `HybridSignature` mechanism as Plane B bulletins. A bundle that fails signature verification is silently rejected.
- **Staleness-aware**: expired and stale resources are hidden automatically. Capacity hints are deliberately imprecise (`'low' | 'medium' | 'high'`) to avoid creating targetable intelligence about exact stockpile sizes.
- **Small footprint**: PMTiles regional files are sized for the conflict area of interest; typically 50–500 MB per region. Stored in OPFS.
- **Panic purge**: the PMTiles file and all IndexedDB resource bundles are fully wiped by the existing panic purge routine.

### 13.3 Technology Stack

| Component | Technology | Rationale |
|---|---|---|
| Map renderer | MapLibre GL JS | Open source, WebGL-accelerated, offline-capable, no API key required |
| Base tile format | PMTiles (Protomaps) | Single-file, HTTP range-request compatible, storable in OPFS without a tile server |
| Tile source data | OpenStreetMap (ODbL licence) | Free, community-maintained, globally available; appropriate for conflict regions |
| Resource data format | `ResourceBundle` (signed JSON) | Verified offline via existing `HybridSignature`; same trust infrastructure as Plane B |
| Tile storage | OPFS (Origin Private File System) | Persists across sessions; excluded from browser history and developer tools |
| Resource bundle storage | IndexedDB | Consistent with all other Plane B structured data |
| Location API | Web Geolocation API (one-shot only) | Requires explicit user gesture; position is never watched or stored |

### 13.4 Offline Tile Strategy

PMTiles is a single-file archive format for map tiles. A region-scoped PMTiles file contains all vector tiles for the geographic area of interest, addressed by standard tile coordinates. MapLibre GL JS uses a custom `pmtiles://` protocol handler that translates tile requests into HTTP range requests against the local OPFS file — no tile server is required.

**Initial tile acquisition** (requires connectivity or physical transfer):

1. User selects conflict region from a pre-defined list maintained by trusted NGO publishers.
2. Service Worker downloads the PMTiles file for that region (~50–500 MB) in the background.
3. File is written to OPFS via the File System Access API.
4. MapLibre GL JS is configured with the `pmtiles://` custom protocol pointing at the OPFS file.
5. All subsequent map renders are fully local; no outbound tile requests are made.

**Offline tile distribution alternatives** (zero connectivity):

- Transfer via QR code sequence (small regions only, impractical for large areas).
- Transfer via Wi-Fi Direct or BLE from a pre-loaded device (same P2P mechanism as evidence transfer).
- Pre-loaded by NGO field staff onto device before deployment in a no-connectivity zone.

### 13.5 Resource Bundle Distribution Flow

Resource bundles follow the same distribution channels as Plane B bulletins:

```
NGO publisher
  → Compiles list of ResourceLocation entries with expiry timestamps
  → Signs ResourceBundle with hybrid ECDSA P-256 + ML-DSA-65 key
  → Distributes via one or more channels:
      HTTPS pull (when online)
      QR code sequence (offline, small bundles)
      BLE beacon broadcast (offline, small bundles)
      Wi-Fi Direct transfer from field device (offline, full bundles)

Witness device
  → Receives ResourceBundle (any channel)
  → Verifies hybrid signature against local trust bundle (fully offline)
  → Checks valid_from / valid_to window; rejects expired bundles
  → Stores in IndexedDB if valid
  → MapLibre GL JS overlay renders resource markers on next map load
  → Expired bundles are automatically removed from IndexedDB
```

### 13.6 Map UI Design

Consistent with the rest of Witness, the map UI is icon-first with no legal jargon:

| Resource type | Icon | Colour |
|---|---|---|
| Granary / food store | Wheat sheaf | Amber |
| Water point | Water droplet | Blue |
| Underground shelter | Down-arrow + shield | Grey |
| Surface shelter | Shield | Green |
| Clinic | Cross | Red |
| Transit corridor | Arrow path | White |

Status overlays:
- `open` → full colour icon
- `limited` → half-opacity icon + small warning badge
- `closed` → greyed icon with X; hidden after 2 hours
- `unknown` → icon with `?` badge

Capacity hint displayed as a small bar beneath the icon (low / medium / high). No numeric values displayed.

### 13.7 Privacy Design

| Concern | Mitigation |
|---|---|
| Device location upload | GPS is read once on user gesture for "centre map on me" only. Never stored to IndexedDB, never included in any upload or log entry. |
| Resource interaction tracking | Map pan, zoom, and marker taps are not logged in the custody log or any other store. |
| Targetable resource intelligence | Capacity hints are categorical (`low/medium/high`), not numeric. Precise coordinates are included in the signed bundle but are not displayed as text to the user. |
| False resource injection | All bundles require a valid `HybridSignature` from a publisher in the local trust bundle. A device with no connectivity cannot be fed false resource data by a rogue actor without a valid signing key. |
| Staleness risk | `expires_at` per resource and `valid_to` per bundle enforce freshness. Stale resources are hidden, not merely greyed, to prevent civilians acting on outdated data. |
| Panic purge scope | PMTiles OPFS file + all IndexedDB resource bundles are included in the existing panic purge routine. Map data is considered equally sensitive to evidence. |

### 13.8 Package: `@witness/offline-map`

| File | Responsibility |
|---|---|
| `pmtiles.ts` | Registers the `pmtiles://` custom protocol with MapLibre; reads tile byte ranges from OPFS; handles tile cache invalidation on region change |
| `resource-bundle.ts` | `verifyBundle(bundle, trustBundle): Promise<boolean>` — hybrid signature verification; expiry check; schema validation |
| `map-store.ts` | IndexedDB persistence layer for `ResourceBundle` objects; automatic expiry eviction on open; region metadata for tile management |
| `index.ts` | Public exports: `verifyBundle`, `loadMap`, `MapStore`, TypeScript types |

---

*This architecture specification reflects the design intent as of version 1.0. Implementation status of individual components is noted in Section 11. The specification should be updated to reflect any significant design changes prior to external security review.*
