/**
 * Web Serial API transport (USB-C connection to the LoRa companion board).
 *
 * Browser-only: requires `navigator.serial` (Chromium-based browsers) and a user
 * gesture to pick the port. The companion firmware exposes a serial link that
 * carries length-prefixed LoRa frames (see transport.ts framing).
 */

import {
  FrameDispatcher,
  FrameReader,
  frameForWire,
  type LoRaTransport,
} from './transport.js';

// Minimal structural view of the Web Serial API (not in the standard DOM lib).
interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}
interface SerialLike {
  requestPort(): Promise<SerialPortLike>;
}

function getSerial(): SerialLike {
  const serial = (navigator as unknown as { serial?: SerialLike }).serial;
  if (!serial) throw new Error('Web Serial API is not available in this browser');
  return serial;
}

export interface SerialTransportOptions {
  baudRate?: number;
}

export class SerialTransport implements LoRaTransport {
  readonly kind = 'serial' as const;

  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readonly frames = new FrameReader();
  private readonly dispatcher = new FrameDispatcher();
  private readLoop: Promise<void> | null = null;
  private readonly baudRate: number;

  constructor(options: SerialTransportOptions = {}) {
    this.baudRate = options.baudRate ?? 115200;
  }

  isConnected(): boolean {
    return this.port !== null;
  }

  async connect(): Promise<void> {
    if (this.port) return;
    const port = await getSerial().requestPort();
    await port.open({ baudRate: this.baudRate });
    if (!port.readable || !port.writable) {
      await port.close();
      throw new Error('serial port is not readable/writable');
    }
    this.port = port;
    this.writer = port.writable.getWriter();
    this.reader = port.readable.getReader();
    this.frames.reset();
    this.readLoop = this.pump();
  }

  async disconnect(): Promise<void> {
    const port = this.port;
    this.port = null;
    try {
      await this.reader?.cancel();
    } catch {
      /* already closing */
    }
    this.reader?.releaseLock();
    this.reader = null;
    try {
      await this.writer?.close();
    } catch {
      /* already closing */
    }
    this.writer = null;
    await this.readLoop?.catch(() => {});
    this.readLoop = null;
    this.dispatcher.clear();
    await port?.close().catch(() => {});
  }

  async send(frame: Uint8Array): Promise<void> {
    if (!this.writer) throw new Error('serial transport not connected');
    await this.writer.write(frameForWire(frame));
  }

  onFrame(handler: (frame: Uint8Array) => void): () => void {
    return this.dispatcher.add(handler);
  }

  private async pump(): Promise<void> {
    const reader = this.reader;
    if (!reader) return;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          for (const f of this.frames.push(value)) this.dispatcher.emit(f);
        }
      }
    } catch {
      // stream error/cancellation — treated as disconnect
    }
  }
}
