/**
 * ECDH sealed box — anonymous public-key encryption for mesh messages
 * (Plane E "MeshMessage": docs/plane-e-proximity-mesh.md).
 *
 * ECIES construction over Web Crypto:
 *   sender:   ephemeral P-256 key pair → ECDH(ephemeral_priv, recipient_pub)
 *             → HKDF-SHA-256 → AES-256-GCM encrypt
 *   receiver: ECDH(recipient_priv, ephemeral_pub) → same key → decrypt
 *
 * The ephemeral public key travels with the ciphertext, so nothing in a sealed
 * box identifies the sender — any device can attempt to open it, and only the
 * holder of the recipient private key succeeds ("decrypt-if-yours" routing).
 *
 * Note: the Plane E draft names X25519; P-256 ECDH is used instead because Web
 * Crypto support for X25519 is still uneven across browsers, and P-256 is the
 * curve used throughout crypto-core. The construction is otherwise identical.
 */

const ECDH_PARAMS = { name: 'ECDH', namedCurve: 'P-256' } as const;
const HKDF_INFO = new TextEncoder().encode('witness-mesh-message-v1');

/** Uncompressed P-256 point (0x04 || X || Y). */
export const ECDH_PUBLIC_KEY_BYTES = 65;
const IV_BYTES = 12;

export async function generateEcdhKeyPair(): Promise<CryptoKeyPair> {
  return globalThis.crypto.subtle.generateKey(ECDH_PARAMS, true, ['deriveBits']);
}

/** Export an ECDH public key as raw uncompressed point bytes (65 bytes). */
export async function exportEcdhPublicKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', key));
}

export async function importEcdhPublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    raw.slice().buffer as ArrayBuffer,
    ECDH_PARAMS,
    true,
    [],
  );
}

export async function exportEcdhPrivateKey(key: CryptoKey): Promise<ArrayBuffer> {
  return globalThis.crypto.subtle.exportKey('pkcs8', key);
}

export async function importEcdhPrivateKey(pkcs8: ArrayBuffer): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey('pkcs8', pkcs8, ECDH_PARAMS, true, [
    'deriveBits',
  ]);
}

/** ECDH → HKDF-SHA-256 → AES-256-GCM key. */
async function deriveSealKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<CryptoKey> {
  const shared = await globalThis.crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256,
  );
  const hkdfKey = await globalThis.crypto.subtle.importKey('raw', shared, 'HKDF', false, [
    'deriveKey',
  ]);
  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: HKDF_INFO,
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Seal plaintext to a recipient public key. The output is self-contained:
 * ephemeral_pub(65) || iv(12) || ciphertext+tag. Nothing identifies the sender.
 */
export async function sealToPublicKey(
  recipientPublicKey: CryptoKey,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const ephemeral = await generateEcdhKeyPair();
  const key = await deriveSealKey(ephemeral.privateKey, recipientPublicKey);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      plaintext.slice().buffer as ArrayBuffer,
    ),
  );
  const ephemeralPub = await exportEcdhPublicKey(ephemeral.publicKey);

  const out = new Uint8Array(ECDH_PUBLIC_KEY_BYTES + IV_BYTES + ct.length);
  out.set(ephemeralPub, 0);
  out.set(iv, ECDH_PUBLIC_KEY_BYTES);
  out.set(ct, ECDH_PUBLIC_KEY_BYTES + IV_BYTES);
  return out;
}

/**
 * Attempt to open a sealed box with our private key. Returns the plaintext, or
 * null if the box is not addressed to this key (or is malformed) — the normal
 * case for relayed mesh messages, so no error is thrown.
 */
export async function openSealed(
  recipientPrivateKey: CryptoKey,
  sealed: Uint8Array,
): Promise<Uint8Array | null> {
  if (sealed.length < ECDH_PUBLIC_KEY_BYTES + IV_BYTES + 17) return null; // min: empty pt + GCM tag
  try {
    const ephemeralPub = await importEcdhPublicKey(
      sealed.subarray(0, ECDH_PUBLIC_KEY_BYTES),
    );
    const key = await deriveSealKey(recipientPrivateKey, ephemeralPub);
    const iv = sealed.subarray(ECDH_PUBLIC_KEY_BYTES, ECDH_PUBLIC_KEY_BYTES + IV_BYTES);
    const ct = sealed.subarray(ECDH_PUBLIC_KEY_BYTES + IV_BYTES);
    const pt = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.slice().buffer as ArrayBuffer },
      key,
      ct.slice().buffer as ArrayBuffer,
    );
    return new Uint8Array(pt);
  } catch {
    return null; // not for us, or tampered
  }
}
