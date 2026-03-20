import { createSHA256 } from 'hash-wasm';

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export async function hashFile(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hashBuffer));
}

export async function hashStream(chunks: AsyncIterable<Uint8Array>): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();
  for await (const chunk of chunks) {
    hasher.update(chunk);
  }
  return hasher.digest('hex');
}
