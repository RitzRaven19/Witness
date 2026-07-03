# Witness — Threat Model

**Version:** 1.0
**Date:** 2026-03-20
**Classification:** Public
**Standard:** STRIDE + LINDDUN

---

## Table of Contents

1. [Scope and Purpose](#1-scope-and-purpose)
2. [System Actors](#2-system-actors)
3. [Device States](#3-device-states)
4. [Data Flows](#4-data-flows)
5. [Trust Boundaries](#5-trust-boundaries)
6. [STRIDE Analysis by Component](#6-stride-analysis-by-component)
7. [LINDDUN Privacy Analysis](#7-linddun-privacy-analysis)
8. [Mitigations Table](#8-mitigations-table)
9. [Residual Risks](#9-residual-risks)
10. [Out of Scope](#10-out-of-scope)

---

## 1. Scope and Purpose

This document is a formal threat model for the **Witness** platform — an offline-first Progressive Web App (PWA) designed for civilian evidence preservation in active conflict zones. It covers all components across the two-plane design (Plane A: Evidence Vault; Plane B: Safe Information Layer), the backend ingestion pipeline, and the investigator-facing analyst dashboard.

The threat model serves three purposes:

1. To systematically enumerate threats so that mitigations can be verified against them.
2. To support grant applications and external security audits.
3. To document residual and accepted risks, ensuring stakeholders understand what the system cannot guarantee.

The methodology is **STRIDE** (per component) for integrity and availability threats, and **LINDDUN** for privacy threats specific to witness identity protection.

---

## 2. System Actors

### 2.1 Primary Actors

| Actor | Role | Trust Level | Risk Profile |
|---|---|---|---|
| **Witness** | Civilian capturing evidence in the field | Trusted (primary user) | High-stress, potentially low-tech, may be coerced or under duress |
| **Adversary** | State actor, armed group, checkpoint officer | Untrusted | Motivated to seize/destroy evidence, identify the witness, and suppress documentation |
| **Trusted NGO Publisher** | Issues signed Plane B bulletins (safety status, service updates) | Conditionally trusted | Key material may be compromised, organisation may be coerced or infiltrated |
| **Server Operator** | Hosts the encrypted evidence vault and ingestion pipeline | Trusted but audited | Could be compelled by legal orders; insider threat possible |
| **Investigator / ICC** | Accesses preserved evidence for accountability proceedings | Trusted, credentialed | External access; requires threshold key collaboration |
| **Insider** | Compromised team member with elevated server or key access | Untrusted under this model | May exfiltrate keys or tamper with audit logs |

### 2.2 Secondary Actors

| Actor | Role |
|---|---|
| **Relay operator** | Operates satellite or LoRa relay node for offline transfer |
| **P2P helper device** | A second device in proximity used to exfiltrate encrypted blobs via Wi-Fi Direct |
| **Certificate Authority** | Issues TLS certificates used in server communication |
| **Key custodians** | Multi-party escrow holders for sensitive metadata keys |

---

## 3. Device States

The device state at the moment of threat determines which mitigations are effective. All states must be modelled because the adversary controls the environment.

| State | Description | Active Threats | Primary Risk |
|---|---|---|---|
| **Online** | Full network connectivity available | Network-layer attacks, server-side compromise, traffic analysis | Evidence exfiltration via upload path |
| **Offline** | No connectivity — the normal operating assumption | On-device attacks, physical access | Unsynced evidence held solely on device |
| **Seized at checkpoint** | Adversary has physical custody of the device | Forensic extraction, brute-force, cold-boot attacks | Discovery of unencrypted evidence or witness identity |
| **Coerced** | Witness is forced under duress to unlock or hand over the device | Bypass of application-layer defences | Decryption by authorised key with adversary present |
| **Low battery / degraded** | Background tasks halted; panic purge may not complete | Evidence left in partially encrypted state | Residual plaintext in memory or temporary files |

---

## 4. Data Flows

### 4.1 Plane A — Evidence Capture and Preservation

```
[Camera / File Import]
        |
        v
[SHA-256 hash of plaintext] --> [HashReceipt created]
        |
        v
[Strip identifying metadata: GPS, device IDs]
        |
        v
[AES-256-GCM encrypt] <-- [Per-evidence key derived from device master key]
        |
        v
[Store ciphertext in OPFS / IndexedDB]
        |
        v
[Append CustodyEvent to local log] <-- [Hash-chained: prev_hash]
        |
        v
[Display short receipt code + QR to witness]
        |
        v (when network available)
[tus resumable upload -- chunk-level encrypted -- over TLS 1.3]
        |
        v
[Server ingestion: hash re-verify, ECDSA + ML-DSA-65 verify]
        |
        v
[Append-only PostgreSQL custody log]
        |
        v
[S3-compatible encrypted blob storage]
        |
        v
[Server-signed receipt returned to client]
```

### 4.2 Plane B — Bulletin Issuance and Redemption

```
[Trusted NGO Publisher]
        |
        v
[Compose SignedBulletin: phase, service_updates, expiry]
        |
        v
[Sign with ECDSA P-256 + ML-DSA-65 (hybrid)] <-- [Publisher private key]
        |
        v
[Distribute via: PWA update, QR card, P2P, printed poster]
        |
        v
[Device receives bulletin]
        |
        v
[Verify signature against local trust bundle]
        |
        v
[Check expiry: typically 6–24 hours]
        |
        v (if valid)
[Render safety status; issue RedeemableToken if applicable]
        |
        v
[Token redemption at service site: offline signature verification]
        |
        v
[Aggregate counts only synced -- no individual tracking]
```

### 4.3 P2P Transfer Between Devices

```
[Device A: has encrypted blob in queue]
        |
        v
[Establish Wi-Fi Direct / Nearby Connections channel]
        |
        v
[Transfer encrypted ciphertext + chunk manifest]
        |
        v
[Device B: verifies chunk hashes, stores in own queue]
        |
        v
[Append transferred_p2p CustodyEvent on both devices]
        |
        v
[Device B uploads when connectivity available]
```

### 4.4 Satellite / LoRa Relay

```
[Device: encrypted blob or hash receipt]
        |
        v
[Encode for low-bandwidth channel: chunk + base64/binary]
        |
        v
[Transmit via LoRa radio or satellite terminal]
        |
        v
[Relay node: forwards to internet-connected endpoint]
        |
        v
[Endpoint: standard ingestion pipeline]
```

---

## 5. Trust Boundaries

| Boundary | Description | Crossing Assets |
|---|---|---|
| **TB-1: Device perimeter** | Between the browser sandbox and the device OS/hardware | Encryption keys, plaintext media before encryption |
| **TB-2: Application to network** | Between the PWA and the upload endpoint | Encrypted blobs, TLS-protected; hash receipts |
| **TB-3: Client to server** | Between witness device and evidence vault backend | Authenticated uploads, server-signed receipts |
| **TB-4: Server to storage** | Between ingestion service and blob storage | Re-encrypted blobs, custody log entries |
| **TB-5: Publisher to distribution** | Between NGO publisher systems and bulletin distribution channels | Signed bulletins, trust bundle updates |
| **TB-6: Server to investigator** | Between evidence vault and credentialed investigators / ICC | Threshold-decrypted evidence packages |
| **TB-7: Key custodians** | Between individual escrow holders and the MPC vault | Partial keys; no single holder has full access |

---

## 6. STRIDE Analysis by Component

### 6.1 Legend

- **S** = Spoofing | **T** = Tampering | **R** = Repudiation | **I** = Information Disclosure | **D** = Denial of Service | **E** = Elevation of Privilege

### 6.2 Component: Capture and Hash (Client-Side)

| Threat ID | Category | Description | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| C-S-1 | Spoofing | Adversary substitutes a malicious PWA served from a lookalike domain | Medium | Critical | HTTPS with HSTS; SubResource Integrity (SRI) on service worker scripts; printed QR entrypoint distributed out-of-band |
| C-T-1 | Tampering | Adversary modifies captured media before hashing (e.g. via MitM on camera API) | Low | Critical | Hash computed immediately on raw `ArrayBuffer` before any further processing; no round-trips to network |
| C-T-2 | Tampering | JavaScript environment tampered via XSS to alter hash output | Low | Critical | Content Security Policy (CSP); no external scripts; strict integrity checks |
| C-R-1 | Repudiation | Witness denies capturing specific evidence | Low | Medium | Device-signed `HashReceipt`; custody log with GENESIS anchor; server-signed receipt on upload |
| C-I-1 | Information Disclosure | GPS or device identifiers leak from captured file | High | Critical | Mandatory metadata stripping before encryption; GPS removed from EXIF; device ID removed from media headers |
| C-I-2 | Information Disclosure | Plaintext media visible in browser memory / cache before encryption | Medium | High | Encryption performed synchronously before any IndexedDB write; in-memory buffers not persisted |
| C-D-1 | Denial of Service | Low-storage device cannot complete encryption or storage | Medium | Medium | Battery and storage pre-checks before capture; graceful degradation with user warning |
| C-E-1 | Elevation of Privilege | PWA requests elevated system permissions beyond camera | Low | Medium | Minimal permission model; only camera/microphone requested; no location permission requested |

### 6.3 Component: Local Encrypted Storage (OPFS + IndexedDB)

| Threat ID | Category | Description | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| S-S-1 | Spoofing | Rogue browser extension impersonates the Witness origin to read OPFS | Low | Critical | OPFS is origin-isolated by browser; no cross-origin access possible |
| S-T-1 | Tampering | Adversary with physical device access modifies IndexedDB records | High (if seized) | High | All metadata encrypted at application layer before storage; custody log is hash-chained — modification detectable |
| S-T-2 | Tampering | Chunk manifest altered to exclude evidence chunks | Medium | High | Per-chunk SHA-256 hashes in manifest; re-verified on assembly and on server ingestion |
| S-R-1 | Repudiation | Custody log entries deleted or reordered | Medium | High | Hash-chained `prev_hash` field; any deletion breaks chain verification (`verifyLog()`) |
| S-I-1 | Information Disclosure | Encrypted blobs read from OPFS by adversary with device | High (if seized) | Low–Medium | Blobs are AES-256-GCM encrypted; key not stored alongside blob; requires key derivation |
| S-I-2 | Information Disclosure | IndexedDB metadata (filenames, timestamps) readable without key | High (if seized) | Medium | Metadata fields also encrypted at application layer before IndexedDB write |
| S-D-1 | Denial of Service | Storage quota exhausted; uploads stall | Medium | Medium | Upload queue prioritises smallest evidence items first; storage quota checked before capture |
| S-E-1 | Elevation of Privilege | Service worker hijacked to serve malicious update | Low | Critical | Service worker update integrity checked; install prompt not automatic in conflict mode |

### 6.4 Component: Upload and Sync (tus + Background Sync)

| Threat ID | Category | Description | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| U-S-1 | Spoofing | Adversary stands up a rogue upload endpoint | Medium | High | Server certificate pinned in service worker (optional); TLS 1.3 enforced; server public key fingerprint distributed out-of-band |
| U-T-1 | Tampering | Encrypted chunk modified in transit | Low | High | TLS 1.3 provides transport-layer integrity; AES-GCM authentication tag provides application-layer integrity; server re-verifies hash on ingestion |
| U-R-1 | Repudiation | Upload claimed but not received by server | Low | Medium | Server returns signed receipt on successful ingestion; tus protocol provides upload offset acknowledgements |
| U-I-1 | Information Disclosure | Network observer identifies upload as evidence submission | High | High | Upload to a generic CDN path; no identifying URL structure; TLS prevents content inspection; timing obfuscation via background sync jitter |
| U-D-1 | Denial of Service | Network shutdown blocks all uploads | High | Medium | tus resumable protocol tolerates interruption; exponential backoff retry; evidence preserved locally until upload succeeds |
| U-D-2 | Denial of Service | Upload endpoint rate-limited or taken down | Medium | Medium | Multiple upload endpoints configurable; evidence stored locally; not lost on upload failure |
| U-E-1 | Elevation of Privilege | Upload credentials leaked, enabling arbitrary server writes | Low | High | No persistent credentials; uploads are anonymous; server assigns blob_id; no authenticated session required |

### 6.5 Component: Server Ingestion Pipeline

| Threat ID | Category | Description | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| SV-S-1 | Spoofing | Attacker submits forged evidence with fabricated custody log | Medium | High | Server re-verifies SHA-256 hash on ingestion; device ECDSA signature required; ML-DSA-65 second signature required |
| SV-T-1 | Tampering | Insider modifies custody log entries in PostgreSQL | Low | Critical | Append-only PostgreSQL table (INSERT only, no UPDATE/DELETE permissions for app user); cryptographic hash chain detects modification |
| SV-T-2 | Tampering | Blob in S3 storage replaced after ingestion | Low | Critical | SHA-256 hash stored in custody log at ingestion; re-verification on any access detects replacement |
| SV-R-1 | Repudiation | Server operator denies receipt of specific evidence | Low | High | Server-signed receipt returned to client at ingestion; receipt includes server timestamp and blob_id |
| SV-I-1 | Information Disclosure | Server operator can read blob metadata | Medium | High | Sensitive metadata (location, identity) encrypted under threshold keys; server operator holds no threshold key share |
| SV-I-2 | Information Disclosure | Server breach exposes evidence blobs | Medium | High | Blobs stored encrypted; server does not hold decryption keys; attacker obtains only ciphertext |
| SV-D-1 | Denial of Service | Server overwhelmed with upload requests | Medium | Medium | Rate limiting per IP; tus upload resumption prevents re-upload; CDN edge layer absorbs burst |
| SV-E-1 | Elevation of Privilege | Compromised ingestion service account accesses PostgreSQL as superuser | Low | Critical | Least-privilege DB user; ingestion service has INSERT-only on custody_log; no SELECT on threshold-encrypted fields |

### 6.6 Component: Plane B Bulletin System

| Threat ID | Category | Description | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| PB-S-1 | Spoofing | Adversary issues a forged bulletin impersonating a trusted NGO | Medium | High | Bulletins verified against locally cached trust bundle of publisher public keys; signature verification is offline-capable |
| PB-S-2 | Spoofing | Compromised publisher key used to issue malicious bulletin | Low | Critical | Publisher keys are short-lived (certificate validity); key revocation distributed via trust bundle update; validators audit publisher behaviour |
| PB-T-1 | Tampering | Bulletin contents modified after signing | Low | High | Hybrid ECDSA P-256 + ML-DSA-65 signature covers entire bulletin payload; any modification invalidates both signatures |
| PB-R-1 | Repudiation | Publisher denies issuing a specific bulletin | Low | Medium | Signatures are non-repudiable under the publisher's key; key issuance logged by trust bundle authorities |
| PB-I-1 | Information Disclosure | Bulletin distribution reveals NGO operational location | Medium | High | Bulletins distributed via QR, P2P, and printed cards; no centralised distribution server required; server-based distribution uses generic CDN paths |
| PB-D-1 | Denial of Service | Adversary floods device with invalid bulletins | Low | Medium | Invalid signature bulletins rejected immediately; trust bundle defines allowed publisher set; no processing of untrusted-origin bulletins |
| PB-E-1 | Elevation of Privilege | Publisher role exploited to issue tokens without proper authorisation | Low | High | Multi-party publisher key management; validator role audits token issuance rates; short token expiry limits blast radius |

### 6.7 Component: Key Management and Device Keys

| Threat ID | Category | Description | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| KM-S-1 | Spoofing | Adversary generates a device key and claims to be a specific witness device | Low | Medium | Device keys are not used to establish identity; they establish evidence integrity only; no registry of device-to-identity mapping |
| KM-T-1 | Tampering | Device master key extracted and used to decrypt evidence | High (if seized) | Critical | Key stored in Web Crypto key storage (non-exportable in hardened configuration); passphrase-derived key wraps master key via Argon2id |
| KM-I-1 | Information Disclosure | Argon2id-derived key cracked via brute force | Medium | Critical | OWASP parameters: m=19456, t=2, p=1; passphrase-free mode uses hardware-backed key storage where available |
| KM-I-2 | Information Disclosure | Key material persists in browser memory after purge | Medium | High | Panic purge zeroes key material references; browser GC not guaranteed — this is a residual risk |
| KM-D-1 | Denial of Service | Device key corrupted; evidence inaccessible | Low | High | Key backup via QR export to trusted second device; not automatic — witness must opt in |
| KM-E-1 | Elevation of Privilege | Insider with server access generates fraudulent device keys | Low | High | Server does not generate device keys; keys are generated client-side via `crypto.subtle.generateKey`; server receives only public key material |

### 6.8 Component: P2P Transfer

| Threat ID | Category | Description | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| P2P-S-1 | Spoofing | Adversary device poses as trusted helper device | Medium | High | Out-of-band pairing confirmation (QR code exchange of public keys before transfer); no automatic pairing |
| P2P-T-1 | Tampering | Evidence chunks modified during P2P transfer | Low | High | Chunk-level SHA-256 hashes verified on receipt; AES-GCM authentication tag covers each chunk |
| P2P-I-1 | Information Disclosure | Wi-Fi Direct probe frames expose device identifiers | High | High | Wi-Fi Direct uses probe requests visible to nearby radio observers; device MAC address exposed; accepted residual risk (cannot mitigate at application layer) |
| P2P-I-2 | Information Disclosure | P2P transfer content readable by passive observer | Low | Low | Transfer payload is ciphertext; AES-256-GCM provides confidentiality |
| P2P-D-1 | Denial of Service | Adversary jams Wi-Fi / Bluetooth to block P2P | High | Medium | Jamming is a physical-layer attack; application layer cannot mitigate; QR air-gap transfer available as fallback |

---

## 7. LINDDUN Privacy Analysis

LINDDUN analyses privacy threats from the perspective of the witness as a data subject. In this context, witness identity disclosure is a potentially lethal risk.

### 7.1 LINDDUN Categories

| Category | Description |
|---|---|
| **L** — Linking | Combining data items to reveal more than either reveals alone |
| **I** — Identifying | Identifying a natural person from pseudonymous or anonymous data |
| **N** — Non-repudiation | Inability to plausibly deny involvement in an action |
| **D** — Detecting | Inferring that a person performed a sensitive action even without content |
| **Da** — Data Disclosure | Exposing data to parties beyond the intended recipients |
| **U** — Unawareness | Subject is unaware of data collection or use |
| **Nc** — Non-compliance | System fails to comply with privacy regulations or commitments |

### 7.2 Analysis Table

| Threat ID | Category | Asset | Description | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|---|
| LL-L-1 | Linking | Upload timing + GPS metadata | Upload timestamp correlated with known network access events to identify witness location | High | Critical | GPS stripped before encryption; upload timing obfuscated via background sync jitter; TLS hides upload contents |
| LL-L-2 | Linking | Device fingerprint across sessions | Browser fingerprint (user agent, screen resolution, timezone) re-identifies witness across sessions | Medium | High | No persistent session cookies; no analytics; no cross-session identifiers; app is installable PWA (reduces browser fingerprint exposure) |
| LL-L-3 | Linking | Bulk custody log analysis | Server operator analyses timing patterns across custody logs to identify which device submitted which evidence | Medium | High | Custody logs stored encrypted; evidence_id is random UUID; no cross-evidence linkage in server-visible data |
| LL-I-1 | Identifying | EXIF metadata | EXIF GPS, device model, or lens data in media file identifies witness or location | High | Critical | EXIF stripped from all media before encryption; both file-level and application-level stripping |
| LL-I-2 | Identifying | Upload network metadata | Source IP address identifies witness location to server operator | High | High | Accepted risk for standard upload; Tor / VPN guidance provided; satellite upload hides ground-level IP |
| LL-I-3 | Identifying | Evidence content | Media content itself identifies the witness (face visible, voice audible) | High | Critical | Out of scope for technical mitigation; witness guidance provided in UX; content-aware redaction is a V2 feature |
| LL-N-1 | Non-repudiation | Device signature on HashReceipt | Witness cannot deny having created a specific HashReceipt because it is signed by their device key | Medium | High | Device keys are not registered against identities; key is generated fresh per-install with no identity binding; accepted trade-off for evidence integrity |
| LL-N-2 | Non-repudiation | Custody log GENESIS event | First custody event links device to evidence item | Low | Medium | Custody logs stored encrypted on server; access requires threshold key collaboration |
| LL-D-1 | Detecting | Upload traffic pattern | Network observer detects that a device is uploading data to the Witness vault endpoint, inferring the witness is capturing evidence | High | Critical | Uploads addressed to generic CDN endpoints; no distinctive URL structure; upload timing randomised; no distinctive TLS SNI in default configuration |
| LL-D-2 | Detecting | App installation footprint | Witness PWA listed in installed app list | Medium | High | PWA leaves minimal OS-level footprint; panic purge removes service worker registration; no app store entry |
| LL-D-3 | Detecting | Battery drain pattern | Background sync causes battery pattern that adversary could correlate | Low | Medium | Background sync throttled; battery-aware pause below 20%; negligible signal in practice |
| LL-Da-1 | Data Disclosure | Threshold-encrypted metadata | Location and identity metadata decrypted by compromised key custodian | Low | Critical | M-of-N threshold scheme; no single custodian can decrypt; compromise requires collusion of M custodians |
| LL-Da-2 | Data Disclosure | Bulletin token redemption logs | Site operator logs token redemption events, building a record of who accessed services | Medium | High | Aggregate counts only synced to server; no per-individual redemption records transmitted; local logs are device-scoped |
| LL-U-1 | Unawareness | Metadata preserved in encrypted vault | Witness does not know that capture timestamp and truncated location are preserved in the encrypted vault | Medium | Medium | Transparent disclosure in UX at first capture; documentation of what is and is not stripped |
| LL-U-2 | Unawareness | P2P transfer leaves custody trail | Witness does not know that P2P transfer appends a `transferred_p2p` event to custody log | Low | Medium | Custody log is user-readable in the app; transfer confirmation screen summarises what is recorded |
| LL-Nc-1 | Non-compliance | GDPR / data protection law | Evidence upload may constitute cross-border personal data transfer triggering legal obligations | Medium | Medium | Server operated within humanitarian legal frameworks; legal review for each deployment jurisdiction; data minimisation by design |
| LL-Nc-2 | Non-compliance | UNHCR data protection policy | Systematic collection of displacement-related data without adequate safeguards | Low | Medium | OCHA Data Responsibility Guidelines 2021 applied throughout; no persistent personal data retained in plaintext |

---

## 8. Mitigations Table

| Threat ID | Threat Summary | Mitigation | Implementation Location |
|---|---|---|---|
| C-T-1 | Media tampered before hashing | Hash computed on raw `ArrayBuffer` before any processing | `hash.ts: hashFile()` |
| C-I-1 | GPS / device ID in captured file | EXIF stripping at capture | Capture pipeline (Phase 2) |
| C-I-2 | Plaintext in browser memory | Encrypt before any IndexedDB write | `encrypt.ts: encrypt()` |
| S-T-1 | IndexedDB metadata tampered | Application-layer encryption of all metadata fields | `encrypt.ts` |
| S-R-1 | Custody log deleted or reordered | Hash-chained `prev_hash` field in every event | `custody-log.ts: verifyLog()` |
| S-I-1 | Encrypted blobs read from OPFS | AES-256-GCM with 12-byte random IV; 128-bit auth tag | `encrypt.ts: encrypt()` |
| U-T-1 | Chunk modified in transit | TLS 1.3 + AES-GCM authentication tag | Transport + `encrypt.ts` |
| U-D-1 | Network shutdown blocks uploads | tus resumable protocol + exponential backoff + local persistence | Upload queue (Phase 2) |
| SV-S-1 | Forged evidence submitted | SHA-256 hash re-verification + ECDSA + ML-DSA-65 verification | Server ingestion (Phase 2) |
| SV-T-1 | Insider modifies custody log | Append-only PostgreSQL; INSERT-only DB user; hash chain | Server (Phase 2) |
| SV-I-2 | Server breach exposes blobs | Blobs encrypted; server holds no decryption keys | Key hierarchy design |
| KM-T-1 | Device master key extracted | Argon2id key wrapping (m=19456, t=2, p=1) + Web Crypto non-exportable keys | `kdf.ts: deriveAndWrapKey()` |
| KM-I-1 | Argon2id brute-forced | OWASP-recommended Argon2id parameters | `kdf.ts: KDF_PARAMS` |
| PB-S-1 | Forged bulletin | Offline hybrid signature verification against trust bundle | Bulletin verifier (Phase 2) |
| PB-T-1 | Bulletin tampered after signing | ECDSA P-256 + ML-DSA-65 hybrid signature | `signing.ts` + PQC layer |
| PB-S-2 | Compromised publisher key | Short-lived certificates + revocation list in trust bundle | Trust bundle governance |
| P2P-S-1 | Rogue helper device | Out-of-band QR key exchange before transfer | Contact-code QR pairing (`ecdh.ts` + comms screen); mesh messages sealed to the exchanged key |
| P2P-T-1 | Chunks tampered during transfer | Per-chunk SHA-256 + AES-GCM auth tag | `hash.ts: hashStream()` + `encrypt.ts` |
| LL-I-1 | EXIF identifies witness | Mandatory EXIF strip before encryption | Capture pipeline |
| LL-D-1 | Upload traffic pattern detected | Generic CDN endpoint; timing randomisation; background sync | Upload queue design |
| LL-Da-1 | Threshold key custodian compromised | M-of-N MPC threshold scheme; no single-point decryption | Key escrow governance |
| LL-L-2 | Browser fingerprint re-identifies | No persistent cookies; no analytics; no cross-session IDs | Application design |

---

## 9. Residual Risks

The following risks are acknowledged but are not fully mitigated by the current design. They are accepted residual risks with documented rationale.

| Risk | Rationale for Acceptance | Partial Mitigation |
|---|---|---|
| Source IP address exposure on upload | Fundamentally a network-layer attribute; application cannot hide it without requiring Tor/VPN, which is impractical in conflict settings | Satellite upload path hides ground-level IP; Tor guidance in advanced mode |
| Device MAC address in Wi-Fi Direct probe frames | MAC randomisation is OS-controlled; application cannot mandate it across all devices | MAC randomisation enabled by default on Android 10+; guidance provided |
| Browser memory not guaranteed wiped on panic purge | Garbage collection timing is outside application control | Purge zeroes all known references; key material held as `CryptoKey` objects (not raw bytes) where possible |
| Evidence content identifies witness (face, voice) | Content analysis is computationally expensive and high-risk to auto-apply | Content-aware redaction is a Phase 2 feature; witness guidance on content caution |
| Witness device compromised by pre-installed malware | Hardware-level or OS-level compromise is out of scope | Application-layer mitigations are ineffective against root-level compromise; this is documented and disclosed |
| LoRa / satellite relay operator as adversary | Relay operator sees encrypted payloads + metadata (frequency, timing) | Payload is encrypted; metadata analysis is a residual risk for relay-based transfer |

---

## 10. Out of Scope

The following threats are explicitly out of scope for this threat model:

1. **Hardware implants and supply-chain attacks on the device.** Any threat that requires physical access to the device before it reaches the witness (e.g. firmware backdoors, hardware keyloggers) is out of scope. Mitigation would require hardware attestation and is not feasible in the target deployment environment.

2. **Nation-state OPSEC failures.** If a trusted NGO publisher or key custodian organisation is infiltrated at an operational security level (e.g. staff compromised, premises surveilled), this threat model does not cover the resulting exposures beyond the cryptographic mitigations already described.

3. **Rubber-hose cryptanalysis beyond the deniable vault.** Physical coercion of the witness to reveal a passphrase is addressed only by the panic purge mechanism. Once a witness discloses their passphrase under duress, application-layer cryptography provides no further protection. This is explicitly documented in user guidance.

4. **Zero-day browser vulnerabilities.** Exploitation of unpatched vulnerabilities in the browser's JavaScript engine or Web Crypto implementation is out of scope. The system relies on browser vendors for this security boundary.

5. **Legal compulsion of server operator.** If the server operator is compelled by lawful order to produce evidence, this is a governance and legal matter, not a technical threat. The system is designed so that the server operator holds only encrypted blobs and cannot produce plaintext evidence without threshold key collaboration.

6. **Social engineering of key custodians.** Manipulation of individual key custodians to reveal their key shares is addressed by the M-of-N threshold scheme (requiring M colluding custodians) but social engineering of M custodians simultaneously is out of scope.

7. **Attacks on the underlying TLS certificate infrastructure.** BGP hijacking, CA compromise, or certificate misissuance are out of scope except where certificate pinning is applied.

8. **Forensic recovery of files after panic purge.** The panic purge is a best-effort wipe of application-controlled storage. It does not guarantee forensic-level deletion; flash storage wear-levelling may retain residual data accessible via specialised hardware. This limitation is disclosed in user documentation.

---

*This threat model is a living document. It should be reviewed following any significant architectural change, following a security incident, and at minimum annually.*
