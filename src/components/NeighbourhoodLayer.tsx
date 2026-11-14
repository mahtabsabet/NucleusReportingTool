import { useEffect, useRef, useState } from 'react';
import { GeoJSON, Pane, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { EyeIcon, EyeOffIcon, MapIcon } from 'lucide-react';
import {
  NEIGHBOURHOODS_URL,
  fetchNeighbourhoodMilestones,
  setNeighbourhoodMilestone,
  type NeighbourhoodMilestone,
  type NeighbourhoodProps,
} from '../lib/db/neighbourhoods';
import { MILESTONE_COLOR, MILESTONES } from '../lib/milestoneColors';

// Neighbourhood overlay shared by the community map and the household
// map. Off by default; when on it draws thin, translucent outlines with
// names (from zoom 12 in), and a neighbourhood's manual milestone as a
// light colour fill (one colour per milestone) that never hides the basemap.

// @types/leaflet and @types/geojson aren't installed in this project,
// so keep the shapes we touch loosely typed.
type Feature = { properties: NeighbourhoodProps };
type FeatureCollection = { type: 'FeatureCollection'; features: Feature[] };
type LatLng = { lat: number; lng: number };

const TINT = '#0f766e';  // faint outlines for neighbourhoods with no milestone
// One distinct hue per milestone (shades of a single colour were too
// hard to tell apart), all light enough that streets stay legible.
// M0 ("focus") is a lighter fill: being worked in, not yet at M1.
const MILESTONE_FILL_OPACITY: Record<NeighbourhoodMilestone, number> = { 0: 0.2, 1: 0.32, 2: 0.32, 3: 0.32 };
const MILESTONE_LABEL: Record<NeighbourhoodMilestone, string> = {
  0: 'Focus', 1: 'Milestone 1', 2: 'Milestone 2', 3: 'Milestone 3',
};
const LABEL_MIN_ZOOM = 12;
const STORAGE_KEY = 'map.neighbourhoodOverlay';
const BASEMAP_HIDDEN_KEY = 'map.basemapHidden';
const MARKERS_HIDDEN_KEY = 'map.markersHidden';

let shapesPromise: Promise<FeatureCollection> | null = null;
function loadShapes(): Promise<FeatureCollection> {
  shapesPromise ??= fetch(NEIGHBOURHOODS_URL).then(r => {
    if (!r.ok) throw new Error(`Failed to load neighbourhoods (${r.status})`);
    return r.json();
  });
  shapesPromise.catch(() => { shapesPromise = null; });
  return shapesPromise;
}

// A boolean remembered per browser, so it carries between the
// community and household views.
function useStoredFlag(key: string): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  });
  const update = (next: boolean) => {
    setOn(next);
    try { localStorage.setItem(key, next ? '1' : '0'); } catch { /* storage unavailable */ }
  };
  return [on, update];
}

export function useNeighbourhoodOverlay(): [boolean, (on: boolean) => void] {
  return useStoredFlag(STORAGE_KEY);
}

// Whether the street map underneath is hidden, leaving only the
// neighbourhood outlines and milestone shading. Only applies while the
// overlay is on (callers check both).
export function useBasemapHidden(): [boolean, (hidden: boolean) => void] {
  return useStoredFlag(BASEMAP_HIDDEN_KEY);
}

// Whether the community map's nucleus pins and activity dots are hidden
// under the overlay. Same rule: only while the overlay is on.
export function useMarkersHidden(): [boolean, (hidden: boolean) => void] {
  return useStoredFlag(MARKERS_HIDDEN_KEY);
}

// Floating view controls, top-right of the map: hide the street map
// (and, where the caller passes it, the map's own markers) to leave just
// the neighbourhoods. Render inside MapContainer while the overlay is on.
export function NeighbourhoodViewControls({
  basemapHidden, onToggleBasemap, markersHidden, onToggleMarkers,
}: {
  basemapHidden: boolean;
  onToggleBasemap: () => void;
  markersHidden?: boolean;
  onToggleMarkers?: () => void;
}) {
  const map = useMap();
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (ref.current) L.DomEvent.disableClickPropagation(ref.current);
  }, []);
  // White canvas instead of Leaflet's grey while the tiles are off.
  useEffect(() => {
    const el = map.getContainer();
    el.classList.toggle('basemap-hidden', basemapHidden);
    return () => el.classList.remove('basemap-hidden');
  }, [map, basemapHidden]);
  const button = (hidden: boolean, onClick: () => void, what: string, title: string) => (
    <button
      onClick={onClick}
      aria-pressed={hidden}
      title={title}
      className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/95 border border-gray-200 shadow-sm text-gray-700 hover:bg-gray-50">
      {hidden ? <EyeIcon className="w-3.5 h-3.5" /> : <EyeOffIcon className="w-3.5 h-3.5" />}
      {hidden ? `Show ${what}` : `Hide ${what}`}
    </button>
  );
  return (
    <div ref={ref} className="absolute top-3 right-3 z-[1000] flex flex-col items-stretch gap-1.5">
      {button(basemapHidden, onToggleBasemap, 'map',
        basemapHidden ? 'Show the street map again' : 'Hide the street map, leaving only neighbourhoods')}
      {onToggleMarkers && button(!!markersHidden, onToggleMarkers, 'markers',
        markersHidden ? 'Show nucleus and activity markers again' : 'Hide nucleus and activity markers')}
    </div>
  );
}

export function NeighbourhoodToggle({
  on, onToggle, tone = 'indigo',
}: { on: boolean; onToggle: () => void; tone?: 'indigo' | 'amber' }) {
  const active = tone === 'amber'
    ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
    : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100';
  const inactive = tone === 'amber'
    ? 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50'
    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50';
  return (
    <button
      onClick={onToggle}
      aria-pressed={on}
      title="Neighbourhoods: show boundaries and milestones"
      aria-label="Neighbourhoods"
      className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 border ${on ? active : inactive}`}>
      <MapIcon className="w-4 h-4 sm:w-5 sm:h-5" />
      <span className="hidden 2xl:inline">Neighbourhoods</span>
    </button>
  );
}

interface Selected { code: string; name: string; latlng: LatLng }

export function NeighbourhoodLayer({
  clusterId, canEdit, interactive = true, basemapHidden = false,
}: {
  clusterId: string;
  canEdit: boolean;
  // false while the map is in a click-to-place mode, so clicks reach the map.
  interactive?: boolean;
  // With no street map underneath, plain outlines can be a little
  // stronger and still stay quiet.
  basemapHidden?: boolean;
}) {
  const map = useMap();
  const [shapes, setShapes] = useState<FeatureCollection | null>(null);
  const [milestones, setMilestones] = useState<Map<string, NeighbourhoodMilestone>>(new Map());
  const [selected, setSelected] = useState<Selected | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const layerRef = useRef<any>(null);
  const legendRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadShapes().then(setShapes).catch(err => console.error(err));
  }, []);

  useEffect(() => {
    fetchNeighbourhoodMilestones(clusterId)
      .then(setMilestones)
      .catch(err => console.error('Failed to load neighbourhood milestones', err));
  }, [clusterId]);

  // Names only from LABEL_MIN_ZOOM in — at city scale 260 labels are noise.
  const syncLabels = () => {
    map.getContainer().classList.toggle('neighbourhood-labels-hidden', map.getZoom() < LABEL_MIN_ZOOM);
  };
  useMapEvents({ zoomend: syncLabels });
  useEffect(() => {
    syncLabels();
    return () => map.getContainer().classList.remove('neighbourhood-labels-hidden');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    if (legendRef.current) L.DomEvent.disableClickPropagation(legendRef.current);
  }, []);

  const styleFor = (feature?: Feature): Record<string, unknown> => {
    const code = feature?.properties?.id ?? '';
    const m = milestones.get(code);
    const isSelected = selected?.code === code;
    return {
      color: m != null ? MILESTONE_COLOR[m] : TINT,
      weight: isSelected ? 2.5 : m != null ? 1.2 : 1,
      opacity: isSelected ? 0.9 : m != null ? 0.75 : basemapHidden ? 0.45 : 0.3,
      fillColor: m != null ? MILESTONE_COLOR[m] : TINT,
      fillOpacity: m != null ? MILESTONE_FILL_OPACITY[m] : 0,
    };
  };
  // Restyle in place when milestones or the selection change.
  useEffect(() => {
    layerRef.current?.setStyle(styleFor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestones, selected, basemapHidden]);

  const onEachFeature = (feature: Feature, layer: any) => {
    const p = feature.properties;
    layer.bindTooltip(p.name, {
      permanent: true, direction: 'center', className: 'neighbourhood-label', interactive: false,
    });
    layer.on('click', (e: any) => {
      L.DomEvent.stopPropagation(e);
      setError(null);
      setSelected({ code: p.id, name: p.name, latlng: e.latlng });
    });
  };

  const choose = async (m: NeighbourhoodMilestone | null) => {
    if (!selected) return;
    const prev = milestones.get(selected.code) ?? null;
    if (prev === m) return;
    setSaving(true);
    setError(null);
    const next = new Map(milestones);
    if (m == null) next.delete(selected.code); else next.set(selected.code, m);
    setMilestones(next);
    try {
      await setNeighbourhoodMilestone(clusterId, selected.code, m);
    } catch (err: any) {
      console.error('Failed to save neighbourhood milestone', err);
      setMilestones(milestones);
      setError(err?.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const current = selected ? milestones.get(selected.code) ?? null : null;

  return (
    <>
      {/* Below the overlay pane (400) so nucleus pins, activity dots and
          household markers stay on top and clickable. */}
      <Pane name="neighbourhoods" style={{ zIndex: 350 }}>
        {shapes && (
          <GeoJSON
            key={interactive ? 'interactive' : 'passive'}
            ref={layerRef}
            data={shapes}
            style={styleFor}
            onEachFeature={onEachFeature}
            interactive={interactive}
          />
        )}
      </Pane>
      {selected && interactive && (
        <Popup position={selected.latlng} eventHandlers={{ remove: () => setSelected(null) }}>
          <div className="min-w-[200px]">
            <p className="text-xs font-bold uppercase tracking-wider text-teal-700 mb-0.5">Neighbourhood</p>
            <h3 className="text-base font-bold text-gray-900 mb-2">{selected.name}</h3>
            {canEdit ? (
              <>
                <p className="text-xs text-gray-500 mb-1.5">Milestone</p>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  {([null, ...MILESTONES] as const).map(m => (
                    <button
                      key={m ?? 'none'}
                      onClick={() => choose(m)}
                      disabled={saving}
                      style={current === m && m != null ? { backgroundColor: MILESTONE_COLOR[m] } : undefined}
                      className={`flex-1 px-2 py-1.5 text-xs font-semibold border-r last:border-r-0 border-gray-200 transition-colors disabled:opacity-60 ${
                        current === m ? (m == null ? 'bg-gray-700 text-white' : 'text-white') : 'bg-white text-gray-700 hover:bg-gray-50'
                      }`}>
                      {m == null ? 'None' : `M${m}`}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-600">
                {current != null ? MILESTONE_LABEL[current] : 'Not a focus neighbourhood'}
              </p>
            )}
            {error && <p className="text-xs text-red-700 mt-2">{error}</p>}
          </div>
        </Popup>
      )}
      <div
        ref={legendRef}
        className="absolute bottom-6 left-3 z-[1000] bg-white/90 backdrop-blur rounded-xl border border-gray-200 shadow-sm px-3 py-2 text-xs text-gray-700">
        <p className="font-semibold text-gray-900 mb-1">Milestones</p>
        <div className="flex items-center gap-3">
          {MILESTONES.map(m => (
            <span key={m} className="flex items-center gap-1.5">
              <span
                className="w-3.5 h-3.5 rounded-sm border"
                style={{ backgroundColor: MILESTONE_COLOR[m], opacity: m === 0 ? 0.55 : 0.75, borderColor: MILESTONE_COLOR[m] }} />
              {m === 0 ? 'M0 Focus' : `M${m}`}
            </span>
          ))}
        </div>
        {canEdit && <p className="text-[11px] text-gray-500 mt-1">Click a neighbourhood to set its milestone.</p>}
      </div>
    </>
  );
}
