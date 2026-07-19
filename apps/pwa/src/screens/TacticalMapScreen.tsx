import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  registerPMTilesProtocol,
  getOPFSTileFile,
  buildOfflineMapStyle,
  downloadRegionPack,
  getInstalledRegion,
  deleteRegionPack,
  type RegionInfo,
  type RegionDownloadProgress,
  type ResourceLocation,
  type ResourceStatus,
  type ResourceType,
} from '@witness/offline-map';
import { loadMapResources, reseedDemoResources, getStoredResources, importBundleJson, getShareableBundleJson } from '../store/mapResources';
import { QrScannerModal } from '../components/QrScannerModal';
import { QrShareModal } from '../components/QrShareModal';
import { TacticalHeader } from '../components/TacticalHeader';

const CARTO_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// Map centre used before a GPS fix is available (WGS-84 lat/lon).
const DEFAULT_CENTER = { lat: 51.5, lon: 0 };

type GpsState = 'none' | 'acquiring' | 'locked';

const RESOURCE_CONFIG: Record<ResourceType, { color: string; label: string; icon: string }> = {
  granary:             { color: '#b8860b', label: 'GRANARY',    icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  water_point:         { color: '#2196f3', label: 'WATER',      icon: 'M12 2c0 0-6 7.5-6 12a6 6 0 0012 0c0-4.5-6-12-6-12z' },
  underground_shelter: { color: '#888888', label: 'SHELTER↓',   icon: 'M12 22V10M5 10l7-8 7 8H5zM5 10h14' },
  surface_shelter:     { color: '#4caf50', label: 'SHELTER',    icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
  clinic:              { color: '#cc2222', label: 'CLINIC',      icon: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z' },
  transit_corridor:    { color: '#dddddd', label: 'CORRIDOR',   icon: 'M4 12h16M14 6l6 6-6 6' },
};

function createResourceEl(type: ResourceType, status: ResourceStatus): HTMLElement {
  const { color, icon } = RESOURCE_CONFIG[type];
  const opacity = status === 'limited' ? 0.65 : status === 'closed' ? 0.25 : 1;
  const badge = status === 'limited' ? '!' : status === 'unknown' ? '?' : null;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    position: relative;
    width: 36px;
    height: 36px;
    cursor: pointer;
  `;

  const circle = document.createElement('div');
  circle.style.cssText = `
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: ${color}22;
    border: 2px solid ${color};
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: ${opacity};
    box-shadow: 0 0 8px ${color}66;
  `;

  circle.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${icon}"/></svg>`;

  if (badge) {
    const badgeEl = document.createElement('div');
    badgeEl.style.cssText = `
      position: absolute;
      top: -4px;
      right: -4px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: ${status === 'unknown' ? '#555' : '#cc6600'};
      border: 1px solid #000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: bold;
      color: #fff;
      font-family: monospace;
    `;
    badgeEl.textContent = badge;
    wrapper.appendChild(badgeEl);
  }

  wrapper.appendChild(circle);
  return wrapper;
}

export type BasemapMode = 'pack' | 'none' | 'online';

/** Source-free style: dark canvas, zero network requests. Markers still render. */
const BLANK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#101410' } }],
};

/**
 * Resolve the map style. Offline-first is a safety property, not a fallback:
 *   1. an installed PMTiles region pack (fully offline), else
 *   2. a blank source-free canvas — the map makes NO network requests.
 * The online CARTO basemap is used only when the user explicitly opted in for
 * this session (it reveals the client IP to the tile server on every pan).
 */
async function resolveMapStyle(allowOnline: boolean): Promise<{
  style: string | maplibregl.StyleSpecification;
  blobUrl: string | null;
  mode: BasemapMode;
}> {
  const tile = await getOPFSTileFile();
  if (tile) {
    return { style: buildOfflineMapStyle(tile.blobUrl), blobUrl: tile.blobUrl, mode: 'pack' };
  }
  if (allowOnline) {
    return { style: CARTO_DARK, blobUrl: null, mode: 'online' };
  }
  return { style: BLANK_STYLE, blobUrl: null, mode: 'none' };
}

export function TacticalMapScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef(false);
  const resourceMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null); // metres, from the GPS fix
  const [gpsState, setGpsState] = useState<GpsState>('none');
  const [showResources, setShowResources] = useState(true);
  const [resources, setResources] = useState<ResourceLocation[]>([]);
  const [selectedResource, setSelectedResource] = useState<ResourceLocation | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [sharePayload, setSharePayload] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Offline tile pack management
  const [showTiles, setShowTiles] = useState(false);
  const [region, setRegion] = useState<RegionInfo | null>(null);
  const [dlProgress, setDlProgress] = useState<RegionDownloadProgress | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const [tileUrl, setTileUrl] = useState('');
  const [mapEpoch, setMapEpoch] = useState(0); // bump to re-init the map with a new style
  const dlAbortRef = useRef<AbortController | null>(null);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('none');
  // Session-only opt-in: never persisted, so every launch starts silent.
  const [allowOnline, setAllowOnline] = useState(false);

  useEffect(() => {
    getInstalledRegion().then(setRegion).catch(() => {});
  }, [mapEpoch]);

  async function startTileDownload() {
    const url = tileUrl.trim();
    if (!url || dlAbortRef.current) return;
    setDlError(null);
    setDlProgress({ received: 0, total: null });
    const ctrl = new AbortController();
    dlAbortRef.current = ctrl;
    try {
      await downloadRegionPack(url, {
        onProgress: setDlProgress,
        signal: ctrl.signal,
      });
      setTileUrl('');
      setMapEpoch((e) => e + 1); // remount map onto the new offline pack
    } catch (err) {
      setDlError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      dlAbortRef.current = null;
      setDlProgress(null);
    }
  }

  function cancelTileDownload() {
    dlAbortRef.current?.abort();
  }

  async function removeTilePack() {
    await deleteRegionPack().catch(() => {});
    setMapEpoch((e) => e + 1);
  }

  function handleShare() {
    const json = getShareableBundleJson();
    if (json) {
      setSharePayload(json);
    } else {
      setImportMsg({ ok: false, text: 'No verified bundle to share yet' });
      setTimeout(() => setImportMsg(null), 4000);
    }
  }

  async function handleImport(data: string) {
    setShowScanner(false);
    const res = await importBundleJson(data);
    if (res.ok) {
      const stored = await getStoredResources();
      setResources(stored);
      setImportMsg({ ok: true, text: `Bundle verified · ${res.count} resources` });
      const first = stored[0];
      if (first && mapRef.current) {
        mapRef.current.flyTo({ center: [first.lon, first.lat], zoom: 13, duration: 1000 });
      }
    } else {
      setImportMsg({ ok: false, text: res.error ?? 'Import failed' });
    }
    setTimeout(() => setImportMsg(null), 4000);
  }

  // (Re)draw markers whenever the verified resource set or visibility changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    resourceMarkersRef.current.forEach((m) => m.remove());
    resourceMarkersRef.current = [];
    if (!showResources) return;

    for (const res of resources) {
      if (res.status === 'closed') continue;
      if (!RESOURCE_CONFIG[res.type]) continue;
      const el = createResourceEl(res.type, res.status);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedResource(res);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([res.lon, res.lat])
        .addTo(map);
      resourceMarkersRef.current.push(marker);
    }
  }, [resources, showResources]);

  useEffect(() => {
    const unregisterProtocol = registerPMTilesProtocol(maplibregl);

    let map: maplibregl.Map;
    let gpsMarker: maplibregl.Marker | null = null;
    let blobUrl: string | null = null;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      if (!containerRef.current) return;
      const resolved = await resolveMapStyle(allowOnline);
      if (cancelled) {
        if (resolved.blobUrl) URL.revokeObjectURL(resolved.blobUrl);
        return;
      }
      blobUrl = resolved.blobUrl;
      setBasemapMode(resolved.mode);

      map = new maplibregl.Map({
        container: containerRef.current,
        style: resolved.style,
        center: [DEFAULT_CENTER.lon, DEFAULT_CENTER.lat],
        zoom: 12,
        attributionControl: false,
      });
      mapRef.current = map;

      // The canvas measures its container at construction, which can happen
      // before flex layout settles (visible as a short map strip over a black
      // void). Track the container and resize the canvas to match.
      resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(containerRef.current);

      map.on('load', () => {
        mapLoadedRef.current = true;
        map.resize();
        // Nudge the marker effect now that the map can accept markers.
        setResources((r) => [...r]);
      });

      // Load verified resources for the initial (default) centre.
      const initial = await loadMapResources(DEFAULT_CENTER);
      if (!cancelled) setResources(initial);

      setGpsState('acquiring');
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (cancelled) return;
          const { latitude: lat, longitude: lng } = pos.coords;
          setCoords({ lat, lng });
          setAccuracy(pos.coords.accuracy);
          setGpsState('locked');
          map.flyTo({ center: [lng, lat], zoom: 14, duration: 1200 });
          gpsMarker = new maplibregl.Marker({ color: '#00ff33' })
            .setLngLat([lng, lat])
            .addTo(map);
          // Demo: re-centre resources near the user (see mapResources.ts).
          const near = await reseedDemoResources({ lat, lon: lng });
          if (!cancelled) setResources(near);
        },
        () => setGpsState('none'),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
      );
    })();

    return () => {
      cancelled = true;
      unregisterProtocol();
      resizeObserver?.disconnect();
      resourceMarkersRef.current.forEach((m) => m.remove());
      resourceMarkersRef.current = [];
      gpsMarker?.remove();
      map?.remove();
      mapLoadedRef.current = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      mapRef.current = null;
    };
  // Re-runs when a tile pack is installed/removed or the online opt-in changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapEpoch, allowOnline]);

  const flyHome = () => {
    if (coords && mapRef.current) {
      mapRef.current.flyTo({ center: [coords.lng, coords.lat], zoom: 14, duration: 800 });
    }
  };

  const openCount = resources.filter((r) => r.status === 'open').length;
  const limitedCount = resources.filter((r) => r.status === 'limited').length;

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-hidden">
      {!embedded && <TacticalHeader />}

      <div className="flex items-center justify-between px-4 py-2 bg-[#0d0d0d] shrink-0 z-10">
        <h2 className="text-xl font-bold text-white tracking-widest">EMERGENCY MAP</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowResources(v => !v)}
            className={`text-[9px] font-bold tracking-widest px-2 py-1 border transition-colors ${
              showResources
                ? 'bg-[#0d1f10] border-[#00ff33]/50 text-[#00ff33]'
                : 'bg-[#141414] border-[#333] text-gray-500'
            }`}
          >
            RESOURCES {showResources ? 'ON' : 'OFF'}
          </button>
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
          <button
            onClick={() => setShowTiles(true)}
            className={`text-[9px] font-bold tracking-widest px-2 py-1 border transition-colors ${
              basemapMode === 'pack'
                ? 'bg-[#0d1f10] border-[#00ff33]/50 text-[#00ff33]'
                : basemapMode === 'online'
                ? 'border-[#cc4444]/70 text-[#cc4444] hover:bg-[#cc4444]/10'
                : 'border-[#b8860b]/60 text-[#b8860b] hover:bg-[#b8860b]/10'
            }`}
          >
            {basemapMode === 'online' ? 'TILES · ONLINE' : 'TILES'}
          </button>
          <button
            onClick={flyHome}
            className="flex items-center gap-1.5 bg-[#b8860b] hover:bg-[#d4a017] px-2.5 py-1.5 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
            </svg>
            <span className="text-white font-bold tracking-widest text-[9px]">
              {gpsState === 'acquiring' ? 'ACQUIRING' : gpsState === 'locked' ? 'LOCKED' : 'NO FIX'}
            </span>
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />

        {/* Resource info panel (top-right) */}
        {showResources && resources.length > 0 && (
          <div className="absolute top-2 right-2 bg-[#0d0d0d]/90 border border-[#1a1a1a] p-2 z-10 flex flex-col gap-1.5">
            <div className="text-[8px] text-[#00ff33] font-bold tracking-[0.2em] mb-0.5">NGO RESOURCES</div>
            {Object.entries(RESOURCE_CONFIG).map(([type, cfg]) => {
              const count = resources.filter(r => r.type === type && r.status !== 'closed').length;
              if (count === 0) return null;
              return (
                <div key={type} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cfg.color }}/>
                  <span className="text-[8px] text-gray-400 tracking-widest">{cfg.label}</span>
                  <span className="text-[8px] font-bold ml-auto" style={{ color: cfg.color }}>{count}</span>
                </div>
              );
            })}
            <div className="border-t border-[#222] mt-0.5 pt-1 flex gap-3">
              <span className="text-[8px] text-[#00ff33] tracking-widest">{openCount} OPEN</span>
              <span className="text-[8px] text-[#cc6600] tracking-widest">{limitedCount} LTD</span>
            </div>
          </div>
        )}

        {/* Resource popup */}
        {selectedResource && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#111] border border-[#333] p-4 z-20 w-56 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <div
                className="text-[10px] font-bold tracking-widest"
                style={{ color: RESOURCE_CONFIG[selectedResource.type].color }}
              >
                {RESOURCE_CONFIG[selectedResource.type].label}
              </div>
              <button
                onClick={() => setSelectedResource(null)}
                className="text-gray-600 hover:text-white text-[10px]"
              >✕</button>
            </div>
            <div className="text-white font-bold tracking-widest text-[12px] mb-2">
              {selectedResource.label ?? RESOURCE_CONFIG[selectedResource.type].label}
            </div>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full ${
                selectedResource.status === 'open' ? 'bg-[#00ff33]' :
                selectedResource.status === 'limited' ? 'bg-[#cc6600]' : 'bg-gray-500'
              }`}/>
              <span className="text-[10px] tracking-widest text-gray-300">{selectedResource.status.toUpperCase()}</span>
            </div>
            <div className="text-[9px] text-gray-500 tracking-widest">
              CAPACITY: {(selectedResource.capacity_hint ?? 'unknown').toUpperCase()}
            </div>
            <div className="mt-2 text-[8px] text-[#00ff33]/60 tracking-widest">
              VERIFIED BY TRUSTED PUBLISHER · SIGNED
            </div>
          </div>
        )}

        {/* Zoom controls */}
        <div className="absolute right-3 bottom-36 flex flex-col gap-1 z-10">
          <button
            onClick={() => mapRef.current?.zoomIn()}
            className="w-12 h-12 bg-[#1a1a1a]/95 flex items-center justify-center text-white text-xl font-bold border border-[#333] hover:bg-[#222]"
          >+</button>
          <button
            onClick={() => mapRef.current?.zoomOut()}
            className="w-12 h-12 bg-[#1a1a1a]/95 flex items-center justify-center text-white text-xl font-bold border border-[#333] hover:bg-[#222]"
          >−</button>
          <button
            onClick={flyHome}
            className="w-12 h-12 bg-[#00aa22] flex items-center justify-center border border-[#00ff33]/40 hover:bg-[#00bb26] mt-1"
          >
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
            </svg>
          </button>
        </div>

        {/* GPS / coords panel */}
        <div className="absolute bottom-3 left-3 bg-[#1a1a1a]/95 border border-[#333] p-3 z-10">
          <div className="text-[#00ff33] text-[8px] font-bold tracking-[0.2em] mb-1">CURRENT COORDINATES</div>
          {coords ? (
            <div className="text-white font-bold text-[13px] tracking-widest mb-1">
              {Math.abs(coords.lat).toFixed(4)}° {coords.lat >= 0 ? 'N' : 'S'},{' '}
              {Math.abs(coords.lng).toFixed(4)}° {coords.lng >= 0 ? 'E' : 'W'}
            </div>
          ) : (
            <div className="text-gray-500 font-bold text-[13px] tracking-widest mb-1">
              {gpsState === 'acquiring' ? 'ACQUIRING...' : 'NO FIX'}
            </div>
          )}
          <div className="flex gap-1 mb-1">
            {Array.from({ length: 8 }).map((_, i) => {
              // Map fix accuracy (metres) onto signal bars: ≤5m → 8 bars, ≥150m → 1 bar
              const bars = accuracy === null ? 0
                : Math.max(1, Math.min(8, Math.round(8 - 7 * (Math.min(accuracy, 150) - 5) / 145)));
              return (
                <div
                  key={i}
                  className={`flex-1 h-1.5 ${
                    gpsState === 'locked'    ? (i < bars ? 'bg-[#00ff33]' : 'bg-[#333]') :
                    gpsState === 'acquiring' ? (i < 3 ? 'bg-[#b8860b]' : 'bg-[#333]') :
                    'bg-[#333]'
                  }`}
                />
              );
            })}
          </div>
          <div className="text-gray-500 text-[8px] tracking-widest">
            {gpsState === 'locked'
              ? accuracy !== null ? `ACCURACY: ±${Math.round(accuracy)} M` : 'FIX ACQUIRED'
              : gpsState === 'acquiring' ? 'SEARCHING...' : 'NO SIGNAL'}
          </div>
        </div>

        {/* Tap-to-dismiss popup backdrop */}
        {selectedResource && (
          <div
            className="absolute inset-0 z-10"
            onClick={() => setSelectedResource(null)}
          />
        )}

        {/* Bundle import result toast */}
        {importMsg && (
          <div
            className={`absolute top-2 left-1/2 -translate-x-1/2 z-30 px-3 py-2 border text-[10px] font-bold tracking-widest ${
              importMsg.ok
                ? 'bg-[#0d1f10] border-[#00ff33]/60 text-[#00ff33]'
                : 'bg-[#1a0505] border-[#cc4444] text-[#cc6666]'
            }`}
          >
            {importMsg.text}
          </div>
        )}
      </div>

      {/* QR scanner for NGO ResourceBundle import */}
      {showScanner && (
        <QrScannerModal
          onClose={() => setShowScanner(false)}
          onResult={(data) => { void handleImport(data); }}
        />
      )}

      {/* QR sequence display for sharing the verified bundle to another device */}
      {sharePayload && (
        <QrShareModal
          payload={sharePayload}
          title="SHARE RESOURCE BUNDLE"
          onClose={() => setSharePayload(null)}
        />
      )}

      {/* Offline tile pack manager */}
      {showTiles && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0d0d0d]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] shrink-0">
            <span className="text-[#00ff33] font-bold tracking-[0.15em] text-[13px]">OFFLINE TILES</span>
            <button
              onClick={() => setShowTiles(false)}
              aria-label="Close tile manager"
              className="text-gray-400 hover:text-white p-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
            {/* Current basemap status — offline by default, online only by explicit opt-in */}
            <div className={`border p-3 ${
              region ? 'bg-[#0d1f10] border-[#00ff33]/40'
              : allowOnline ? 'bg-[#1a0505] border-[#cc4444]/50'
              : 'bg-[#1a1205] border-[#b8860b]/50'
            }`}>
              {region ? (
                <>
                  <div className="text-[10px] font-bold tracking-widest text-[#00ff33] mb-1">OFFLINE PACK INSTALLED</div>
                  <div className="text-[11px] text-gray-300 tracking-wider">
                    {region.regionName} · {(region.sizeBytes / 1e6).toFixed(1)} MB
                  </div>
                  <div className="text-[9px] text-gray-500 tracking-wide mt-1">Map renders with zero network requests.</div>
                </>
              ) : allowOnline ? (
                <>
                  <div className="text-[10px] font-bold tracking-widest text-[#cc4444] mb-1">ONLINE BASEMAP ACTIVE</div>
                  <div className="text-[9px] text-gray-400 tracking-wide leading-relaxed mb-2">
                    Every tile request reveals your IP to the CARTO tile server. This lasts for this
                    session only.
                  </div>
                  <button
                    onClick={() => setAllowOnline(false)}
                    className="text-[9px] font-bold tracking-widest border border-[#00ff33]/50 text-[#00ff33] px-2.5 py-1.5 hover:bg-[#00ff33]/10"
                  >
                    GO SILENT (BLANK BASEMAP)
                  </button>
                </>
              ) : (
                <>
                  <div className="text-[10px] font-bold tracking-widest text-[#b8860b] mb-1">SILENT MODE — NO BASEMAP</div>
                  <div className="text-[9px] text-gray-400 tracking-wide leading-relaxed mb-2">
                    No offline pack installed, so the map shows verified resource markers on a blank
                    canvas and makes ZERO network requests. Download a pack below for full offline
                    streets — or temporarily use the online basemap (reveals your IP to the tile
                    server; needs internet).
                  </div>
                  <button
                    onClick={() => setAllowOnline(true)}
                    className="text-[9px] font-bold tracking-widest border border-[#cc4444]/60 text-[#cc4444] px-2.5 py-1.5 hover:bg-[#cc4444]/10"
                  >
                    USE ONLINE BASEMAP (THIS SESSION)
                  </button>
                </>
              )}
            </div>

            {/* Download */}
            <div className="bg-[#111] border border-[#1e1e1e] p-3">
              <div className="text-[8px] text-gray-600 tracking-widest mb-1">REGION PACK URL (.pmtiles)</div>
              <div className="flex gap-1.5">
                <input
                  value={tileUrl}
                  onChange={(e) => setTileUrl(e.target.value)}
                  placeholder="https://ngo.example/packs/my-region.pmtiles"
                  spellCheck={false}
                  disabled={dlProgress !== null}
                  className="flex-1 min-w-0 bg-[#0d0d0d] border border-[#1e1e1e] px-2 py-1.5 text-[10px] text-gray-300 font-sentry tracking-tight focus:border-[#00ff33]/50 outline-none disabled:opacity-50"
                />
                {dlProgress === null ? (
                  <button
                    onClick={() => void startTileDownload()}
                    disabled={!tileUrl.trim()}
                    className="text-[9px] tracking-widest border border-[#00ff33]/50 text-[#00ff33] px-2.5 hover:bg-[#00ff33]/10 disabled:border-[#333] disabled:text-gray-600"
                  >
                    DOWNLOAD
                  </button>
                ) : (
                  <button
                    onClick={cancelTileDownload}
                    className="text-[9px] tracking-widest border border-[#cc4444] text-[#cc4444] px-2.5 hover:bg-[#cc4444]/10"
                  >
                    CANCEL
                  </button>
                )}
              </div>

              {dlProgress && (
                <div className="mt-3">
                  <div className="flex justify-between text-[9px] text-gray-400 tracking-widest mb-1 tabular-nums">
                    <span>{(dlProgress.received / 1e6).toFixed(1)} MB</span>
                    <span>
                      {dlProgress.total
                        ? `${Math.floor((dlProgress.received / dlProgress.total) * 100)}% of ${(dlProgress.total / 1e6).toFixed(0)} MB`
                        : 'SIZE UNKNOWN'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#1a1a1a]">
                    <div
                      className="h-full bg-[#00ff33] transition-all"
                      style={{ width: dlProgress.total ? `${Math.min(100, (dlProgress.received / dlProgress.total) * 100)}%` : '15%' }}
                    />
                  </div>
                  <div className="text-[8px] text-gray-600 tracking-wide mt-1">
                    Interrupted downloads resume from where they stopped.
                  </div>
                </div>
              )}

              {dlError && <p className="mt-2 text-[10px] text-[#cc6666] tracking-wide">{dlError}</p>}

              <p className="mt-3 text-[8px] text-gray-600 tracking-wide leading-relaxed">
                Packs are single-file PMTiles extracts (50–500 MB per region), produced with
                `pmtiles extract` from OpenStreetMap builds and hosted by your organisation.
                Also transferable from another device via Wi-Fi Direct or pre-loaded by field staff.
              </p>
            </div>

            {region && dlProgress === null && (
              <button
                onClick={() => void removeTilePack()}
                className="text-[10px] tracking-widest border border-[#cc4444]/60 text-[#cc4444] px-3 py-2 hover:bg-[#cc4444]/10 self-start"
              >
                DELETE PACK ({region.regionName})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
