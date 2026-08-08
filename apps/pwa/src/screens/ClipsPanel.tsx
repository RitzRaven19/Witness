import { useEffect, useState } from 'react';
import type { ClipListing, ClippedArticle } from '@witness/knowledge-library';
import { listClips, readClip, saveClip, deleteClip, tryFetchUrlText } from '../store/clipStore';
import { getVaultStatus, unlockVault, type VaultStatus } from '../store/deviceKey';

/**
 * Plane D.2 — private, unsigned, user-clipped articles. Consolidated into
 * the same screen as D.1's NGO-signed protocols per the spec ("consolidates
 * two functions that currently require separate apps"), but entirely
 * separate storage and a distinct trust story: nothing here is signed,
 * nothing here is ever transmitted, and panic purge deletes it all
 * unconditionally (no hide/escrow — see clip-store.ts).
 */
export function ClipsPanel() {
  const [listings, setListings] = useState<ClipListing[] | null>(null);
  const [vault, setVault] = useState<VaultStatus | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [reading, setReading] = useState<ClippedArticle | null>(null);
  const [askPassFor, setAskPassFor] = useState<string | null>(null);
  const [pass, setPass] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function refresh() {
    listClips().then(setListings).catch(() => setListings([]));
    getVaultStatus().then(setVault).catch(() => {});
  }
  useEffect(refresh, []);

  function flash(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function openClip(id: string) {
    const clip = await readClip(id);
    if (clip) {
      setReading(clip);
      return;
    }
    // null means either unknown id or a locked vault — status tells us which.
    const status = await getVaultStatus();
    if (status === 'locked') setAskPassFor(id);
    else flash(false, 'Could not open clip');
  }

  async function unlockAndOpen() {
    const id = askPassFor;
    if (!id) return;
    const ok = await unlockVault(pass);
    setPass('');
    if (!ok) {
      flash(false, 'Wrong passphrase');
      return;
    }
    setAskPassFor(null);
    refresh();
    await openClip(id);
  }

  async function doDelete(id: string) {
    setConfirmDelete(null);
    await deleteClip(id).catch(() => {});
    flash(true, 'Clip deleted');
    refresh();
  }

  if (reading) {
    return <ClipReader clip={reading} onBack={() => setReading(null)} />;
  }

  return (
    <>
      <div className="flex items-center justify-between px-4 pt-1 pb-2">
        <p className="text-[10px] text-gray-500 tracking-widest">
          {listings === null ? 'READING…' : `${listings.length} CLIP${listings.length === 1 ? '' : 'S'} // ENCRYPTED // NEVER TRANSMITTED`}
        </p>
        <button
          onClick={() => setShowNew(true)}
          className="text-[9px] font-bold tracking-widest px-2 py-1 border border-[#00ff33]/50 text-[#00ff33] hover:bg-[#00ff33]/10"
        >
          + NEW CLIP
        </button>
      </div>

      {msg && (
        <div className={`mx-4 mb-2 px-3 py-2 border text-[10px] font-bold tracking-widest ${
          msg.ok ? 'bg-[#0d1f10] border-[#00ff33]/60 text-[#00ff33]' : 'bg-[#1a0505] border-[#cc4444] text-[#cc6666]'
        }`}>
          {msg.text}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-1 flex flex-col gap-2">
        {listings === null ? (
          <p className="text-gray-600 text-[11px] tracking-widest text-center py-8">READING…</p>
        ) : listings.length === 0 ? (
          <p className="text-gray-600 text-[11px] tracking-widest text-center py-8 leading-relaxed">
            NO CLIPS YET.<br/>Save an article or your own notes for offline reading — private to this device.
          </p>
        ) : (
          listings.map((c) => (
            <div key={c.clip_id} className="bg-[#111] border border-[#1e1e1e] p-3">
              <button
                onClick={() => void openClip(c.clip_id)}
                className="w-full text-left flex items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="text-white font-bold tracking-widest text-[12px]">
                    {new Date(c.clipped_at).toLocaleString('en-GB', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    }).toUpperCase()}
                  </div>
                  {c.tags.length > 0 && (
                    <div className="text-[9px] text-gray-500 tracking-wider mt-0.5 truncate">
                      {c.tags.join(' · ').toUpperCase()}
                    </div>
                  )}
                </div>
                <svg className="w-3.5 h-3.5 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
              {confirmDelete === c.clip_id ? (
                <div className="flex gap-2 mt-2.5">
                  <button
                    onClick={() => void doDelete(c.clip_id)}
                    className="text-[9px] font-bold tracking-widest px-2.5 py-1.5 bg-[#cc0000] text-white hover:bg-[#dd0000]"
                  >
                    CONFIRM DELETE
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-[9px] font-bold tracking-widest px-2.5 py-1.5 border border-[#333] text-gray-400"
                  >
                    KEEP
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(c.clip_id)}
                  className="mt-2.5 text-[9px] font-bold tracking-widest px-2.5 py-1.5 border border-[#333] text-gray-500 hover:border-[#cc4444] hover:text-[#cc4444]"
                >
                  DELETE
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {vault && listings && listings.length > 0 && (
        <div className="mx-4 mb-4 shrink-0 border-t border-[#1a1a1a] pt-3">
          <span className="text-[9px] text-gray-600 tracking-widest">
            VAULT: {vault === 'unprotected' ? 'DEVICE-BOUND (SET PASSPHRASE IN SETTINGS)' : vault.toUpperCase()}
          </span>
        </div>
      )}

      {showNew && (
        <NewClipModal
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); refresh(); flash(true, 'Clip saved'); }}
        />
      )}

      {askPassFor && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
          <div className="bg-[#111] border border-[#333] p-5 w-full max-w-xs">
            <div className="text-[#00ff33] font-bold tracking-widest text-[12px] mb-2">VAULT LOCKED</div>
            <p className="text-[10px] text-gray-500 tracking-wide mb-3">
              Enter the vault passphrase to open this clip.
            </p>
            <input
              type="password"
              value={pass}
              autoFocus
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void unlockAndOpen()}
              placeholder="PASSPHRASE"
              className="w-full bg-[#0d0d0d] border border-[#1e1e1e] px-2 py-2 text-[12px] text-gray-300 tracking-widest focus:border-[#00ff33]/50 outline-none mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => void unlockAndOpen()}
                disabled={!pass}
                className="flex-1 text-[10px] font-bold tracking-widest py-2 bg-[#00aa22] text-white hover:bg-[#00bb26] disabled:opacity-40"
              >
                UNLOCK & OPEN
              </button>
              <button
                onClick={() => { setAskPassFor(null); setPass(''); }}
                className="text-[10px] font-bold tracking-widest px-3 py-2 border border-[#333] text-gray-400"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NewClipModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [includeUrl, setIncludeUrl] = useState(false);
  const [saving, setSaving] = useState(false);

  async function attemptFetch() {
    if (!url.trim()) return;
    setFetching(true);
    setFetchMsg(null);
    const result = await tryFetchUrlText(url.trim());
    setFetching(false);
    if (result) {
      setTitle(result.title);
      setContent(result.text);
      setFetchMsg('Fetched — review and edit below before saving.');
    } else {
      setFetchMsg('Could not fetch automatically (common — most sites block this). Paste the text manually below.');
    }
  }

  async function handleSave() {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await saveClip({
        title,
        content,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        sourceUrl: url.trim() || undefined,
        includeSourceUrl: includeUrl,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0d0d0d]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] shrink-0">
        <span className="text-[#00ff33] font-bold tracking-[0.15em] text-[13px]">NEW CLIP</span>
        <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        <div>
          <div className="text-[8px] text-gray-600 tracking-widest mb-1">URL (OPTIONAL — TRY FETCH, MOST SITES WILL BLOCK IT)</div>
          <div className="flex gap-1.5">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              spellCheck={false}
              className="flex-1 min-w-0 bg-[#111] border border-[#1e1e1e] px-2 py-1.5 text-[11px] text-gray-300 tracking-tight focus:border-[#00ff33]/50 outline-none"
            />
            <button
              onClick={() => void attemptFetch()}
              disabled={!url.trim() || fetching}
              className="text-[9px] tracking-widest border border-[#333] text-gray-300 px-2.5 hover:border-[#00ff33]/50 disabled:opacity-40"
            >
              {fetching ? 'FETCHING…' : 'TRY FETCH'}
            </button>
          </div>
          {fetchMsg && <p className="mt-1.5 text-[9px] text-gray-500 tracking-wide leading-relaxed">{fetchMsg}</p>}
          {url.trim() && (
            <label className="flex items-center gap-2 mt-2 text-[9px] text-gray-500 tracking-wide">
              <input type="checkbox" checked={includeUrl} onChange={(e) => setIncludeUrl(e.target.checked)} />
              Save this URL with the clip (off by default — keeps no record of what you visited)
            </label>
          )}
        </div>

        <div>
          <div className="text-[8px] text-gray-600 tracking-widest mb-1">TITLE</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled clip"
            className="w-full bg-[#111] border border-[#1e1e1e] px-2 py-1.5 text-[11px] text-gray-300 focus:border-[#00ff33]/50 outline-none"
          />
        </div>

        <div className="flex-1 flex flex-col min-h-[160px]">
          <div className="text-[8px] text-gray-600 tracking-widest mb-1">CONTENT — PASTE OR TYPE TEXT</div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste article text or write your own notes here…"
            className="flex-1 w-full bg-[#111] border border-[#1e1e1e] px-2 py-1.5 text-[11px] text-gray-300 leading-relaxed focus:border-[#00ff33]/50 outline-none resize-none"
          />
        </div>

        <div>
          <div className="text-[8px] text-gray-600 tracking-widest mb-1">TAGS (COMMA-SEPARATED)</div>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="water, legal, first-aid"
            className="w-full bg-[#111] border border-[#1e1e1e] px-2 py-1.5 text-[11px] text-gray-300 focus:border-[#00ff33]/50 outline-none"
          />
        </div>

        <button
          onClick={() => void handleSave()}
          disabled={!content.trim() || saving}
          className="mt-1 w-full py-3 bg-[#00aa22] hover:bg-[#00bb26] text-white font-bold tracking-[0.2em] text-[12px] disabled:opacity-40"
        >
          {saving ? 'ENCRYPTING…' : 'SAVE CLIP'}
        </button>
      </div>
    </div>
  );
}

type FontSize = 'sm' | 'md' | 'lg';
const FONT_CLASS: Record<FontSize, string> = { sm: 'text-[11px]', md: 'text-[13px]', lg: 'text-[16px]' };

function ClipReader({ clip, onBack }: { clip: ClippedArticle; onBack: () => void }) {
  const [size, setSize] = useState<FontSize>('md');
  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-y-auto">
      <header className="flex items-center gap-3 px-4 py-3 bg-[#0d0d0d] border-b border-[#1a1a1a] shrink-0">
        <button onClick={onBack} className="text-[#00ff33] p-1" aria-label="Back to clips">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0 text-white font-bold tracking-widest text-[13px] truncate">{clip.title}</div>
        <div className="flex gap-1 shrink-0">
          {(['sm', 'md', 'lg'] as FontSize[]).map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={`w-7 h-7 text-[10px] font-bold border ${
                size === s ? 'border-[#00ff33]/60 text-[#00ff33] bg-[#00ff33]/10' : 'border-[#333] text-gray-500'
              }`}
            >
              A
            </button>
          ))}
        </div>
      </header>
      <div className="px-4 py-4">
        <div className="text-[9px] text-gray-600 tracking-widest mb-3">
          {new Date(clip.clipped_at).toLocaleString('en-GB').toUpperCase()}
          {clip.tags.length > 0 && ` · ${clip.tags.join(' · ').toUpperCase()}`}
        </div>
        <p className={`${FONT_CLASS[size]} text-gray-300 leading-relaxed whitespace-pre-wrap`}>
          {clip.plaintext_content}
        </p>
        {clip.source_url && (
          <div className="mt-6 pt-3 border-t border-[#1a1a1a] text-[9px] text-gray-600 tracking-wide break-all">
            SOURCE: {clip.source_url}
          </div>
        )}
      </div>
    </div>
  );
}
