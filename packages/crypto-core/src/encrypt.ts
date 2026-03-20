export async function generateEncryptionKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function exportKey(key: CryptoKey): Promise<ArrayBuffer> {
  return globalThis.crypto.subtle.exportKey('raw', key);
}

export async function importKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(
  key: CryptoKey,
  plaintext: ArrayBuffer
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  const ivRaw = globalThis.crypto.getRandomValues(new Uint8Array(12));
  // Copy into a plain ArrayBuffer-backed Uint8Array for Web Crypto compatibility
  const iv = new Uint8Array(ivRaw);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    plaintext
  );
  return { ciphertext, iv };
}

export async function encryptWithIv(
  key: CryptoKey,
  plaintext: ArrayBuffer,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  const ivCopy = new Uint8Array(iv);
  return globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivCopy, tagLength: 128 },
    key,
    plaintext
  );
}

export async function decrypt(
  key: CryptoKey,
  ciphertext: ArrayBuffer,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  const ivCopy = new Uint8Array(iv);
  return globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivCopy, tagLength: 128 },
    key,
    ciphertext
  );
}
