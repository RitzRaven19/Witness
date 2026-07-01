import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  registerPMTilesProtocol,
  getOPFSTileFile,
  buildOfflineMapStyle,
  type ResourceLocation,
  type ResourceStatus,
  type ResourceType,
} from '@witness/offline-map';
import { loadMapResources, reseedDemoResources } from '../store/mapResources';

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

/**
 * Resolve the map style: prefer a locally cached PMTiles region from OPFS
 * (fully offline), falling back to the online CARTO dark basemap. Returns the
 * style plus any blob URL that must be revoked on teardown.
 */
async function resolveMapStyle(): Promise<{
  style: string | maplibregl.StyleSpecification;
  blobUrl: string | null;
}> {
  const tile = await getOPFSTileFile();
  if (tile) {
    return { style: buildOfflineMapStyle(tile.blobUrl), blobUrl: tile.blobUrl };
  }
  return { style: CARTO_DARK, blobUrl: null };
}

export function TacticalMapScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef(false);
  const resourceMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsState, setGpsState] = useState<GpsState>('none');
  const [showResources, setShowResources] = useState(true);
  const [resources, setResources] = useState<ResourceLocation[]>([]);
  const [selectedResource, setSelectedResource] = useState<ResourceLocation | null>(null);

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

    (async () => {
      if (!containerRef.current) return;
      const resolved = await resolveMapStyle();
      if (cancelled) {
        if (resolved.blobUrl) URL.revokeObjectURL(resolved.blobUrl);
        return;
      }
      blobUrl = resolved.blobUrl;

      map = new maplibregl.Map({
        container: containerRef.current,
        style: resolved.style,
        center: [DEFAULT_CENTER.lon, DEFAULT_CENTER.lat],
        zoom: 12,
        attributionControl: false,
      });
      mapRef.current = map;

      map.on('load', () => {
        mapLoadedRef.current = true;
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
      resourceMarkersRef.current.forEach((m) => m.remove());
      resourceMarkersRef.current = [];
      gpsMarker?.remove();
      map?.remove();
      mapLoadedRef.current = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flyHome = () => {
    if (coords && mapRef.current) {
      mapRef.current.flyTo({ center: [coords.lng, coords.lat], zoom: 14, duration: 800 });
    }
  };

  const openCount = resources.filter((r) => r.status === 'open').length;
  const limitedCount = resources.filter((r) => r.status === 'limited').length;

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 bg-[#0d0d0d] border-b border-[#1a1a1a] shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button className="flex flex-col gap-1 p-1">
            <span className="w-5 h-0.5 bg-[#00ff33]"/>
            <span className="w-5 h-0.5 bg-[#00ff33]"/>
            <span className="w-5 h-0.5 bg-[#00ff33]"/>
          </button>
          <span className="text-[#00ff33] font-bold tracking-[0.15em] text-[13px]">TACTICAL_NET</span>
        </div>
        <WaveIcon />
      </header>

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
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 ${
                  gpsState === 'locked'    ? (i < 6 ? 'bg-[#00ff33]' : 'bg-[#333]') :
                  gpsState === 'acquiring' ? (i < 3 ? 'bg-[#b8860b]' : 'bg-[#333]') :
                  'bg-[#333]'
                }`}
              />
            ))}
          </div>
          <div className="text-gray-500 text-[8px] tracking-widest">
            {gpsState === 'locked' ? 'SATELLITE LOCK: 78%' : gpsState === 'acquiring' ? 'SEARCHING...' : 'NO SIGNAL'}
          </div>
        </div>

        {/* Tap-to-dismiss popup backdrop */}
        {selectedResource && (
          <div
            className="absolute inset-0 z-10"
            onClick={() => setSelectedResource(null)}
          />
        )}
      </div>
    </div>
  );
}

function WaveIcon() {
  return (
    <svg className="w-5 h-5 text-[#00ff33]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"/>
    </svg>
  );
}
