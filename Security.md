# Security Policy

Witness is a tool used by civilians in active conflict zones. A security vulnerability in this project is not just a software problem — it could directly endanger the lives of people who depend on it. We take every report seriously and will respond as quickly as possible.

---

## What counts as a security vulnerability in this project

Because of the nature of Witness, the definition of a security vulnerability is broader than in most software projects. The following are all in scope:

**Critical — report immediately:**

- Any vulnerability that could expose a witness's identity, location, or the fact that they used this app
- Any way for an adversary who has seized a device to recover encrypted evidence, identify the witness, or determine what was submitted
- Any failure in the cryptographic pipeline that could allow evidence to be tampered with without detection
- Any way to forge a hash receipt or chain-of-custody log entry
- Any vulnerability in the panic purge that leaves recoverable data on the device after purge is triggered
- Any way to intercept or modify evidence in transit that bypasses our encryption
- Any server-side vulnerability that could expose submitted evidence or witness metadata
- Any way a malicious publisher could issue fraudulent Plane B bulletins that endanger survivors

**High — report within the disclosure window:**

- Vulnerabilities in the offline queue that could cause evidence to be lost silently (witness believes it was submitted, but it was not)
- Any way for a third party to correlate anonymous submissions to a specific witness over time
- Weaknesses in the threshold encryption or key escrow implementation
- Any telemetry, logging, or data collection that was not intended and could create a record of who used the app
- Service worker vulnerabilities that could expose cached sensitive data

**In scope but lower severity:**

- General web vulnerabilities (XSS, CSRF) in the analyst dashboard
- Information disclosure in non-sensitive parts of the app
- Denial of service vulnerabilities

**Out of scope:**

- Vulnerabilities in third-party dependencies we do not control (report these upstream)
- Social engineering attacks against NGO partners
- Physical attacks against devices (outside the scope of software)
- Theoretical attacks with no practical exploitation path

---

## How to report a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.** A public issue could be seen by adversaries before it is fixed, potentially endangering people currently using the app.

### Preferred: Encrypted email

Send a report to: **[your security email]**

If you use PGP, please encrypt your report. Our public key:

```
[Your PGP public key block here]

Key fingerprint: [fingerprint]
```

### Alternative: GitHub private security advisory

Use GitHub's private security advisory feature:

1. Go to the repository Security tab
2. Click "Report a vulnerability"
3. Fill in the details — this is end-to-end private between you and maintainers

### What to include in your report

Please provide as much of the following as you can:

```
Vulnerability type:
[e.g. cryptographic weakness / data exposure / identity leak / evidence tampering]

Affected component:
[e.g. src/crypto/hash.ts / offline queue / panic purge / Plane B publisher verification]

Description:
[Clear explanation of the vulnerability]

Steps to reproduce:
[Specific steps if applicable]

Impact:
[What can an adversary do with this? Who is at risk?]

Suggested fix (optional):
[If you have an idea of how to address it]

Your contact details (optional):
[Only if you are willing to be contacted for follow-up]
```

---

## What happens after you report

| Timeframe | What we will do |
|---|---|
| Within 48 hours | Acknowledge receipt of your report |
| Within 7 days | Provide an initial assessment — is this confirmed, needs more investigation, or out of scope |
| Within 30 days | For confirmed vulnerabilities: patch, test, and prepare a release |
| At release | Publish a security advisory crediting you (if you wish) |
| After release | Post a public disclosure of the vulnerability and fix |

For critical vulnerabilities (witness identity exposure, evidence tampering), we will move faster than this timeline — these are treated as incidents requiring immediate response.

If we need more information from you during investigation, we will reach out via the contact method you provided.

---

## Coordinated disclosure

We follow a **coordinated disclosure** model:

- We ask that you give us a reasonable opportunity to fix the vulnerability before publishing details publicly
- Our default disclosure window is **90 days** from the date of your report
- For critical vulnerabilities actively endangering users, we may ask for a shorter embargo to patch faster — we will communicate this clearly
- If we cannot fix within 90 days, we will tell you why and negotiate an extension in good faith
- If we go dark and do not respond within two weeks of your report, you are free to disclose publicly

We will never threaten legal action against good-faith security researchers. Responsible disclosure is a contribution to this project and to the safety of the people it serves.

---

## Scope of our security guarantees

Witness makes specific guarantees and we want to be honest about what lies outside them.

### What we guarantee

- Evidence files are encrypted on-device before any network operation occurs
- A SHA-256 hash of the original file is generated at the moment of capture — any subsequent tampering is detectable
- The custody log is tamper-evident — each event is chained to the previous one
- Sensitive metadata (precise location, identity) is not stored in plaintext on the device
- The panic purge deletes the encrypted queue and sensitive caches

### What we do not guarantee

- **Forensic invisibility** — the panic purge reduces on-device residue but cannot guarantee that all traces are unrecoverable by a sophisticated forensic attacker with physical access to the device
- **Complete GPS removal** — we strip GPS from files, but some devices embed location in ways that require ongoing testing across handset models
- **Browser history privacy** — accessing a PWA through a browser may leave traces in browser history. The app cannot fully control this. We provide guidance on using private/incognito mode, but cannot enforce it.
- **Network metadata** — even with encrypted content, the fact that a device connected to our servers may be visible to a network-level observer. We do not collect IP addresses, but we cannot prevent upstream logging by network operators.
- **Coercion resistance** — if a witness is compelled under duress to unlock their device and open the app, we cannot prevent forced disclosure. The panic purge must be triggered before this point.

We document these limitations honestly because overstating security guarantees in this context is dangerous.

---

## Our security architecture (summary)

For context when evaluating reports:

| Layer | Implementation |
|---|---|
| Evidence encryption | AES-256-GCM, keys generated in Web Crypto API |
| File integrity | SHA-256 hash at capture |
| Transport | TLS 1.3 |
| Publisher signatures | Ed25519 |
| Sensitive metadata escrow | Shamir's Secret Sharing (threshold) |
| Offline storage | IndexedDB with encrypted blobs — no plaintext |
| Key storage | Web Crypto API non-extractable keys where supported |

Full architecture is documented in [README.md](README.md).

---

## Known limitations under active investigation

The following are known issues we are working on — please do not report these as new vulnerabilities, though additional details or reproduction steps are welcome:

- Browser-level history and cache behaviour varies across handsets and browser versions — ongoing testing
- Wi-Fi Direct / P2P proximity signalling creates a potential radio presence indicator — documented in architecture, mitigation under design
- Background sync timing on some Android versions is unpredictable — may cause delayed uploads that the witness is unaware of

---

## Security hall of fame

We credit researchers who responsibly disclose valid vulnerabilities. With your permission, your name will appear here.

| Researcher | Finding | Year |
|---|---|---|
| — | — | — |

*If you have reported a vulnerability and wish to be credited, let us know.*

---

## Contact

Security reports: **[your security email]**
PGP fingerprint: **[fingerprint]**
General contact: **[your email]**
GitHub: **[your GitHub username]**

For non-security issues, please use GitHub Issues or Discussions.
