/**
 * Web Bluetooth API transport (BLE connection to the LoRa companion board).
 *
 * Browser-only: requires `navigator.bluetooth` and a user gesture to pick the
 * device. Uses the Nordic UART Service (NUS), the de-facto BLE serial profile
 * supported by Meshtastic-class boards. Frames are length-prefixed (transport.ts)
 * and chunked to fit the negotiated MTU; the receiver reassembles via FrameReader.
 */

import {
  FrameDispatcher,
  FrameReader,
  frameForWire,
  type LoRaTransport,
} from './transport.js';

export const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const NUS_RX_WRITE = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // phone → device
export const NUS_TX_NOTIFY = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // device → phone

// Minimal structural view of the Web Bluetooth API (not in the standard DOM lib).
interface BleCharacteristicLike extends EventTarget {
  value?: DataView;
  writeValueWithoutResponse(data: Uint8Array): Promise<void>;
  startNotifications(): Promise<BleCharacteristicLike>;
  stopNotifications(): Promise<BleCharacteristicLike>;
}
interface BleServiceLike {
  getCharacteristic(uuid: string): Promise<BleCharacteristicLike>;
}
interface BleServerLike {
  connect(): Promise<BleServerLike>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BleServiceLike>;
}
interface BleDeviceLike {
  gatt?: BleServerLike;
}
interface BluetoothLike {
  requestDevice(options: {
    filters?: Array<{ services: string[] }>;
    optionalServices?: string[];
  }): Promise<BleDeviceLike>;
}

function getBluetooth(): BluetoothLike {
  const bt = (navigator as unknown as { bluetooth?: BluetoothLike }).bluetooth;
  if (!bt) throw new Error('Web Bluetooth API is not available in this browser');
  return bt;
}

export interface BleTransportOptions {
  /** Max bytes per BLE write; keep at/below the negotiated ATT MTU minus overhead. */
  chunkSize?: number;
}

export class BleTransport implements LoRaTransport {
  readonly kind = 'ble' as const;

  private server: BleServerLike | null = null;
  private rx: BleCharacteristicLike | null = null; // write
  private tx: BleCharacteristicLike | null = null; // notify
  private readonly frames = new FrameReader();
  private readonly dispatcher = new FrameDispatcher();
  private readonly onNotify: (e: Event) => void;
  private readonly chunkSize: number;

  constructor(options: BleTransportOptions = {}) {
    this.chunkSize = options.chunkSize ?? 180;
    this.onNotify = (e: Event) => {
      const ch = e.target as BleCharacteristicLike;
      const dv = ch.value;
      if (!dv) return;
      const chunk = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      for (const f of this.frames.push(chunk)) this.dispatcher.emit(f);
    };
  }

  isConnected(): boolean {
    return this.server !== null;
  }

  async connect(): Promise<void> {
    if (this.server) return;
    const device = await getBluetooth().requestDevice({
      filters: [{ services: [NUS_SERVICE] }],
      optionalServices: [NUS_SERVICE],
    });
    if (!device.gatt) throw new Error('selected BLE device has no GATT server');

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(NUS_SERVICE);
    this.rx = await service.getCharacteristic(NUS_RX_WRITE);
    this.tx = await service.getCharacteristic(NUS_TX_NOTIFY);

    this.frames.reset();
    this.tx.addEventListener('characteristicvaluechanged', this.onNotify);
    await this.tx.startNotifications();
    this.server = server;
  }

  async disconnect(): Promise<void> {
    try {
      this.tx?.removeEventListener('characteristicvaluechanged', this.onNotify);
      await this.tx?.stopNotifications();
    } catch {
      /* already disconnected */
    }
    this.dispatcher.clear();
    this.server?.disconnect();
    this.server = null;
    this.rx = null;
    this.tx = null;
  }

  async send(frame: Uint8Array): Promise<void> {
    if (!this.rx) throw new Error('BLE transport not connected');
    const wire = frameForWire(frame);
    for (let off = 0; off < wire.length; off += this.chunkSize) {
      await this.rx.writeValueWithoutResponse(
        wire.subarray(off, off + this.chunkSize),
      );
    }
  }

  onFrame(handler: (frame: Uint8Array) => void): () => void {
    return this.dispatcher.add(handler);
  }
}
