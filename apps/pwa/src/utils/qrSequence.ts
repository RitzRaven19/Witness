/**
 * Multi-frame QR transfer codec (architecture.md §13.5 "QR code sequence").
 *
 * A signed ResourceBundle with ML-DSA-65 signatures far exceeds one QR code's
 * capacity (~2.9 KB absolute max; much less at phone-scannable density), so
 * larger payloads travel as an ordered sequence of frames. The sender displays
 * the frames in a loop; the receiver scans them in any order and reassembles.
 *
 * Frame format (pipe-separated, QR byte mode):
 *   WTN1|<enc>|<id>|<index>/<total>|<data>
 *
 *   enc   = 'g' gzip-compressed | 'r' raw
 *   id    = 8-hex transfer id (groups frames of one payload)
 *   index = 1-based frame number; total = frame count
 *   data  = base64url chunk of the (possibly compressed) payload
 *
 * Payloads are UTF-8 text (JSON in practice). Compression uses the browser's
 * CompressionStream when available, falling back to raw.
 */

const PREFIX = 'WTN1';
/** Payload characters per frame — keeps each QR at a phone-scannable density. */
export const FRAME_CHUNK_CHARS = 700;

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipeThrough(
  bytes: Uint8Array<ArrayBuffer>,
  stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> },
): Promise<Uint8Array<ArrayBuffer>> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Encode a text payload into the ordered list of QR frame strings. */
export async function encodeQrSequence(text: string): Promise<string[]> {
  const raw = new TextEncoder().encode(text);
  let enc: 'g' | 'r' = 'r';
  let bytes = raw;
  if (typeof CompressionStream !== 'undefined') {
    try {
      bytes = await pipeThrough(raw, new CompressionStream('gzip'));
      enc = 'g';
    } catch {
      bytes = raw;
    }
  }

  const data = b64urlEncode(bytes);
  const id = b64urlEncode(crypto.getRandomValues(new Uint8Array(4))).slice(0, 8);
  const total = Math.max(1, Math.ceil(data.length / FRAME_CHUNK_CHARS));
  const frames: string[] = [];
  for (let i = 0; i < total; i++) {
    const chunk = data.slice(i * FRAME_CHUNK_CHARS, (i + 1) * FRAME_CHUNK_CHARS);
    frames.push(`${PREFIX}|${enc}|${id}|${i + 1}/${total}|${chunk}`);
  }
  return frames;
}

export interface SequenceProgress {
  id: string;
  have: number;
  total: number;
}

export type PushResult =
  | { kind: 'not-sequence' }
  | { kind: 'progress'; progress: SequenceProgress }
  | { kind: 'complete'; text: string; progress: SequenceProgress };

/**
 * Order-tolerant reassembler for scanned frames. Feed every scanned QR string
 * to {@link push}; duplicates are ignored, and a frame from a different
 * transfer id restarts collection (the newest transfer wins).
 */
export class SequenceAssembler {
  private id: string | null = null;
  private total = 0;
  private enc: 'g' | 'r' = 'r';
  private parts = new Map<number, string>();

  /** True if the string looks like one of our sequence frames. */
  static isSequenceFrame(text: string): boolean {
    return text.startsWith(`${PREFIX}|`);
  }

  async push(text: string): Promise<PushResult> {
    if (!SequenceAssembler.isSequenceFrame(text)) return { kind: 'not-sequence' };

    const parts = text.split('|');
    if (parts.length !== 5) return { kind: 'not-sequence' };
    const [, enc, id, counter, data] = parts;
    const m = /^(\d+)\/(\d+)$/.exec(counter);
    if (!m || (enc !== 'g' && enc !== 'r')) return { kind: 'not-sequence' };
    const index = parseInt(m[1], 10);
    const total = parseInt(m[2], 10);
    if (index < 1 || index > total) return { kind: 'not-sequence' };

    if (this.id !== id) {
      // New transfer supersedes any partial one.
      this.id = id;
      this.total = total;
      this.enc = enc;
      this.parts.clear();
    }
    this.parts.set(index, data);

    const progress: SequenceProgress = { id, have: this.parts.size, total: this.total };
    if (this.parts.size < this.total) return { kind: 'progress', progress };

    // All frames present — reassemble in order.
    let joined = '';
    for (let i = 1; i <= this.total; i++) joined += this.parts.get(i)!;
    let bytes = b64urlDecode(joined);
    if (this.enc === 'g') {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('Compressed sequence but DecompressionStream unavailable');
      }
      bytes = await pipeThrough(bytes, new DecompressionStream('gzip'));
    }
    const result = new TextDecoder().decode(bytes);
    this.reset();
    return { kind: 'complete', text: result, progress };
  }

  reset(): void {
    this.id = null;
    this.total = 0;
    this.parts.clear();
  }
}
