/**
 * Metadata stripping utilities.
 *
 * Live capture paths are already safe by construction:
 *   - JPEG photos: canvas.toBlob() re-encodes from pixel data — EXIF is never
 *     carried through, so GPS, device model, and serial number are gone.
 *   - Video/audio (WebM via MediaRecorder): WebM/MKV containers do not carry GPS
 *     fields. The DateUTC MKV element may appear; we zero it out below.
 *
 * The import-from-file path (future feature) requires active EXIF stripping
 * because the file comes in with all original metadata intact.
 */

// ── JPEG EXIF stripping (for import-from-file path) ──────────────────────────

const EXIF_MARKER = 0xffe1; // APP1 marker — contains EXIF data
const SOI = 0xffd8;         // Start of JPEG image

/**
 * Strip all EXIF (APP1) segments from a JPEG ArrayBuffer.
 * Segments with other APP markers (ICC, XMP in APP2+) are preserved.
 * Returns the original buffer unchanged if it is not a JPEG.
 */
export function stripJpegExif(buffer: ArrayBuffer): ArrayBuffer {
  const view = new DataView(buffer);

  // Validate JPEG SOI
  if (view.byteLength < 4 || view.getUint16(0) !== SOI) {
    return buffer;
  }

  const segments: { start: number; end: number }[] = [];
  let offset = 2; // skip SOI

  while (offset < view.byteLength - 1) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint16(offset);

    // SOS (start of scan) — everything after is image data, stop walking
    if (marker === 0xffda) {
      segments.push({ start: offset, end: view.byteLength });
      break;
    }

    // Markers without a length field
    if (marker === 0xffd9 || (marker >= 0xffd0 && marker <= 0xffd7)) {
      segments.push({ start: offset, end: offset + 2 });
      offset += 2;
      continue;
    }

    if (offset + 4 > view.byteLength) break;
    const segLen = view.getUint16(offset + 2); // includes the 2-byte length field
    const segEnd = offset + 2 + segLen;

    // Skip APP1 (EXIF) segments; keep everything else
    if (marker !== EXIF_MARKER) {
      segments.push({ start: offset, end: segEnd });
    }

    offset = segEnd;
  }

  // Rebuild: SOI + kept segments
  const soi = new Uint8Array(buffer, 0, 2);
  const parts = [soi, ...segments.map(s => new Uint8Array(buffer, s.start, s.end - s.start))];
  const totalLen = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const part of parts) {
    out.set(part, pos);
    pos += part.byteLength;
  }
  return out.buffer;
}

// ── WebM DateUTC scrubbing ────────────────────────────────────────────────────

/**
 * Find and zero out the DateUTC element in a WebM/MKV buffer.
 * DateUTC is EBML element ID 0x4461 (2 bytes), followed by a length varint,
 * followed by an 8-byte signed integer (nanoseconds since 2001-01-01).
 *
 * This is a best-effort scrub — it zeroes the first DateUTC occurrence.
 * Returns the buffer in-place (mutates a copy).
 */
export function scrubWebmDate(buffer: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer.slice(0)); // copy — do not mutate original
  const DATE_UTC_ID = [0x44, 0x61];

  for (let i = 0; i < bytes.length - 12; i++) {
    if (bytes[i] === DATE_UTC_ID[0] && bytes[i + 1] === DATE_UTC_ID[1]) {
      // Parse VINT length at i+2
      const lenByte = bytes[i + 2];
      if (lenByte === 0x88) {
        // 0x88 = VINT for exactly 8 bytes (common for DateUTC)
        // Zero the 8-byte timestamp
        bytes.fill(0, i + 3, i + 3 + 8);
        break;
      }
    }
  }

  return bytes.buffer;
}

/**
 * Strip metadata appropriate for the given MIME type.
 * Safe to call on all capture outputs; no-ops on unrecognised types.
 */
export function stripMetadata(buffer: ArrayBuffer, mimeType: string): ArrayBuffer {
  if (mimeType === 'image/jpeg') {
    // canvas.toBlob() already strips EXIF in the live-capture path.
    // This is the safety net for the future import-from-file path.
    return stripJpegExif(buffer);
  }
  if (mimeType === 'video/webm' || mimeType === 'audio/webm') {
    return scrubWebmDate(buffer);
  }
  return buffer;
}
