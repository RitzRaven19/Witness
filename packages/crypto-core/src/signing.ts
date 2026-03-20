const ECDSA_PARAMS = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN_PARAMS = { name: 'ECDSA', hash: 'SHA-256' } as const;

export async function generateSigningKeyPair(): Promise<CryptoKeyPair> {
  return globalThis.crypto.subtle.generateKey(ECDSA_PARAMS, true, ['sign', 'verify']);
}

export async function exportPrivateKey(key: CryptoKey): Promise<ArrayBuffer> {
  return globalThis.crypto.subtle.exportKey('pkcs8', key);
}

export async function exportPublicKey(key: CryptoKey): Promise<ArrayBuffer> {
  return globalThis.crypto.subtle.exportKey('spki', key);
}

export async function importPrivateKey(pkcs8: ArrayBuffer): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey('pkcs8', pkcs8, ECDSA_PARAMS, true, ['sign']);
}

export async function importPublicKey(spki: ArrayBuffer): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey('spki', spki, ECDSA_PARAMS, true, ['verify']);
}

export async function sign(privateKey: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  return globalThis.crypto.subtle.sign(SIGN_PARAMS, privateKey, data);
}

export async function verify(
  publicKey: CryptoKey,
  signature: ArrayBuffer,
  data: ArrayBuffer
): Promise<boolean> {
  return globalThis.crypto.subtle.verify(SIGN_PARAMS, publicKey, signature, data);
}
