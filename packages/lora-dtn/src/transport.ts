/**
 * Transport abstraction shared by the Web Serial (USB-C) and Web Bluetooth (BLE)
 * companion-device links, plus the length-prefixed framing used over the byte
 * stream.
 *
 * A LoRa frame is variable length, so on a raw serial/notification byte stream we
 * delimit each frame with a 2-byte big-endian length prefix. The companion
 * firmware must use the same framing.
 */

export interface LoRaTransport {
  readonly kind: 'serial' | 'ble';
  isConnected(): boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Send one LoRa frame to the companion device for RF broadcast. */
  send(frame: Uint8Array): Promise<void>;
  /** Subscribe to frames received from the companion device; returns an unsubscribe fn. */
  onFrame(handler: (frame: Uint8Array) => void): () => void;
}

/** Upper bound on a single framed message (LoRa packet max is ~219 bytes). */
export const MAX_FRAME_BYTES = 260;

/** Prefix a frame with its 2-byte big-endian length for stream transmission. */
export function frameForWire(payload: Uint8Array): Uint8Array {
  if (payload.length > MAX_FRAME_BYTES) {
    throw new Error(`frame exceeds ${MAX_FRAME_BYTES} bytes`);
  }
  const out = new Uint8Array(2 + payload.length);
  out[0] = (payload.length >> 8) & 0xff;
  out[1] = payload.length & 0xff;
  out.set(payload, 2);
  return out;
}

/**
 * Incremental de-framer. Feed raw stream chunks via {@link push}; it returns any
 * complete frames decoded so far and retains the partial remainder for the next
 * call. Length-prefix framing tolerates chunk boundaries falling anywhere.
 */
export class FrameReader {
  private buf = new Uint8Array(0);

  push(chunk: Uint8Array): Uint8Array[] {
    if (chunk.length > 0) {
      const merged = new Uint8Array(this.buf.length + chunk.length);
      merged.set(this.buf, 0);
      merged.set(chunk, this.buf.length);
      this.buf = merged;
    }
    const frames: Uint8Array[] = [];
    while (this.buf.length >= 2) {
      const len = (this.buf[0] << 8) | this.buf[1];
      if (this.buf.length < 2 + len) break; // wait for the rest of this frame
      frames.push(this.buf.slice(2, 2 + len));
      this.buf = this.buf.slice(2 + len);
    }
    return frames;
  }

  reset(): void {
    this.buf = new Uint8Array(0);
  }
}

/** Simple subscriber registry shared by both transports. */
export class FrameDispatcher {
  private handlers = new Set<(frame: Uint8Array) => void>();

  add(handler: (frame: Uint8Array) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(frame: Uint8Array): void {
    for (const h of this.handlers) h(frame);
  }

  clear(): void {
    this.handlers.clear();
  }
}
