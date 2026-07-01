/**
 * PMTiles OPFS loader + MapLibre protocol handler.
 *
 * Registers a `pmtiles://` custom protocol with MapLibre GL JS that resolves
 * tile byte ranges from a PMTiles file stored in the Origin Private File System
 * (OPFS) under `map-tiles/<region>.pmtiles`.
 *
 * No tile server required — all rendering is fully local.
 */

import { Protocol } from 'pmtiles';
import type maplibregl from 'maplibre-gl';

export const OPFS_MAP_DIR = 'map-tiles';

export interface OPFSTileFile {
  regionName: string;
  fileName: string;
  blobUrl: string;
}

/**
 * Register the `pmtiles://` protocol handler with MapLibre.
 * Must be called before creating any Map instance.
 * Returns a cleanup function that removes the protocol registration.
 */
export function registerPMTilesProtocol(
  maplibre: typeof maplibregl,
): () => void {
  const protocol = new Protocol();
  maplibre.addProtocol('pmtiles', protocol.tile.bind(protocol));
  return () => maplibre.removeProtocol('pmtiles');
}

/**
 * Scan OPFS for a cached PMTiles file and return its blob URL + metadata.
 * Returns null if no cached tile file exists.
 *
 * Caller is responsible for revoking the blob URL when done:
 *   URL.revokeObjectURL(result.blobUrl)
 */
export async function getOPFSTileFile(): Promise<OPFSTileFile | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(OPFS_MAP_DIR);
    for await (const [name] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (!name.endsWith('.pmtiles')) continue;
      const fh = await dir.getFileHandle(name);
      const file = await fh.getFile();
      return {
        regionName: name.replace('.pmtiles', ''),
        fileName: name,
        blobUrl: URL.createObjectURL(file),
      };
    }
  } catch {
    // OPFS unavailable or directory does not exist yet
  }
  return null;
}

/**
 * Write a PMTiles file into OPFS, replacing any previous file in the directory.
 * Used when downloading a regional tile pack from the network or receiving
 * it via Wi-Fi Direct / BLE.
 */
export async function writeOPFSTileFile(
  regionName: string,
  data: ArrayBuffer,
): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(OPFS_MAP_DIR, { create: true });

  // Remove any existing tile files first (one region at a time)
  for await (const [name] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (name.endsWith('.pmtiles')) {
      await dir.removeEntry(name);
    }
  }

  const fh = await dir.getFileHandle(`${regionName}.pmtiles`, { create: true });
  const writable = await (fh as FileSystemFileHandle & {
    createWritable(): Promise<FileSystemWritableFileStream>;
  }).createWritable();
  await writable.write(data);
  await writable.close();
}

/**
 * Delete the OPFS tile directory and its contents.
 * Called during panic purge.
 */
export async function purgeOPFSTiles(): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(OPFS_MAP_DIR, { recursive: true });
  } catch {
    // Already absent — no-op
  }
}

/**
 * Build a MapLibre StyleSpecification that reads tiles from a local PMTiles blob URL.
 */
export function buildOfflineMapStyle(
  blobUrl: string,
): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      offline: {
        type: 'vector',
        url: `pmtiles://${blobUrl}`,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#0d0d0d' },
      },
      {
        id: 'landcover',
        type: 'fill',
        source: 'offline',
        'source-layer': 'landcover',
        paint: { 'fill-color': '#141414' },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'offline',
        'source-layer': 'water',
        paint: { 'fill-color': '#1a2a3a' },
      },
      {
        id: 'roads',
        type: 'line',
        source: 'offline',
        'source-layer': 'transportation',
        paint: { 'line-color': '#2a2a2a', 'line-width': 1.5 },
      },
      {
        id: 'buildings',
        type: 'fill',
        source: 'offline',
        'source-layer': 'building',
        paint: { 'fill-color': '#1a1a1a', 'fill-outline-color': '#222' },
      },
    ],
  } as unknown as maplibregl.StyleSpecification;
}
