# Witness — Plane D: Offline Knowledge Library

**Version:** 0.2
**Date:** 2026-03-27 (updated 2026-07-05)
**Status:** D.1 implemented (`@witness/knowledge-library`) — signed bundles verified with the shared hybrid ECDSA P-256 + ML-DSA-65 trust chain (not the Ed25519 named below; "no additional trust model" wins), hash-verified reads, no read history, panic-purged. D.2 user clips, encryption at rest, and mesh chunk distribution remain future work.

---

## Overview

Plane D is Witness's offline reading and survival knowledge layer. It consolidates two functions that currently require separate apps:

- **Saved article reading** (Pocket): civilians and aid workers clip web content for offline access
- **Survival reference** (Offline Survival Manual): pre-bundled, vetted humanitarian guidance — first aid, water purification, shelter, legal rights — distributed and signed by trusted NGOs

Both functions share the same storage, trust, and distribution infrastructure as Planes B and C. No additional trust model is introduced.

---

## Design constraints

| Constraint | Rationale |
|---|---|
| No read history | A seized device must not reveal what a person was researching |
| All content encrypted at rest | Same AES-256-GCM as evidence blobs |
| Signed bundles only for pre-packaged content | Prevents malicious survival guides being injected |
| User-clipped content is user-owned | Not signed, not published — private to the device |
| Panic purge clears Plane D entirely | One gesture, same as all other planes |
| Battery-aware | Background sync and pre-fetch pause below 20% |

---

## Content types

### D.1 — NGO-Signed Knowledge Bundles

Trusted publishers (NGOs, medical organisations, UN agencies) produce signed bundles of articles and guides. These are distributed through the same ResourceBundle mechanism as Plane C map tiles.

```typescript
interface KnowledgeBundle {
  bundle_id: string;           // UUID
  publisher_id: string;        // Ed25519 key identity of trusted NGO
  title: string;               // e.g. "MSF Field Guide — Water Safety"
  language: string;            // BCP-47 language tag
  version: number;             // Monotonically increasing
  valid_from: number;          // Unix timestamp
  valid_to?: number;           // Optional expiry (evergreen bundles omit this)
  articles: ArticleManifestEntry[];
  signature: string;           // Ed25519 signature over canonical bundle metadata
}

interface ArticleManifestEntry {
  article_id: string;          // UUID
  title: string;
  content_hash: string;        // SHA-256 of plaintext content
  byte_length: number;
  tags: string[];              // e.g. ['first-aid', 'water', 'shelter', 'legal']
  offline_priority: 'critical' | 'high' | 'normal';
}
```

Bundles are verified against the NGO trust bundle (same key store used by Plane B) before installation.

**Pre-packaged content categories:**

| Category | Example publishers |
|---|---|
| First aid and medical triage | MSF, ICRC, WHO |
| Water safety and purification | UNICEF, Oxfam |
| Shelter and displacement | UNHCR, NRC |
| Legal rights in conflict | ICRC, Amnesty International |
| Digital security | Access Now, EFF, Article 19 |
| Child protection | UNICEF, Save the Children |

### D.2 — User-Clipped Articles

When connectivity is available, users can clip a URL or paste text for later offline reading. Clipped content is:

- Stored encrypted in OPFS (large) or IndexedDB (small)
- Never transmitted anywhere — purely local
- Not signed (user-owned, private content)
- Stripped of tracking parameters and third-party scripts before storage

```typescript
interface ClippedArticle {
  clip_id: string;             // UUID, generated at clip time
  source_url?: string;         // Original URL (stripped of tracking params)
  title: string;               // Extracted or user-supplied
  plaintext_content: string;   // Reader-mode extracted text
  clipped_at: number;          // Unix timestamp — not synced anywhere
  tags: string[];              // User-supplied
}
```

Clipped articles are stored encrypted. The `source_url` is included only if the user explicitly opts in — by default it is discarded to avoid revealing browsing intent.

---

## Storage

Plane D uses the same OPFS + IndexedDB layered storage as the rest of Witness:

```
OPFS (large content)
  /plane-d/
    bundles/
      {bundle_id}/
        manifest.json.enc      # Encrypted ArticleManifestEntry[]
        {article_id}.enc       # Encrypted article content
    clips/
      {clip_id}.enc            # Encrypted ClippedArticle

IndexedDB (metadata only)
  plane-d-bundles              # Bundle metadata + install status
  plane-d-clips                # Clip metadata (no content)
```

All `.enc` files are AES-256-GCM encrypted with the device's local storage key (same key derivation chain as Plane A). Metadata stored in IndexedDB contains no plaintext content — only IDs, hashes, and tags.

---

## Distribution

Knowledge bundles are distributed through the same channels as Plane C map tiles and Plane B trust bundles:

| Channel | Use case |
|---|---|
| PWA sync on connection | Primary delivery for full bundles |
| Plane E mesh (BT / LoRa) | Bundle propagation between nearby devices |
| QR code (manifest only) | Share bundle ID + hash for verification; content follows via mesh |
| Printed QR card | NGO distributes a card pointing to a bundle; device fetches when online |

Bundle size targets:

| Bundle type | Target size | Notes |
|---|---|---|
| Critical survival guide (1 language) | < 2 MB | Must fit in a single mesh transfer session |
| Full first aid reference | 5–15 MB | Chunked over mesh; prioritised chunks first |
| Long-form legal reference | 10–30 MB | Low mesh priority; sync-on-connection preferred |

---

## Reader UX

- **Tag-based navigation** — no search history, no recently read list
- **Language-first** — user sets preferred language at install; bundles in that language are prioritised
- **Offline-first** — reader renders from local encrypted storage; no network call on open
- **Plain text rendering** — no images or external resources (reduces storage, eliminates tracking pixels)
- **Font size and contrast** — adjustable for field conditions (bright sunlight, damaged screens)
- **No annotations stored** — highlights and notes are not persisted (no evidence of what was read)

---

## Panic purge scope

Plane D uses a **hybrid hide/delete** model. The key distinction is whether content has a recovery path:

| Content type | On panic | Reason |
|---|---|---|
| NGO-signed bundles (installed) | **Hide** — keys removed from device, ciphertext remains | Re-downloadable from publisher or via mesh; no user data inside |
| User-clipped articles | **Delete always** — ciphertext and keys both wiped | Personal data; no canonical copy exists elsewhere |
| Clip metadata (IndexedDB) | **Delete always** | Reveals what the user was researching |
| Bundle metadata (IndexedDB) | **Hide** — bundle IDs removed from index | Non-sensitive; needed for recovery |

"Hide" means: the device-local decryption key for that bundle is deleted. The OPFS ciphertext is orphaned — unreadable without the key. Recovery requires the user to present a pre-arranged recovery credential (see below).

### Key escrow for bundle recovery

Users who opt in to hide mode must pre-arrange key recovery before they need it:

**Option A — Server escrow (requires prior connectivity)**
The bundle decryption keys are uploaded, encrypted under the user's recovery passphrase, to a trusted NGO server. On recovery, the user authenticates with their passphrase and downloads the key bundle.

**Option B — Printed recovery QR**
The bundle key set is encoded as a QR code and printed. The user stores the printout separately from the device. On recovery, they scan the QR to restore keys.

**Option C — Memorised recovery code**
A short (12-word BIP-39 style) mnemonic is derived from the key set. The user memorises it. On recovery, they type it in to restore keys.

If no recovery method has been pre-arranged, hide mode is not offered — the UI defaults to full delete with a clear explanation.

### UX framing

The purge screen must clearly distinguish:

```
[ DELETE EVERYTHING ]        [ LOCK & HIDE ]
  All data gone.               Evidence locked.
  No recovery.                 Bundles recoverable
                               if you set up recovery.
```

"LOCK & HIDE" is only shown if the user previously set up a recovery method. Otherwise only "DELETE EVERYTHING" is shown.

No residue of user clips or pending evidence remains after either action.

---

## Relationship to other planes

| Plane | Interaction |
|---|---|
| Plane B | Signed bulletins may link to Plane D bundle IDs for deeper reading |
| Plane C | Map POIs (e.g. clinic markers) may reference a Plane D first aid bundle |
| Plane E | Mesh layer distributes bundle chunks between nearby devices |
| Plane F | On-device AI can answer questions using Plane D content as a knowledge base |

---

## Package

`@witness/knowledge-library`

```
packages/knowledge-library/
  src/
    bundle-store.ts        # OPFS + IndexedDB read/write for bundles
    clip-store.ts          # OPFS + IndexedDB read/write for clips
    bundle-verify.ts       # Ed25519 signature verification against trust bundle
    bundle-sync.ts         # Network fetch + Plane E chunk receive
    reader.ts              # Plaintext extraction and rendering helpers
    index.ts               # Package exports
```

---

## Open questions

1. Should user-clipped articles survive a panic purge? (Current proposal: no — purge is total.)
2. Should bundle tags be stored in IndexedDB plaintext for filtering, or encrypted and loaded into memory on unlock? (Security vs. usability trade-off.)
3. Minimum viable bundle set for MVP: which 3–5 organisations should we approach first for signed content?
