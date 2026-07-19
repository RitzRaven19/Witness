# Witness

> Offline-first civilian evidence preservation for conflict zones.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Status: MVP in development](https://img.shields.io/badge/Status-MVP%20in%20development-yellow)]()
[![Built for: ICC / Human Rights NGOs](https://img.shields.io/badge/Built%20for-ICC%20%2F%20Human%20Rights%20NGOs-red)]()

---

## What is Witness?

Every day, civilians in active conflict zones film atrocities on their phones. Most of that footage never reaches justice — because phones get seized, networks get shut down, videos get deleted by platform moderation algorithms, or the footage exists without any chain of custody that makes it legally usable.

Witness is a mobile-first Progressive Web App (PWA) that solves this. In under 60 seconds, anyone with a smartphone can capture a photo, video, or audio clip and have it:

- **Cryptographically fingerprinted** — a tamper-proof hash is generated the instant of capture
- **Encrypted locally** — the file is encrypted on-device before anything else happens
- **Queued for upload** — it uploads the moment any network connection returns, even hours or days later
- **Chain-of-custody logged** — every handling step is recorded in a tamper-evident audit log
- **Legally admissible** — the preserved evidence meets international digital evidence standards aligned with NIST IR 8387

No app store. No login required. Works in a browser. Works offline. Works when the internet is deliberately shut down.

---

## What is implemented today

The monorepo currently ships five tested packages, a server, and a full PWA:

| Component | What it does |
|---|---|
| `packages/crypto-core` | SHA-256 streaming hashing, AES-256-GCM, ECDSA P-256 + ML-DSA-65 hybrid signatures (FIPS 204 PQC), Argon2id KDF, hash-chained custody log, ECDH sealed boxes, key wrapping, shared publisher trust model |
| `packages/offline-map` | Plane C: MapLibre + PMTiles offline maps, NGO-signed ResourceBundle verification, resumable region-pack downloads to OPFS |
| `packages/lora-dtn` | LoRa DTN escape network: HMAC-authenticated packets, epidemic store-and-forward queue, E2E-encrypted mesh messages, **works with stock Meshtastic boards** (Web Bluetooth / Web Serial) |
| `packages/knowledge-library` | Plane D: NGO-signed survival guides with hash-verified reads and no read history |
| `apps/server` | Ingestion: tus resumable uploads of encrypted blobs, LoRa HashReceipt ingestion, receipt↔upload correlation |
| `apps/pwa` | The app: capture → hash → encrypt → **key sealed to a passphrase-protectable vault** → queued upload + mesh receipt; evidence export with custody events; offline map with tile packs + QR bundle import/share; verified knowledge library; E2E mesh chat with QR contact-key pairing; panic purge + calculator decoy |

Not yet built: real NGO trust bundles (demo content is locally signed through the same verification pipeline), Plane D.2 private clips, full Plane E mesh features (bloom-filter sync, chunked transfer), Plane F on-device AI, hardware RF field testing.

### Quickstart

```bash
pnpm install
pnpm -r test                      # 140 tests across all packages
pnpm --filter @witness/server dev # ingestion server on :3001
pnpm --filter @witness/pwa dev    # app on :5173
```

Point uploads at the bundled server with `apps/pwa/.env` → `VITE_TUS_ENDPOINT=http://localhost:3001/files`, and set the mesh ingest URL in Settings → `http://localhost:3001/ingest`.

---

## The problem this solves

- **56,000+** incidents of violence against civilians were recorded in 2025 — the highest in five years (ACLED)
- **122 million** people are currently forcibly displaced worldwide (UNHCR, 2025)
- **296** internet shutdowns were documented across 54 countries in 2024 (Access Now)
- The ICC is actively investigating Sudan, Gaza, Ukraine, and Myanmar — and civilian footage is among the most critical forms of evidence
- Existing tools (e.g. EyeWitness to Atrocities) require app installation, have limited offline capability, and have almost no public reach in active conflict zones

---

## Architecture overview

Witness is split into two planes with fundamentally different goals:

```
┌─────────────────────────────────────────────────────────┐
│                     WITNESS                             │
│                                                         │
│  ┌─────────────────────┐   ┌─────────────────────────┐  │
│  │     PLANE A          │   │       PLANE B           │  │
│  │  Evidence Vault      │   │  Safe Info Layer        │  │
│  │                      │   │                         │  │
│  │  Civilian-facing     │   │  Survivor-facing        │  │
│  │  Capture → Hash →   │   │  Signed bulletins       │  │
│  │  Encrypt → Queue →  │   │  from trusted NGOs      │  │
│  │  Upload → Audit     │   │  (shelters, clinics)    │  │
│  └─────────────────────┘   └─────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              ANALYST DASHBOARD                      │ │
│  │  WorldMonitor conflict map + Witness evidence layer │ │
│  │  For NGOs, human rights investigators, ICC teams   │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Plane A — Evidence preservation

### Capture flow

```
flowchart TD
    A[User opens Witness in browser] --> B[One-tap capture screen]
    B --> C{Capture method}
    C -->|Camera| D[Record photo/video/audio]
    C -->|Upload| E[Import from camera roll]
    D --> F[Compute SHA-256 hash of raw file]
    E --> F
    F --> G[Strip identifying metadata\nGPS, device info removed from file\npreserved separately in encrypted vault]
    G --> H[Encrypt file with AES-256-GCM\nusing device-generated key]
    H --> I[Store encrypted blob in\nIndexedDB offline queue]
    I --> J[Append event to local custody log\nevent: captured → encrypted → queued]
    J --> K[Display receipt to user\nShort code + QR]
    K --> L{Connection available?}
    L -->|Yes| M[Upload encrypted blob to vault]
    L -->|No| N[Queue persists on device\nretries when connection returns]
    M --> O[Server verifies hash on ingestion]
    O --> P[Appends server-signed receipt\nto audit log]
    P --> Q[Evidence is preserved\nchain-of-custody complete]
```

### Evidence object model

```typescript
// Plane A: Encrypted media blob
interface EvidenceBlob {
  blob_id: string;          // Random, non-guessable UUID
  ciphertext: ArrayBuffer;  // AES-256-GCM encrypted media
  chunk_manifest?: ChunkHash[]; // For large files split into chunks
}

// Integrity receipt — generated immediately at capture
interface HashReceipt {
  media_hash: string;       // SHA-256 of plaintext media
  capture_time_claim: number; // Local device timestamp (corroborated later)
  receipt_signature?: string; // Added by server on successful upload
}

// Append-only local custody log
interface CustodyLog {
  events: CustodyEvent[];
}

interface CustodyEvent {
  type: 'captured' | 'encrypted' | 'queued' | 'transferred_p2p'
       | 'exported_qr' | 'uploaded' | 'purged';
  timestamp: number;
  prev_hash: string; // Each event chained to previous — tamper-evident
}
```

### Metadata handling

Witness follows a strict **metadata minimisation by default** approach, aligned with OCHA Data Responsibility Guidelines 2021:

| Metadata type | Default behaviour | Rationale |
|---|---|---|
| GPS coordinates | Stripped from file | If device is seized, location of witness is not exposed |
| Device identifiers | Stripped from file | Prevents witness identification |
| Capture timestamp | Preserved in encrypted vault | Required for evidence corroboration |
| Precise location | Escrowed (multi-party) | Only accessible to authorised investigators with threshold keys |
| File hash | Always preserved | Core to evidentiary integrity |

For high-value metadata (precise location, identity), **threshold encryption** is used: no single organisation can decrypt it alone, requiring multi-party key holders to collaborate. This prevents a single point of coercion.

---

## Plane B — Safe information layer

Plane B delivers time-limited, cryptographically signed information from trusted humanitarian publishers (NGOs, clinics, shelter operators) to survivors — without creating a targetable directory.

**Critical design constraint:** Any feature that implies "routing" or "you must move here" could be exploited by belligerents or could violate IHL prohibitions on forced displacement. Plane B bulletins are framed as *safety-related service information*, never directives.

### Token issuance and redemption flow

```
flowchart TD
    P[Trusted NGO publisher\nissues signed bulletin] --> Q[Token signed with\npublisher private key]
    Q --> R[Expiry set — short-lived\ne.g. 6 hours]
    R --> S[Token encoded as QR code]
    S --> T[Displayed on poster, device,\nor printed card]
    T --> U[Site device scans QR]
    U --> V[Offline signature verification\nagainst trust bundle]
    V --> W{Valid and not expired?}
    W -->|Yes| X[Provide service\nmark token as redeemed]
    W -->|No| Y[Reject\nshow safe fallback info]
    X --> Z[Later sync aggregate counts only\nno individual tracking]
```

### Signed bulletin object model

```typescript
interface SignedBulletin {
  publisher_id: string;       // Key identity of trusted NGO
  valid_from: number;         // Unix timestamp
  valid_to: number;           // Short-lived — typically 6-24 hours
  phase: 'green' | 'amber' | 'red'; // Safety status
  service_updates: ServiceUpdate[]; // Minimal; no exact coordinates by default
  signature: string;          // Publisher's Ed25519 signature
}

interface RedeemableToken {
  token_id: string;           // Random, one-time
  service_type: string;       // e.g. 'clinic_triage' | 'transport_seat'
  eligibility_claims: string[]; // Minimal categorical — no personal data
  expiry: number;
  one_time_use: boolean;
  signature: string;
}
```

---

## Offline architecture

### Why offline-first is a safety requirement

Internet shutdowns in conflict zones are not edge cases. Access Now documented **296 shutdowns across 54 countries in 2024**, with dozens continuing into 2025. The network must be treated as **hostile and absent by default**.

### The five offline channels

| Channel | Payload capacity | Metadata risk | Best used for |
|---|---|---|---|
| PWA service worker cache | Medium–Large (MBs) | Medium | Full app offline, queued uploads |
| QR air-gap transfer | Small (KBs) | Low–Medium | Hash receipts, signed tokens |
| Wi-Fi Direct / P2P | Large (any file) | Medium–High | Moving encrypted blobs between devices |
| SMS / USSD | Tiny (bytes) | High | Phase status only — never sensitive data |
| Printed QR / poster | Tiny (URL, keys) | Low–Medium | Trust anchors, app entrypoint |

### PWA offline strategy

```
Service Worker intercepts all requests
         │
         ├── App shell & UI → Cache first (always available offline)
         ├── Capture flow → Works fully offline
         │   └── Evidence queued in IndexedDB
         ├── Upload attempts → Network first with offline fallback
         │   └── Retries on: app open, connection event, background sync
         └── Bulletins → Cache with expiry enforcement
```

### QR air-gap transfer

For situations where even Wi-Fi is unavailable, hash receipts and tokens can be transferred via QR codes scanned between devices. Aligned with DENSO WAVE QR specification — maximum 2,953 bytes binary capacity per QR code.

For larger payloads, chunked multi-QR sequences are supported, with chunk hashes validated on reassembly.

### Emergency purge

A one-tap **panic wipe** removes all locally encrypted blobs and sensitive cached data. This is a safety feature, not a forensic guarantee — it is designed to reduce on-device residue if a witness is stopped at a checkpoint. The UX deliberately avoids implying complete forensic invisibility.

```
Long press home button (3 seconds)
        ↓
"Remove all local data?" confirmation (single tap)
        ↓
IndexedDB cleared
Encrypted queue deleted
Sensitive caches purged
        ↓
App returns to neutral, unmarked screen
```

---

## Analyst dashboard — WorldMonitor integration

The NGO-facing side of Witness is built on top of [WorldMonitor](https://worldmonitor.app) (AGPL-3.0), the open-source real-time conflict intelligence platform used by 2M+ people across 190 countries.

### What WorldMonitor provides

- Real-time conflict tracking via ACLED and UCDP datasets
- Country Instability Index (CII) scoring
- 45 map layers including military, maritime, and infrastructure
- AI-powered intelligence synthesis
- 435+ curated news sources across conflict regions

### What Witness adds on top

A new evidence layer that pins verified civilian submissions to WorldMonitor's conflict map, enabling investigators to:

- See verified footage clustered by region and incident type
- Cross-reference submissions against known ACLED conflict events
- Filter evidence by CII severity score
- Track submission volume over time per conflict theatre
- Export cryptographically verified evidence packages for ICC submission

```
WorldMonitor conflict map (existing)
        +
Witness evidence markers (new layer)
        │
        ├── Each marker = one or more verified submissions
        ├── Colour coded by verification status
        ├── Clustered by incident using AI triage
        └── Filterable by: date, media type, CII score, region
```

### Why this integration is natural

WorldMonitor currently shows *where* conflicts are happening at a macro level. Witness adds what those conflicts look like from the ground — verified, timestamped, legally admissible civilian documentation. Together they create a complete picture: the intelligence layer and the evidence layer, unified.

---

## Security model

### Threat model

| Threat | Mitigation |
|---|---|
| Device seized at checkpoint | Metadata stripped from file; panic purge available; no plaintext content on device |
| Network monitored or blocked | All uploads encrypted in transit (TLS); content encrypted at rest; operates fully offline |
| Server compromised | Threshold encryption for sensitive metadata — no single org can decrypt alone |
| Malicious publisher (Plane B) | Publisher keys revocable; trust bundle updated on next connection; bulletins expire automatically |
| Evidence tampering | SHA-256 hash generated at capture moment; any modification detectable on ingest |
| Witness identification | No account required; no persistent identifiers; GPS stripped by default |

### Cryptographic stack

```
Evidence encryption:    AES-256-GCM
File integrity:         SHA-256 (NIST IR 8387 aligned)
Publisher signatures:   Ed25519
Transport:              TLS 1.3
Key storage:            Web Crypto API (device-native secure storage)
Threshold encryption:   Shamir's Secret Sharing (for sensitive metadata escrow)
```

---

## UX principles for conflict settings

Every design decision is governed by three constraints: **low literacy, high stress, device may be searched.**

- **Single tap to capture** — the entire capture flow is one button. Advanced settings hidden behind long-press.
- **Icon-first language** — camera, lock, clock, QR, X. No legal jargon. No complex menus.
- **Receipt designed for memorisation** — short alphanumeric code (8 characters), large font, QR representation. Can be written on paper.
- **"Waiting for signal" status** — one non-technical indicator. No error codes.
- **Battery-aware** — background tasks pause automatically below 20% battery. No continuous radio scanning.
- **Voice prompts** (optional, offline) — short audio cues in the user's language for confirmation steps.
- **Panic / quick hide** — one gesture returns to a neutral, unmarked screen and stops all transfers.
- **No onboarding** — the app works without any account, registration, or tutorial.

---

## Governance model

### Publisher roles (Plane B)

| Role | Responsibility |
|---|---|
| Trusted publishers | NGOs, clinics, shelter operators authorised to issue signed bulletins and tokens |
| Validators | Separate entities (cluster coordinators, independent monitors) who audit publisher behaviour and trigger revocation |
| Key custodians | Multi-party escrow holders for Plane A sensitive metadata keys |

### Trust bundle distribution

The trust bundle (list of authorised publisher public keys) is distributed through multiple redundant channels:

- PWA update on next connection
- Printed QR cards distributed by partner NGOs
- Device-to-device P2P transfer from trusted helper devices
- Key fingerprints published on official partner websites

### Incident response

The following events trigger the incident response protocol:

- Compromised publisher key → immediate revocation, new trust bundle issued
- Site takeover or server breach → key rotation, user notification on next connection
- Malicious bulletin published → revocation + retroactive invalidation
- Coerced access event → documented, escrow key review initiated

---

## Data sources and partners

| Source | Used for |
|---|---|
| ACLED (Armed Conflict Location & Event Data) | Conflict event cross-referencing |
| UCDP (Uppsala Conflict Data Program) | Conflict verification |
| WorldMonitor CII | Regional instability scoring |
| UNHCR displacement data | IDP/refugee context |
| Access Now KeepItOn | Shutdown monitoring and alerts |

### Target integration partners

- **Witness.org** — pioneer in human rights video documentation
- **Mnemonic / Syrian Archive** — digital evidence preservation for accountability
- **Bellingcat** — open-source investigation and verification
- **Amnesty International Digital Verification Corps**
- **Physicians for Human Rights**
- **ICC Office of the Prosecutor**

---

## Technical stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite (PWA) |
| Offline storage | IndexedDB via idb |
| Service workers | Workbox |
| Cryptography | Web Crypto API |
| Map / conflict layer | WorldMonitor (AGPL-3.0) |
| P2P transfer | Wi-Fi Direct / Google Nearby Connections API |
| QR generation | qrcode.js |
| Backend (vault) | Node.js + PostgreSQL |
| File storage | Encrypted object storage (self-hosted or S3-compatible) |
| Evidence integrity | SHA-256 + append-only audit log |
| Deployment | Docker + self-hostable / Vercel edge |

---

## Estimated build scope

| Phase | Scope | Timeline |
|---|---|---|
| MVP | PWA offline capture + hash + encrypt + queue + upload + receipt | 2–3 months (solo) |
| V1 | Plane B bulletins + QR air-gap + panic purge + basic analyst dashboard | +2 months |
| V1.5 | WorldMonitor integration + P2P transfer + NGO onboarding | +2 months |
| V2 | Multi-party key escrow + ICC export format + full governance model | +3 months |

---

## Getting started

```bash
git clone https://github.com/[your-username]/witness.git
cd witness
npm install
npm run dev
```

Open `localhost:5173`. No environment variables required for basic offline capture mode.

For the full analyst dashboard with WorldMonitor integration:

```bash
cp .env.example .env
# Add your WorldMonitor API key and vault endpoint
npm run dev:full
```

---

## Standards and references

- NIST IR 8387 — Digital Evidence Preservation
- OCHA Data Responsibility Guidelines 2021
- UN Principles on Personal Data Protection and Privacy (2018)
- UNHCR Policy for Personal Data Protection
- ICRC Frequently Asked Questions: Rules of War (IHL)
- Access Now KeepItOn — Internet Shutdowns 2024
- DENSO WAVE QR Code Standardisation
- MDN Service Worker API
- Android Wi-Fi Direct (P2P) documentation
- Google Nearby Connections API

---

## License

AGPL-3.0 for non-commercial and humanitarian use.

This project uses [WorldMonitor](https://github.com/koala73/worldmonitor) (AGPL-3.0) for the conflict intelligence layer.


---

## Contributing

Contributions welcome. This project especially needs:

- Security review of the cryptographic pipeline
- Field UX research with displaced communities
- Translations (Arabic, Tigrinya, Ukrainian, Burmese, French priority)
- NGO partnerships for Plane B publisher governance
- Legal review for cross-border evidence admissibility

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Contact

Built by Ritu Dey — ritzraven1234@gmail.com — https://github.com/RitzRaven19

For responsible security disclosure: See [SECURITY.md](SECURITY.md)

---

*Witness is dedicated to every civilian who filmed something important and never got to share it.*
