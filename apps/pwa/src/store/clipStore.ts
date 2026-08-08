/**
 * Plane D.2 clip loading for the PWA — bridges the UI to
 * @witness/knowledge-library's ClipStore, supplying the device vault's
 * seal/unseal as the package's injected key callbacks. Every clip is
 * encrypted under its own key the moment it's saved; reading one while the
 * vault is passphrase-locked returns null (never throws), matching the same
 * unlock-prompt UX the evidence screen already uses.
 */

import { ClipStore, type ClipListing, type ClippedArticle, type NewClip } from '@witness/knowledge-library';
import { sealToVault, unsealFromVault } from './deviceKey';
import { stripTrackingParams } from '../utils/urlClean';

export async function listClips(): Promise<ClipListing[]> {
  const store = await ClipStore.open();
  try {
    return await store.listClips();
  } finally {
    store.close();
  }
}

/** Read one clip. Returns null if unknown OR if the vault is locked — check getVaultStatus() to tell those apart in the UI. */
export async function readClip(clipId: string): Promise<ClippedArticle | null> {
  const store = await ClipStore.open();
  try {
    return await store.readClip(clipId, unsealFromVault);
  } finally {
    store.close();
  }
}

export interface SaveClipInput {
  title: string;
  content: string;
  tags: string[];
  /** Raw URL as typed/pasted; tracking params are stripped before anything is stored. */
  sourceUrl?: string;
  /** Explicit opt-in — by default the source URL is discarded entirely. */
  includeSourceUrl: boolean;
}

export async function saveClip(input: SaveClipInput): Promise<string> {
  const clip: NewClip = {
    title: input.title.trim() || 'Untitled clip',
    plaintext_content: input.content,
    tags: input.tags.map((t) => t.trim()).filter(Boolean),
    source_url:
      input.includeSourceUrl && input.sourceUrl
        ? stripTrackingParams(input.sourceUrl.trim())
        : undefined,
  };
  const store = await ClipStore.open();
  try {
    return await store.saveClip(clip, sealToVault);
  } finally {
    store.close();
  }
}

export async function deleteClip(clipId: string): Promise<void> {
  const store = await ClipStore.open();
  try {
    await store.deleteClip(clipId);
  } finally {
    store.close();
  }
}

/**
 * Best-effort fetch-and-extract for a pasted URL. Many sites block
 * cross-origin fetches (no CORS headers) — this is a convenience for sites
 * that allow it, not a guarantee. Callers should always offer manual
 * paste-text as the primary path, which works everywhere and offline.
 */
export async function tryFetchUrlText(url: string): Promise<{ title: string; text: string } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
    const title = doc.querySelector('title')?.textContent?.trim() || url;
    const text = (doc.body?.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
    return text ? { title, text } : null;
  } catch {
    return null; // CORS block, network error, offline — caller falls back to manual paste
  }
}
