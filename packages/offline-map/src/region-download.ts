/**
 * Regional PMTiles pack downloader (architecture.md §13.4 "Initial tile
 * acquisition").
 *
 * Streams an NGO-hosted `.pmtiles` extract (produced with
 * `pmtiles extract --bbox … --maxzoom …`, or a Protomaps daily build) into
 * OPFS so the map renders fully offline afterwards. Packs are 50–500 MB, so
 * the download:
 *   - streams straight to disk (never buffers the file in memory),
 *   - reports progress,
 *   - resumes interrupted transfers via HTTP Range requests
 *     (partial data is kept in a `.part` file),
 *   - validates the PMTiles v3 magic on the first bytes,
 *   - refuses downloads that would exhaust the storage quota.
 *
 * One region at a time: installing a pack replaces any previous one
 * (same policy as writeOPFSTileFile).
 */

import { OPFS_MAP_DIR } from './pmtiles.js';

export interface RegionDownloadProgress {
  /** Bytes on disk so far (including any resumed prefix). */
  received: number;
  /** Total bytes if the server reported a length, else null. */
  total: number | null;
}

export interface RegionInfo {
  regionName: string;
  fileName: string;
  sizeBytes: number;
}

export class RegionDownloadError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'HTTP'
      | 'NOT_PMTILES'
      | 'QUOTA'
      | 'ABORTED'
      | 'OPFS_UNAVAILABLE',
  ) {
    super(message);
    this.name = 'RegionDownloadError';
  }
}

/** PMTiles v3 magic: ASCII "PMTiles" followed by version byte 3. */
export function isPmtilesHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  const magic = 'PMTiles';
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic.charCodeAt(i)) return false;
  }
  return bytes[7] === 3;
}

/** Derive a safe region name from a pack URL (basename, no extension). */
export function regionNameFromUrl(url: string): string {
  let base: string;
  try {
    base = new URL(url).pathname.split('/').filter(Boolean).pop() ?? 'region';
  } catch {
    base = 'region';
  }
  base = base.replace(/\.pmtiles$/i, '');
  const clean = base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return clean || 'region';
}

interface WriterLike {
  write(chunk: Uint8Array): Promise<unknown> | unknown;
  close(): Promise<unknown> | unknown;
}

export interface PumpOptions {
  /** Bytes already on disk (resume offset). Magic is only checked when 0. */
  startOffset: number;
  /** Total bytes if known (Content-Length / Content-Range). */
  total: number | null;
  onProgress?: (p: RegionDownloadProgress) => void;
  signal?: AbortSignal;
}

/**
 * Stream `body` into `writer`, validating the PMTiles magic on the first bytes
 * of a fresh (offset-0) download and reporting progress. Returns bytes written
 * in this pass. Separated from the OPFS/fetch glue so it is unit-testable.
 */
export async function pumpToWriter(
  body: ReadableStream<Uint8Array>,
  writer: WriterLike,
  opts: PumpOptions,
): Promise<number> {
  const reader = body.getReader();
  let written = 0;
  let magicChecked = opts.startOffset > 0;
  let magicBuf = new Uint8Array(0);

  try {
    for (;;) {
      if (opts.signal?.aborted) {
        throw new RegionDownloadError('download cancelled', 'ABORTED');
      }
      const { value, done } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;

      if (!magicChecked) {
        const merged = new Uint8Array(magicBuf.length + value.length);
        merged.set(magicBuf, 0);
        merged.set(value, magicBuf.length);
        magicBuf = merged;
        if (magicBuf.length >= 8) {
          if (!isPmtilesHeader(magicBuf)) {
            throw new RegionDownloadError('not a PMTiles v3 file', 'NOT_PMTILES');
          }
          magicChecked = true;
        }
      }

      await writer.write(value);
      written += value.length;
      opts.onProgress?.({
        received: opts.startOffset + written,
        total: opts.total,
      });
    }
    // A tiny complete stream that never reached 8 bytes is not a pack.
    if (!magicChecked) {
      throw new RegionDownloadError('not a PMTiles v3 file', 'NOT_PMTILES');
    }
    return written;
  } finally {
    reader.releaseLock();
  }
}

type WritableFileHandle = FileSystemFileHandle & {
  createWritable(options?: {
    keepExistingData?: boolean;
  }): Promise<FileSystemWritableFileStream>;
  move?: (dir: FileSystemDirectoryHandle, name: string) => Promise<void>;
};

async function getMapDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(OPFS_MAP_DIR, { create });
  } catch {
    return null;
  }
}

/** The installed region pack, if any. */
export async function getInstalledRegion(): Promise<RegionInfo | null> {
  const dir = await getMapDir(false);
  if (!dir) return null;
  for await (const [name] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (name.endsWith('.pmtiles')) {
      const file = await (await dir.getFileHandle(name)).getFile();
      return {
        regionName: name.replace(/\.pmtiles$/, ''),
        fileName: name,
        sizeBytes: file.size,
      };
    }
  }
  return null;
}

/** Remove the installed pack and any partial downloads. */
export async function deleteRegionPack(): Promise<void> {
  const dir = await getMapDir(false);
  if (!dir) return;
  const names: string[] = [];
  for await (const [name] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (name.endsWith('.pmtiles') || name.endsWith('.part')) names.push(name);
  }
  for (const name of names) {
    await dir.removeEntry(name).catch(() => {});
  }
}

async function partSize(dir: FileSystemDirectoryHandle, partName: string): Promise<number> {
  try {
    const file = await (await dir.getFileHandle(partName)).getFile();
    return file.size;
  } catch {
    return 0;
  }
}

/**
 * Download a `.pmtiles` region pack into OPFS, resuming a previous partial
 * transfer of the same region when the server supports Range requests.
 * On success the pack is installed (replacing any previous region) and the
 * map renders offline from it on next load.
 */
export async function downloadRegionPack(
  url: string,
  opts: {
    onProgress?: (p: RegionDownloadProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<RegionInfo> {
  const dir = await getMapDir(true);
  if (!dir) throw new RegionDownloadError('OPFS unavailable', 'OPFS_UNAVAILABLE');

  const regionName = regionNameFromUrl(url);
  const partName = `${regionName}.part`;
  const finalName = `${regionName}.pmtiles`;

  // Resume point from a previous attempt at the same region.
  let offset = await partSize(dir, partName);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: offset > 0 ? { Range: `bytes=${offset}-` } : {},
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new RegionDownloadError('download cancelled', 'ABORTED');
    }
    throw new RegionDownloadError(`fetch failed: ${(err as Error).message}`, 'HTTP');
  }

  if (res.status === 200) {
    offset = 0; // server ignored the Range — start over
  } else if (res.status === 206) {
    // resuming — keep offset
  } else {
    throw new RegionDownloadError(`server responded ${res.status}`, 'HTTP');
  }
  if (!res.body) throw new RegionDownloadError('empty response body', 'HTTP');

  // Total size: Content-Range total on 206, else Content-Length.
  let total: number | null = null;
  const contentRange = res.headers.get('content-range');
  const rangeTotal = contentRange ? Number(contentRange.split('/').pop()) : NaN;
  if (Number.isFinite(rangeTotal) && rangeTotal > 0) {
    total = rangeTotal;
  } else {
    const len = Number(res.headers.get('content-length'));
    if (Number.isFinite(len) && len > 0) total = offset + len;
  }

  // Refuse downloads that would blow the storage quota.
  if (total !== null && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      const free = (est.quota ?? 0) - (est.usage ?? 0);
      if (free > 0 && total - offset > free * 0.95) {
        throw new RegionDownloadError(
          `pack needs ${Math.round((total - offset) / 1e6)} MB but only ${Math.round(free / 1e6)} MB free`,
          'QUOTA',
        );
      }
    } catch (err) {
      if (err instanceof RegionDownloadError) throw err;
      /* estimate unavailable — proceed */
    }
  }

  const handle = (await dir.getFileHandle(partName, { create: true })) as WritableFileHandle;
  const writable = await handle.createWritable({ keepExistingData: offset > 0 });
  if (offset > 0) await writable.seek(offset);

  try {
    // Safe cast: fetch bodies are always ArrayBuffer-backed Uint8Arrays, which
    // FileSystemWritableFileStream.write accepts (TS's BufferSource is narrower).
    await pumpToWriter(res.body, writable as unknown as WriterLike, {
      startOffset: offset,
      total,
      onProgress: opts.onProgress,
      signal: opts.signal,
    });
    await writable.close();
  } catch (err) {
    // Keep the .part file for resume on ABORTED/network errors; discard the
    // stream position by closing (bytes written so far are preserved).
    await writable.close().catch(() => {});
    if (err instanceof RegionDownloadError && err.code === 'NOT_PMTILES') {
      await dir.removeEntry(partName).catch(() => {});
    }
    if ((err as Error).name === 'AbortError') {
      throw new RegionDownloadError('download cancelled', 'ABORTED');
    }
    throw err;
  }

  // Install: remove any previous pack, then promote the .part file.
  for await (const [name] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (name.endsWith('.pmtiles')) await dir.removeEntry(name).catch(() => {});
  }
  if (typeof handle.move === 'function') {
    await handle.move(dir, finalName);
  } else {
    // Fallback for engines without FileSystemFileHandle.move: stream-copy.
    const src = await handle.getFile();
    const dstHandle = (await dir.getFileHandle(finalName, { create: true })) as WritableFileHandle;
    const dst = await dstHandle.createWritable();
    await src.stream().pipeTo(dst as unknown as WritableStream<Uint8Array>);
    await dir.removeEntry(partName).catch(() => {});
  }

  const installed = await (await dir.getFileHandle(finalName)).getFile();
  return { regionName, fileName: finalName, sizeBytes: installed.size };
}
