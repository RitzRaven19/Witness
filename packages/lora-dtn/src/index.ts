/**
 * @witness/lora-dtn — LoRa Delay-Tolerant Network mesh (architecture.md §6.2).
 *
 * A store-and-forward escape network: a witness device with no connectivity hands
 * a compact HashReceipt to a companion LoRa board, which epidemically relays it
 * device-to-device until a node with connectivity forwards it to the ingestion
 * endpoint. Only the tamper-proof HashReceipt travels over LoRa — never the
 * encrypted media blob.
 *
 * Public surface:
 *  - Packet codec + HashReceipt payload encoding (packet.ts)
 *  - DTNQueue: persistent queue, dedup, and the epidemic routing decision
 *  - LoRaTransport implementations: SerialTransport (USB-C), BleTransport (BLE)
 *  - enqueueHashReceipt: encode a receipt, queue it, and broadcast if connected
 */

import {
  PayloadType,
  encodeHashReceiptPayload,
  encodePacket,
  generatePacketId,
  PROTOCOL_VERSION,
  type HashReceipt,
} from './packet.js';
import { DTNQueue } from './dtn-queue.js';
import type { LoRaTransport } from './transport.js';

export {
  PROTOCOL_VERSION,
  MAX_HOPS,
  PACKET_ID_BYTES,
  HEADER_BYTES,
  HMAC_BYTES,
  MAX_PAYLOAD_BYTES,
  HASH_RECEIPT_PAYLOAD_BYTES,
  PayloadType,
  PacketError,
  generatePacketId,
  encodePacket,
  decodePacket,
  verifyPacket,
  relayPacket,
  packetIdHex,
  encodeHashReceiptPayload,
  decodeHashReceiptPayload,
  type LoRaPacketFields,
  type DecodedPacket,
  type HashReceipt,
  type DecodedHashReceipt,
} from './packet.js';

export {
  DTNQueue,
  DTN_DB_NAME,
  DTN_DB_VERSION,
  MAX_BUFFER,
  SEEN_WINDOW,
  REBROADCAST_JITTER_MS,
  rebroadcastDelayMs,
  type PacketSource,
  type DiscardReason,
  type IncomingResult,
} from './dtn-queue.js';

export {
  type LoRaTransport,
  MAX_FRAME_BYTES,
  frameForWire,
  FrameReader,
  FrameDispatcher,
} from './transport.js';
export {
  MeshtasticTransport,
  PRIVATE_APP_PORTNUM,
  type MeshtasticLink,
  type MeshtasticTransportOptions,
} from './meshtastic-transport.js';
export { SerialTransport, type SerialTransportOptions } from './serial-transport.js';
export {
  BleTransport,
  type BleTransportOptions,
  NUS_SERVICE,
  NUS_RX_WRITE,
  NUS_TX_NOTIFY,
} from './ble-transport.js';

/**
 * Encode a HashReceipt into a fresh LoRa packet (hop 0), persist it to the DTN
 * queue, and broadcast it immediately if a companion device is connected. If no
 * transport is connected the frame stays queued and is sent on the next connect.
 *
 * Returns the packet id (hex) for later delivery tracking.
 */
export async function enqueueHashReceipt(
  receipt: HashReceipt,
  meshKey: Uint8Array,
  queue: DTNQueue,
  transport?: LoRaTransport,
): Promise<string> {
  const payload = encodeHashReceiptPayload(receipt);
  const frame = await encodePacket(
    {
      version: PROTOCOL_VERSION,
      packetId: generatePacketId(),
      hopCount: 0,
      payloadType: PayloadType.HashReceipt,
      payload,
    },
    meshKey,
  );

  const id = await queue.enqueueLocal(frame);
  if (transport?.isConnected()) {
    await transport.send(frame);
  }
  return id;
}
