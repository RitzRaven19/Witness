import { useEffect, useState } from 'react';
import { TacticalHeader } from '../components/TacticalHeader';
import { QrScannerModal } from '../components/QrScannerModal';
import { QrShareModal } from '../components/QrShareModal';
import { ClipsPanel } from './ClipsPanel';
import {
  loadProtocols,
  importKnowledgeJson,
  getShareableKnowledgeJson,
  type LoadedProtocol,
} from '../store/knowledgeStore';

type LibraryTab = 'protocols' | 'clips';

export function TacticalVaultScreen() {
  const [tab, setTab] = useState<LibraryTab>('protocols');
  const [items, setItems] = useState<LoadedProtocol[] | null>(null);
  const [active, setActive] = useState<LoadedProtocol | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [sharePayload, setSharePayload] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    loadProtocols().then(setItems).catch(() => setItems([]));
  }, []);

  function flash(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function handleImport(data: string) {
    setShowScanner(false);
    const res = await importKnowledgeJson(data);
    if (res.ok) {
      setItems(await loadProtocols().catch(() => []));
      flash(true, `Bundle verified · ${res.count} protocols`);
    } else {
      flash(false, res.error ?? 'Import failed');
    }
  }

  function handleShare() {
    const json = getShareableKnowledgeJson();
    if (json) setSharePayload(json);
    else flash(false, 'No verified bundle to share yet');
  }

  if (active) {
    return <ProtocolDetail item={active} onBack={() => setActive(null)} />;
  }

  const publisherName = items?.[0]?.publisherName ?? null;

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-y-auto">
      <TacticalHeader title="TACTICAL_NET_SECURE" />

      {/* Title */}
      <div className="px-4 pt-4 pb-3 border-b border-[#1a1a1a] shrink-0">
        <div className="flex items-start justify-between">
          <h2 className="text-3xl font-bold text-white tracking-widest">KNOWLEDGE<br/>LIBRARY</h2>
          {tab === 'protocols' && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowScanner(true)}
                className="text-[9px] font-bold tracking-widest px-2 py-1 border border-[#333] text-gray-400 hover:border-[#00ff33]/50 hover:text-[#00ff33] transition-colors"
              >
                IMPORT
              </button>
              <button
                onClick={handleShare}
                className="text-[9px] font-bold tracking-widest px-2 py-1 border border-[#333] text-gray-400 hover:border-[#00ff33]/50 hover:text-[#00ff33] transition-colors"
              >
                SHARE
              </button>
            </div>
          )}
        </div>

        {/* D.1 signed protocols vs D.2 private clips — same plane, distinct trust story */}
        <div className="flex gap-0 mt-3 border border-[#1e1e1e]">
          <button
            onClick={() => setTab('protocols')}
            className={`flex-1 py-1.5 text-[9px] font-bold tracking-widest transition-colors ${
              tab === 'protocols' ? 'bg-[#0d1f10] text-[#00ff33]' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            SIGNED PROTOCOLS
          </button>
          <button
            onClick={() => setTab('clips')}
            className={`flex-1 py-1.5 text-[9px] font-bold tracking-widest border-l border-[#1e1e1e] transition-colors ${
              tab === 'clips' ? 'bg-[#0d1f10] text-[#00ff33]' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            MY CLIPS
          </button>
        </div>

        {tab === 'protocols' && (
          <p className="text-[10px] text-gray-500 tracking-widest mt-2">
            {items === null ? 'VERIFYING…' : `${items.length} PROTOCOLS // OFFLINE // HYBRID-SIG VERIFIED`}
          </p>
        )}
      </div>

      {tab === 'clips' ? (
        <ClipsPanel />
      ) : (
        <>
          {/* Import/share feedback */}
          {msg && (
            <div className={`mx-4 mt-2 px-3 py-2 border text-[10px] font-bold tracking-widest ${
              msg.ok ? 'bg-[#0d1f10] border-[#00ff33]/60 text-[#00ff33]' : 'bg-[#1a0505] border-[#cc4444] text-[#cc6666]'
            }`}>
              {msg.text}
            </div>
          )}

          {/* Protocol list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
            {items === null ? (
              <p className="text-gray-600 text-[11px] tracking-widest text-center py-8">
                VERIFYING SIGNATURES…
              </p>
            ) : items.length === 0 ? (
              <p className="text-gray-600 text-[11px] tracking-widest text-center py-8 leading-relaxed">
                NO VERIFIED CONTENT.<br/>Import a signed knowledge bundle via QR.
              </p>
            ) : (
              items.map((item) => {
                const p = item.protocol;
                return (
                  <button
                    key={item.articleId}
                    onClick={() => setActive(item)}
                    className="flex items-center gap-4 bg-[#111] border border-[#1e1e1e] p-4 hover:bg-[#141414] hover:border-[#00ff33]/20 transition-all text-left active:scale-[0.99]"
                  >
                    <div
                      className="w-10 h-10 flex items-center justify-center shrink-0 border"
                      style={{ borderColor: `${p.categoryColor}44`, background: `${p.categoryColor}11` }}
                    >
                      <CategoryIcon category={p.category} color={p.categoryColor} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-bold tracking-widest text-[13px]">{p.title}</div>
                      <div className="text-[10px] text-gray-500 tracking-widest mt-0.5">{p.subtitle}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className="text-[8px] font-bold tracking-widest px-1.5 py-0.5 border"
                        style={{ color: p.categoryColor, borderColor: `${p.categoryColor}44`, background: `${p.categoryColor}11` }}
                      >
                        {p.category}
                      </span>
                      <svg className="w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                      </svg>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer — real provenance */}
          {publisherName && (
            <div className="mx-4 mb-4 shrink-0 flex items-center justify-between border-t border-[#1a1a1a] pt-3">
              <span className="text-[9px] text-gray-600 tracking-widest">PUBLISHER: {publisherName.toUpperCase()}</span>
              <span className="text-[9px] text-[#00ff33]/60 tracking-widest">HASH-VERIFIED ON READ</span>
            </div>
          )}
        </>
      )}

      {/* QR scanner for signed knowledge bundles (multi-frame capable) */}
      {showScanner && (
        <QrScannerModal
          onClose={() => setShowScanner(false)}
          onResult={(data) => { void handleImport(data); }}
        />
      )}

      {/* Share the installed bundle to another device */}
      {sharePayload && (
        <QrShareModal
          payload={sharePayload}
          title="SHARE KNOWLEDGE BUNDLE"
          onClose={() => setSharePayload(null)}
        />
      )}
    </div>
  );
}

function ProtocolDetail({ item, onBack }: { item: LoadedProtocol; onBack: () => void }) {
  const protocol = item.protocol;
  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-y-auto">
      {/* Back header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-[#0d0d0d] border-b border-[#1a1a1a] shrink-0">
        <button onClick={onBack} className="text-[#00ff33] p-1" aria-label="Back to library">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div>
          <div
            className="text-[9px] font-bold tracking-widest"
            style={{ color: protocol.categoryColor }}
          >
            {protocol.category}
          </div>
          <div className="text-white font-bold tracking-widest text-[13px]">{protocol.title}</div>
        </div>
      </header>

      {/* Protocol info — provenance is real */}
      <div className="mx-4 mt-4 mb-4 bg-[#111] border border-[#1e1e1e] p-4 shrink-0">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-[9px] text-gray-500 tracking-widest">PROTOCOL</div>
            <div className="font-bold tracking-widest text-[14px]" style={{ color: protocol.categoryColor }}>
              {protocol.title}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] text-gray-500 tracking-widest">CONTENT</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-2 h-2 bg-[#00ff33]"/>
              <span className="text-[#00ff33] font-bold tracking-widest text-[11px]">HASH VERIFIED</span>
            </div>
          </div>
        </div>
        <div className="mt-2 text-[9px] text-gray-500 tracking-widest">
          BUNDLE: {item.bundleTitle.toUpperCase()}
        </div>
      </div>

      {/* Steps */}
      <div className="px-4 flex flex-col gap-3 mb-4">
        {protocol.steps.map(step => (
          <Step
            key={step.num}
            num={step.num}
            label={step.label}
            items={step.items}
            critical={step.critical}
            categoryColor={protocol.categoryColor}
          />
        ))}

        {protocol.warning && (
          <div className="bg-[#1a0505] border border-[#cc0000]/40 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <svg className="w-3.5 h-3.5 text-[#cc4444]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
              </svg>
              <span className="text-[9px] text-[#cc4444] font-bold tracking-[0.2em]">CRITICAL_WARNING</span>
            </div>
            <p className="text-[10px] text-gray-400 leading-relaxed tracking-wide">{protocol.warning}</p>
          </div>
        )}
      </div>

      {/* Footer — real provenance */}
      <div className="mx-4 mb-4 flex justify-between items-center border-t border-[#1e1e1e] pt-3 shrink-0">
        <div>
          <div className="text-[9px] text-gray-600 tracking-widest">PUBLISHER</div>
          <div className="text-[9px] text-gray-400 tracking-widest">{item.publisherName.toUpperCase()}</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-gray-600 tracking-widest">SIGNATURE</div>
          <div className="text-[9px] text-[#00ff33] tracking-widest">ECDSA + ML-DSA VERIFIED</div>
        </div>
      </div>
    </div>
  );
}

function Step({ num, label, items, critical, categoryColor }: {
  num: string;
  label: string;
  items: string[];
  critical?: boolean;
  categoryColor: string;
}) {
  const numColor = critical ? '#cc4444' : categoryColor;

  return (
    <div className={`bg-[#111] border ${critical ? 'border-[#cc0000]/40' : 'border-[#1e1e1e]'} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[10px] font-bold tracking-widest border px-1.5 py-0.5"
          style={{ color: numColor, borderColor: `${numColor}44` }}
        >
          {num}
        </span>
        <span className={`font-bold tracking-widest text-[12px] ${critical ? 'text-[#cc4444]' : 'text-white'}`}>
          {label}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((line, i) => (
          <p key={i} className="text-[10px] text-gray-400 tracking-wide leading-relaxed">
            &gt; {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function CategoryIcon({ category, color }: { category: string; color: string }) {
  if (category === 'MEDICAL') return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
    </svg>
  );
  if (category === 'SURVIVAL') return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2c0 0-6 7.5-6 12a6 6 0 0012 0c0-4.5-6-12-6-12z"/>
    </svg>
  );
  if (category === 'MOVEMENT') return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
    </svg>
  );
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"/>
    </svg>
  );
}
