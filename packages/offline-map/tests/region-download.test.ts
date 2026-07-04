import { describe, it, expect } from 'vitest';
import {
  isPmtilesHeader,
  regionNameFromUrl,
  pumpToWriter,
  RegionDownloadError,
  type RegionDownloadProgress,
} from '../src/region-download.js';

const PM_MAGIC = new Uint8Array([0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73, 3]); // "PMTiles" + v3

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
  });
}

class MemWriter {
  bytes: number[] = [];
  closed = false;
  write(chunk: Uint8Array) {
    this.bytes.push(...chunk);
  }
  close() {
    this.closed = true;
  }
}

describe('isPmtilesHeader', () => {
  it('accepts the PMTiles v3 magic', () => {
    expect(isPmtilesHeader(PM_MAGIC)).toBe(true);
  });

  it('rejects wrong magic, wrong version, and short input', () => {
    expect(isPmtilesHeader(new TextEncoder().encode('NOTPMT!\x03'))).toBe(false);
    const v2 = PM_MAGIC.slice();
    v2[7] = 2;
    expect(isPmtilesHeader(v2)).toBe(false);
    expect(isPmtilesHeader(PM_MAGIC.slice(0, 5))).toBe(false);
  });
});

describe('regionNameFromUrl', () => {
  it('derives the basename without extension', () => {
    expect(regionNameFromUrl('https://ngo.example/packs/kyiv-region.pmtiles')).toBe('kyiv-region');
  });

  it('ignores query strings and sanitises odd characters', () => {
    expect(regionNameFromUrl('https://x.org/a%20b/North Sector!.pmtiles?sig=abc')).toBe(
      regionNameFromUrl('https://x.org/a%20b/North Sector!.pmtiles?sig=abc'),
    );
    expect(regionNameFromUrl('https://x.org/tiles/..pmtiles')).not.toBe('');
    expect(/^[a-zA-Z0-9._-]+$/.test(regionNameFromUrl('https://x.org/We ird/α-Ω.pmtiles'))).toBe(true);
  });

  it('falls back to "region" for unusable urls', () => {
    expect(regionNameFromUrl('not a url')).toBe('region');
  });
});

describe('pumpToWriter', () => {
  it('streams a valid pack, reporting progress', async () => {
    const body = new Uint8Array(100).fill(7);
    body.set(PM_MAGIC, 0);
    const w = new MemWriter();
    const events: RegionDownloadProgress[] = [];

    const written = await pumpToWriter(
      streamOf([body.slice(0, 40), body.slice(40)]),
      w,
      { startOffset: 0, total: 100, onProgress: (p) => events.push(p) },
    );

    expect(written).toBe(100);
    expect(w.bytes.length).toBe(100);
    expect(events.at(-1)).toEqual({ received: 100, total: 100 });
  });

  it('validates magic even when split across tiny chunks', async () => {
    const body = new Uint8Array(50).fill(1);
    body.set(PM_MAGIC, 0);
    const chunks = Array.from(body, (b) => new Uint8Array([b])); // 1-byte chunks
    const w = new MemWriter();
    await expect(
      pumpToWriter(streamOf(chunks), w, { startOffset: 0, total: null }),
    ).resolves.toBe(50);
  });

  it('rejects a non-PMTiles stream and reports NOT_PMTILES', async () => {
    const w = new MemWriter();
    await expect(
      pumpToWriter(streamOf([new TextEncoder().encode('<!doctype html>...')]), w, {
        startOffset: 0,
        total: null,
      }),
    ).rejects.toMatchObject({ name: 'RegionDownloadError', code: 'NOT_PMTILES' });
  });

  it('rejects a stream too short to be a pack', async () => {
    const w = new MemWriter();
    await expect(
      pumpToWriter(streamOf([PM_MAGIC.slice(0, 4)]), w, { startOffset: 0, total: null }),
    ).rejects.toBeInstanceOf(RegionDownloadError);
  });

  it('skips magic validation when resuming (startOffset > 0)', async () => {
    const w = new MemWriter();
    const written = await pumpToWriter(
      streamOf([new Uint8Array([9, 9, 9])]),
      w,
      { startOffset: 5000, total: 5003 },
    );
    expect(written).toBe(3);
  });

  it('progress counts include the resume offset', async () => {
    const w = new MemWriter();
    const events: RegionDownloadProgress[] = [];
    await pumpToWriter(streamOf([new Uint8Array(10)]), w, {
      startOffset: 90,
      total: 100,
      onProgress: (p) => events.push(p),
    });
    expect(events.at(-1)).toEqual({ received: 100, total: 100 });
  });

  it('honours an abort signal', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const w = new MemWriter();
    await expect(
      pumpToWriter(streamOf([PM_MAGIC]), w, {
        startOffset: 0,
        total: null,
        signal: ctrl.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });
});
