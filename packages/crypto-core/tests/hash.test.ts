import { describe, it, expect } from 'vitest';
import { hashFile, hashStream, bytesToHex, hexToBytes } from '../src/hash.js';

describe('bytesToHex / hexToBytes', () => {
  it('converts bytes to hex string', () => {
    const bytes = new Uint8Array([0x00, 0xff, 0xab, 0x12]);
    expect(bytesToHex(bytes)).toBe('00ffab12');
  });

  it('converts hex string to bytes', () => {
    const bytes = hexToBytes('00ffab12');
    expect(bytes).toEqual(new Uint8Array([0x00, 0xff, 0xab, 0x12]));
  });

  it('roundtrips hex <-> bytes', () => {
    const original = new Uint8Array([1, 2, 3, 255, 0, 128]);
    expect(hexToBytes(bytesToHex(original))).toEqual(original);
  });

  it('throws on invalid hex string (odd length)', () => {
    expect(() => hexToBytes('abc')).toThrow('Invalid hex string');
  });
});

describe('hashFile', () => {
  it('produces correct SHA-256 for known input', async () => {
    // Compute expected SHA-256 of "abc" using Web Crypto directly to get the
    // reference value for this runtime, then verify hashFile returns the same.
    const encoder = new TextEncoder();
    const data = encoder.encode('abc').buffer as ArrayBuffer;
    const expectedBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const expected = Array.from(new Uint8Array(expectedBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const hash = await hashFile(data);
    expect(hash).toBe(expected);
    // Also verify the output length is correct (64 hex chars = 32 bytes)
    expect(hash).toHaveLength(64);
  });

  it('produces correct SHA-256 for empty input', async () => {
    // SHA-256 of empty string = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const data = new ArrayBuffer(0);
    const hash = await hashFile(data);
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('hashStream', () => {
  it('produces same result as hashFile for same data', async () => {
    const encoder = new TextEncoder();
    const data = encoder.encode('hello world');

    const fileHash = await hashFile(data.buffer as ArrayBuffer);

    async function* makeChunks(): AsyncIterable<Uint8Array> {
      yield data;
    }

    const streamHash = await hashStream(makeChunks());
    expect(streamHash).toBe(fileHash);
  });

  it('produces correct SHA-256 for multi-chunk input', async () => {
    const encoder = new TextEncoder();
    const full = encoder.encode('hello world');
    const chunk1 = encoder.encode('hello ');
    const chunk2 = encoder.encode('world');

    const fileHash = await hashFile(full.buffer as ArrayBuffer);

    async function* makeChunks(): AsyncIterable<Uint8Array> {
      yield chunk1;
      yield chunk2;
    }

    const streamHash = await hashStream(makeChunks());
    expect(streamHash).toBe(fileHash);
  });

  it('handles empty stream', async () => {
    const emptyHash = await hashFile(new ArrayBuffer(0));

    async function* emptyChunks(): AsyncIterable<Uint8Array> {
      // yields nothing
    }

    const streamHash = await hashStream(emptyChunks());
    expect(streamHash).toBe(emptyHash);
  });
});
