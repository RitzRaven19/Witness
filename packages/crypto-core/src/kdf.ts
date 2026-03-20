import { argon2id } from 'hash-wasm';
import { importKey } from './encrypt.js';

export const KDF_PARAMS = {
  memory: 19456,
  iterations: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export function generateSalt(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(16));
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  params?: Partial<typeof KDF_PARAMS>
): Promise<Uint8Array> {
  const p = { ...KDF_PARAMS, ...params };
  const result = await argon2id({
    password: passphrase,
    salt,
    iterations: p.iterations,
    parallelism: p.parallelism,
    memorySize: p.memory,
    hashLength: p.hashLength,
    outputType: 'binary',
  });
  return result;
}

export async function deriveAndWrapKey(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const keyBytes = await deriveKey(passphrase, salt);
  return importKey(keyBytes.buffer as ArrayBuffer);
}
