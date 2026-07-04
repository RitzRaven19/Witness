/**
 * Meshtastic companion transport — carries Witness DTN frames over stock,
 * unmodified Meshtastic boards (Heltec, T-Beam, RAK, …) using the official
 * @meshtastic/core protocol stack and its Web Bluetooth / Web Serial links.
 *
 * Our LoRaDTNPacket frames ride as opaque bytes on the Meshtastic PRIVATE_APP
 * port (256), broadcast to the mesh. The Witness layers on top are unchanged:
 * HMAC packet integrity, epidemic dedup/relay, sealed-box messages. Meshtastic
 * provides the radio, channel encryption, and its own multi-hop flooding —
 * which means even non-Witness Meshtastic nodes forward our frames.
 *
 * Frame size: Meshtastic's usable payload is ~233 bytes; our largest frame is
 * 219 bytes (11 header + 200 payload + 8 MAC), so every frame fits unfragmented.
 *
 * Implementation note: internals use ES #private fields deliberately so that
 * no @meshtastic/* types appear in this package's public .d.ts (the upstream
 * type declarations reference a package whose published types are broken).
 */

import { MeshDevice } from '@meshtastic/core';
import { TransportWebBluetooth } from '@meshtastic/transport-web-bluetooth';
import { TransportWebSerial } from '@meshtastic/transport-web-serial';
import { FrameDispatcher, type LoRaTransport } from './transport.js';

/** Meshtastic portnum reserved for third-party apps (meshtastic.PortNum.PRIVATE_APP). */
export const PRIVATE_APP_PORTNUM = 256;

export type MeshtasticLink = 'ble' | 'serial';

export interface MeshtasticTransportOptions {
  /** Serial baud rate (USB-C link only). Meshtastic default firmware uses 115200. */
  baudRate?: number;
}

export class MeshtasticTransport implements LoRaTransport {
  readonly kind: 'serial' | 'ble';

  #device: MeshDevice | null = null;
  #unsubscribe: (() => void) | null = null;
  readonly #dispatcher = new FrameDispatcher();
  readonly #baudRate: number;

  constructor(link: MeshtasticLink, options: MeshtasticTransportOptions = {}) {
    this.kind = link;
    this.#baudRate = options.baudRate ?? 115200;
  }

  isConnected(): boolean {
    return this.#device !== null;
  }

  async connect(): Promise<void> {
    if (this.#device) return;

    const transport =
      this.kind === 'ble'
        ? await TransportWebBluetooth.create()
        : await TransportWebSerial.create(this.#baudRate);

    const device = new MeshDevice(transport);

    // PRIVATE_APP payloads from the mesh are Witness DTN frames.
    const handler = (packet: { data: Uint8Array }) => {
      this.#dispatcher.emit(packet.data);
    };
    device.events.onPrivatePacket.subscribe(handler);
    this.#unsubscribe = () => device.events.onPrivatePacket.unsubscribe(handler);

    // Kick off the config handshake — the radio starts streaming packets to us
    // once configuration completes. Errors here are connection failures.
    await device.configure();

    this.#device = device;
  }

  async disconnect(): Promise<void> {
    const device = this.#device;
    this.#device = null;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#dispatcher.clear();
    await device?.disconnect().catch(() => {});
  }

  /** Broadcast one Witness DTN frame to the mesh on the PRIVATE_APP port. */
  async send(frame: Uint8Array): Promise<void> {
    const device = this.#device;
    if (!device) throw new Error('Meshtastic transport not connected');
    await device.sendPacket(
      frame,
      PRIVATE_APP_PORTNUM as Parameters<MeshDevice['sendPacket']>[1],
      'broadcast',
    );
  }

  onFrame(handler: (frame: Uint8Array) => void): () => void {
    return this.#dispatcher.add(handler);
  }
}
