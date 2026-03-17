# Contributing to Witness

Thank you for considering contributing. Witness is a humanitarian project — every contribution, however small, has direct implications for real people in dangerous situations. Please read this document carefully before starting work.

---

## Before you contribute

Witness is not a typical open-source project. The people who will use it may be in life-threatening situations. This means:

- **Do no harm is a design principle, not a disclaimer.** If a feature could expose a witness to risk — even in an edge case — it should not ship without a thorough security review.
- **Simplicity is a safety feature.** Resist the urge to add complexity. Every additional step in the capture flow is a step someone under extreme stress might fail to complete.
- **Offline-first is non-negotiable.** No feature should degrade the offline experience. If it requires a connection to work at all, reconsider it.

---

## Ways to contribute

### What we need most

| Area | What this means |
|---|---|
| **Security review** | Audit the cryptographic pipeline, threat model, and key management. Find holes before adversaries do. |
| **Field UX research** | Experience with displaced communities, conflict zones, or low-literacy user testing. This is more valuable than most code contributions. |
| **Translations** | Priority languages: Arabic, Tigrinya, Ukrainian, Burmese, Dari, Pashto, French. Must be done with native speakers who understand the context — not machine translation. |
| **Backend / cryptography** | Secure vault ingestion, threshold encryption implementation, audit log integrity. |
| **Frontend / PWA** | Service worker optimisation, offline storage reliability, panic purge UX, QR generation. |
| **NGO partnerships** | Connections to human rights organisations, legal counsel, or ICC investigators. |
| **Legal review** | Cross-border evidence admissibility, GDPR/data protection across jurisdictions, IHL compliance for Plane B. |
| **Documentation** | Field deployment guides, NGO onboarding materials, translated user guides. |

### What we are not looking for right now

- Features that require persistent user accounts or identity
- Analytics, tracking, or usage metrics on the civilian-facing side
- Social features, sharing, or public evidence feeds
- Anything that increases on-device storage footprint without a clear safety justification

---

## Getting started

### 1. Read the architecture first

Before touching any code, read the full [README](README.md). Understand the two-plane model (Plane A evidence, Plane B safe info), the threat model, and the UX principles for conflict settings. Contributing without this context risks introducing design decisions that look reasonable from a software perspective but are dangerous in the field.

### 2. Check existing issues

Look at open issues before starting work. If the issue you want to tackle is not filed yet, open one first and describe what you intend to do. This prevents duplicated effort and allows for discussion before significant work is invested.

Label guide:

| Label | Meaning |
|---|---|
| `good-first-issue` | Well-scoped, low risk, good entry point |
| `security` | Requires security expertise — do not work on this without flagging first |
| `field-ux` | Requires input from people with field or humanitarian experience |
| `needs-legal-review` | Do not merge without sign-off from legal counsel |
| `plane-a` | Evidence preservation plane |
| `plane-b` | Safe information plane |
| `offline` | Offline capability — test thoroughly before PRing |
| `translation` | Localisation work |

### 3. Set up locally

```bash
git clone https://github.com/[your-username]/witness.git
cd witness
npm install
npm run dev
```

Open `localhost:5173`. The basic capture flow works without any environment variables.

For the full stack including the vault backend:

```bash
cp .env.example .env
# Fill in required values — see .env.example for documentation
npm run dev:full
```

### 4. Create a branch

```bash
git checkout -b your-name/short-description
# e.g. git checkout -b sara/offline-queue-retry
```

Use the format `your-name/short-description`. Keep branches focused — one concern per branch.

---

## Development guidelines

### Code standards

- TypeScript throughout — no `any` types except where genuinely unavoidable and explicitly commented
- All cryptographic operations must go through the Web Crypto API — no third-party crypto libraries without security review and documented justification
- Every new feature touching evidence handling must have a corresponding entry in the threat model documentation
- No `console.log` in production code — use the structured logger
- All user-facing strings must go through the i18n layer — no hardcoded English

### Testing

```bash
npm run typecheck     # Must pass before any PR
npm run test          # Unit tests
npm run test:offline  # Offline scenario tests — run these for any PWA changes
npm run build         # Verify production build succeeds
```

For offline testing specifically: use browser DevTools → Network → Offline mode, and also test with the service worker fully unregistered. These are different failure modes.

### Sensitive areas — extra care required

The following areas of the codebase require a second reviewer with relevant expertise before merge:

| Area | Required reviewer expertise |
|---|---|
| `src/crypto/` | Cryptography |
| `src/offline/queue.ts` | PWA / service workers |
| `src/capture/metadata.ts` | Privacy / data minimisation |
| `src/plane-b/publisher.ts` | IHL / humanitarian data governance |
| `src/panic/purge.ts` | Security / forensics |
| Any changes to the threat model doc | Security |

### What not to do

- Do not add any third-party analytics, error tracking, or telemetry to the civilian-facing capture flow
- Do not store plaintext media at any point — the encrypt step is not optional
- Do not collect precise GPS coordinates by default — this is a privacy and safety decision, not a missing feature
- Do not add features that make the app more "discoverable" on a device (homescreen icons, notification badges, etc.) without considering the seizure risk
- Do not log sensitive data anywhere — if in doubt, do not log it

---

## Submitting a pull request

### PR checklist

Before opening a PR, confirm:

- [ ] I have read the architecture documentation in the README
- [ ] My changes do not degrade the offline capture flow
- [ ] I have not added any tracking, analytics, or telemetry to the civilian-facing side
- [ ] All new user-facing strings are in the i18n layer
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] `npm run test:offline` passes (for any PWA-related changes)
- [ ] If my changes touch a sensitive area, I have flagged this in the PR description
- [ ] If my changes affect the threat model, I have updated the threat model documentation

### PR description format

```
## What this does
[One paragraph describing the change and why]

## How to test
[Specific steps to verify the change works, including offline scenarios if relevant]

## Security considerations
[Any security implications, even if you believe they are mitigated]

## Does this affect the threat model?
[Yes / No — if yes, describe how]
```

### Review process

- All PRs require at least one review
- PRs touching sensitive areas (see above) require a reviewer with the relevant expertise
- PRs with `needs-legal-review` label cannot merge until legal sign-off is documented in the PR thread
- Maintainers may close PRs that add complexity without a clear safety or humanitarian justification — this is not a reflection of the quality of your work

---

## Translation contributions

Translations are among the most impactful contributions to this project. A witness in Khartoum or Mariupol using the app in their own language is a better-protected witness.

Guidelines for translation work:

- **Native speakers only** — or at minimum, reviewed by a native speaker
- **Context matters** — some English terms have no direct equivalent; prioritise clarity over literal translation
- **Legal jargon must be avoided** — if the translated term sounds like something from a courtroom, find a simpler word
- **Test at low literacy** — ideally have someone with limited formal education review the UI strings
- File location: `src/i18n/[language-code].json`
- Open an issue before starting a new language so we can coordinate

Priority languages and their ISO codes:

| Language | Code | Status |
|---|---|---|
| Arabic | `ar` | Needed |
| Tigrinya | `ti` | Needed |
| Ukrainian | `uk` | Needed |
| Burmese | `my` | Needed |
| Dari | `fa-AF` | Needed |
| Pashto | `ps` | Needed |
| French | `fr` | Needed |
| Spanish | `es` | Needed |

---

## Field research contributions

If you have experience working with displaced communities, in conflict-affected areas, or in humanitarian response, your input is more valuable than most code contributions.

Specifically useful:

- Observational research on how people use phones under stress
- Feedback on the one-tap capture UX from non-technical users
- Knowledge of what actually happens at checkpoints when phones are searched
- Understanding of which NGOs operate in specific conflict theatres
- Lived experience as a displaced person or conflict survivor

Please open an issue tagged `field-ux` or reach out directly. This kind of insight shapes core design decisions that code review cannot.

---

## NGO and legal partnerships

If you work at, or have connections to, any of the following types of organisations, we want to hear from you:

- Human rights documentation organisations (evidence preservation, verification)
- ICC or international tribunal support organisations
- Digital rights and internet freedom organisations
- Refugee and displacement response NGOs
- Legal counsel with expertise in international humanitarian law or cross-border data protection

Open an issue tagged `partnership` or email directly.

---

## Code of conduct

Contributors to Witness are expected to:

- Treat all contributors with respect, regardless of experience level
- Prioritise the safety of the people this tool is built for above all other considerations
- Be honest about limitations, uncertainties, and security risks — do not overstate what the tool can guarantee
- Acknowledge that contributors from conflict-affected regions and humanitarian fields bring expertise that technical contributors do not

Behaviour that will result in removal from the project:

- Introducing surveillance, tracking, or covert data collection of any kind
- Misrepresenting the security guarantees of the tool in ways that could endanger users
- Dismissing safety concerns raised by field researchers or security reviewers

---

## Questions

Open an issue, start a GitHub Discussion, or email [your email].

If your question relates to a potential security vulnerability, follow the process in [SECURITY.md](SECURITY.md) instead.
