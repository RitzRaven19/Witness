# Witness — Plane F: On-Device Intelligence

**Version:** 0.1 (draft)
**Date:** 2026-03-27
**Status:** Proposal — pending review

---

## Overview

Plane F brings offline AI assistance to Witness — the function that **PocketPal AI** provides as a standalone app — integrated directly into the platform where it can serve all other planes.

A small quantized language model runs entirely in the browser or as a native module. No data leaves the device. No API key. No internet required for inference. The model is distributed as a signed bundle through the same trust chain as Plane C and Plane D content.

Plane F is **not a general-purpose chatbot**. It is a task-specific assistant scoped to the needs of civilians, survivors, and aid workers in conflict settings.

---

## Design constraints

| Constraint | Rationale |
|---|---|
| Inference runs entirely on-device | No prompts, no responses, no query history leaves the device |
| No inference log stored | A seized device must not reveal what questions were asked |
| Model bundle is NGO-signed | Prevents malicious model substitution |
| Model runs in a Web Worker | Inference never blocks the UI; capture flow is always responsive |
| Battery-aware | Inference pauses when battery < 20%; user is notified |
| Panic purge does not remove the model | The model contains no user data; only the conversation context is cleared |
| Conversation context cleared on app close | No persistent conversation history |

---

## Model selection

The model must balance capability against the hardware constraints of low-end Android devices in conflict zones (2–4 GB RAM, no dedicated GPU, ARM Cortex-A55 class CPU).

### Primary candidate: Phi-3.5-mini (3.8B, 4-bit quantized)

| Property | Value |
|---|---|
| Parameters | 3.8 billion |
| Quantization | 4-bit (GGUF Q4_K_M) |
| Model size on disk | ~2.2 GB |
| RAM required at inference | ~2.5 GB |
| Inference speed (Cortex-A55) | ~5–10 tokens/sec |
| Languages | English primary; limited Arabic, French, Ukrainian |
| Licence | MIT |

### Fallback: Gemma-2B (2B, 4-bit quantized)

| Property | Value |
|---|---|
| Parameters | 2 billion |
| Quantization | 4-bit (GGUF Q4_K_M) |
| Model size on disk | ~1.2 GB |
| RAM required at inference | ~1.5 GB |
| Inference speed (Cortex-A55) | ~10–15 tokens/sec |
| Languages | English, limited multilingual |
| Licence | Gemma Terms of Use (free for permitted uses) |

The device downloads the appropriate model based on available storage and RAM. If neither model fits, Plane F is disabled gracefully with no impact on other planes.

### Multilingual models (Phase 2)

For Arabic, Tigrinya, Burmese, and Ukrainian priority languages, fine-tuned or multilingual variants will be evaluated as hardware and quantization tooling matures. Initially, translation assistance (English as pivot language) is the fallback.

---

## Runtime

**Browser:** [WebLLM](https://github.com/mlc-ai/web-llm) (WebGPU-accelerated when available, CPU fallback)
**Native:** llama.cpp via WASM or native module bridge

The inference engine runs in a dedicated Web Worker, communicating with the main thread via a typed message protocol. The UI thread is never blocked during inference.

```typescript
// Main thread → Worker
type InferenceRequest = {
  request_id: string;
  task: InferenceTask;
  stream: boolean;          // If true, worker sends incremental token events
};

// Worker → Main thread (streaming)
type InferenceToken = {
  request_id: string;
  token: string;
  done: boolean;
};

// Worker → Main thread (error)
type InferenceError = {
  request_id: string;
  error: string;
};
```

---

## Task definitions

Plane F exposes structured tasks rather than a freeform chat interface. Each task has a defined prompt template and output schema. This prevents prompt injection from external content (e.g. a malicious Plane D article instructing the model to exfiltrate data — there is nothing to exfiltrate, but structured tasks also reduce confusion and improve reliability on small models).

### F.1 — Translate

Translate a Plane B bulletin, Plane D article excerpt, or mesh message into the user's preferred language.

```typescript
interface TranslateTask {
  type: 'translate';
  source_text: string;           // Max 2,000 characters
  source_language?: string;      // BCP-47; auto-detected if omitted
  target_language: string;       // BCP-47; from user preference
}

interface TranslateResult {
  translated_text: string;
  detected_source_language?: string;
}
```

### F.2 — Summarise

Produce a short summary of a Plane D article or bulletin, for quick reading in high-stress conditions.

```typescript
interface SummariseTask {
  type: 'summarise';
  source_text: string;           // Max 5,000 characters
  language: string;              // Output language (BCP-47)
  length: 'one_sentence' | 'three_bullets' | 'paragraph';
}

interface SummariseResult {
  summary: string;
}
```

### F.3 — Evidence description assist

Help a user write a plain-language description of captured evidence for the ICC submission metadata field. The model is given the media type and any contextual notes the user has typed; it produces a structured description.

```typescript
interface EvidenceDescribeTask {
  type: 'evidence_describe';
  media_type: string;            // e.g. 'video/mp4', 'image/jpeg'
  user_notes: string;            // What the user typed — max 500 characters
  language: string;              // Output language (BCP-47)
}

interface EvidenceDescribeResult {
  description: string;           // Plain language description
  suggested_category: string;    // e.g. 'civilian harm', 'infrastructure damage'
}
```

The description is stored as optional metadata on the EvidenceBlob. It is not used for routing or classification without explicit user approval.

### F.4 — Knowledge Q&A

Answer a question using Plane D bundle content as the knowledge base. The model is given relevant article excerpts (retrieved by keyword match) and synthesises an answer. No internet lookup.

```typescript
interface KnowledgeQATask {
  type: 'knowledge_qa';
  question: string;              // Max 500 characters
  context_articles: string[];    // Plaintext excerpts from Plane D — max 3,000 characters total
  language: string;              // Output language (BCP-47)
}

interface KnowledgeQAResult {
  answer: string;
  source_bundle_ids: string[];   // Which bundles the answer drew from
}
```

---

## Model distribution

The model bundle is distributed as a signed archive through the same channels as Plane C and Plane D content. It is treated as a large Plane D bundle with `payload_type: 'model_bundle'`.

```typescript
interface ModelBundle {
  bundle_id: string;
  model_id: string;              // e.g. 'phi-3.5-mini-q4'
  publisher_id: string;          // Signing key of the distributing organisation
  version: string;               // Semantic version
  size_bytes: number;            // Total compressed bundle size
  sha256: string;                // Hash of the complete bundle
  min_ram_mb: number;            // Minimum RAM required for inference
  min_storage_mb: number;        // Storage required after extraction
  signature: string;             // Ed25519 signature over canonical bundle metadata
}
```

Distribution channels by priority:

| Channel | Notes |
|---|---|
| On-connection download | Primary — fetched when connectivity is available |
| Plane E mesh (BT / LoRa) | Low priority; large chunks; long multi-hop transfer |
| USB sideload | Supported via File System Access API; user selects model file manually |
| Pre-installed (NGO deployment) | NGOs can pre-load the model on devices before field distribution |

The model is stored in OPFS after download and verification. It is not re-downloaded unless the version changes.

---

## Privacy

- **No inference log:** prompts and responses are never written to storage. They exist only in the Web Worker's memory for the duration of the session.
- **No telemetry:** no usage counts, no task types, no error reports leave the device.
- **Conversation context:** held in the Web Worker's in-memory context window. Cleared when the worker is terminated (app close, tab close, or explicit "clear" action).
- **No model training:** the model is static. User interactions do not update the model weights.

---

## Panic purge scope

The model file itself contains no user data and is not purged (it would require re-download of 1–2 GB). The purge clears:

```
Web Worker terminated immediately          # In-flight inference stopped
In-memory conversation context cleared    # All prompts and responses
```

The model file remains in OPFS and is available after the panic purge event — it is equivalent to a reference book that was not read during the incident.

If the user wants to remove the model entirely (to reclaim storage), a separate explicit action is available in settings.

---

## Relationship to other planes

| Plane | How Plane F serves it |
|---|---|
| Plane B | Translate signed bulletins into the user's language on-device |
| Plane C | Describe a map POI in plain language ("what is this shelter?") |
| Plane D | Summarise long articles; answer survival questions from bundle content |
| Plane A | Assist with evidence description for ICC submission metadata |
| Plane E | Plane F is not directly involved in mesh relay, but model bundles can travel via Plane E |

---

## Package

`@witness/on-device-ai`

```
packages/on-device-ai/
  src/
    worker/
      inference-worker.ts    # Web Worker — loads model, handles InferenceRequest messages
      model-loader.ts        # OPFS model file → WebLLM / llama.cpp runtime
    tasks/
      translate.ts           # TranslateTask prompt template + result parser
      summarise.ts           # SummariseTask prompt template + result parser
      evidence-describe.ts   # EvidenceDescribeTask prompt template + result parser
      knowledge-qa.ts        # KnowledgeQATask prompt template + result parser
    distribution/
      model-bundle.ts        # Bundle verification (Ed25519 signature check)
      model-store.ts         # OPFS storage for model files
    index.ts                 # Package exports — typed API over Worker message protocol
```

---

## Open questions

1. **Model selection:** Phi-3.5-mini vs Gemma-2B vs a purpose-fine-tuned smaller model? Fine-tuning on humanitarian content (ICRC field guides, MSF protocols) could significantly improve F.4 Knowledge Q&A quality at smaller model sizes.
2. **WebGPU availability:** most low-end Android devices in 2026 do not support WebGPU in the browser. Should the initial release target CPU-only WASM inference exclusively?
3. **Multilingual model:** is it better to ship one multilingual model or allow different model files per language to reduce download size?
4. **Offline fine-tuning:** is there a feasible path to letting NGOs distribute domain-adapted model weights (delta/LoRA weights) without shipping a full model? This could allow MSF to ship a "MSF first aid specialist" model variant at ~50 MB.
5. **Panic purge and model:** confirm with field partners whether the model file should be purgeable via the panic wipe, or whether the storage reclaim action is sufficient.
