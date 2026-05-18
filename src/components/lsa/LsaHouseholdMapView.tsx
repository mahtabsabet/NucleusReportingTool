// ============================================================
// LSA household map view.
//
// Visually distinct from ClusterMapView (carto-style monochrome
// tiles, neutral square pins, no engagement colouring, no
// network overlays). Reuses the Leaflet infrastructure so an
// LSA member doesn't have to learn a second map UI.
//
// Top bar carries the Community / Households toggle that
// switches back to the ordinary ClusterMapView. The left drawer
// slot is the household-detail panel; when nothing is selected
// it shows a compact household list.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  HomeIcon,
  PlusIcon,
  UploadIcon,
  ArchiveIcon,
  ArrowLeftRightIcon,
  XIcon,
  MapPinIcon,
  MapPinOffIcon,
  Link2Icon,
  LoaderIcon,
  CrosshairIcon,
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { fetchClusters, type ClusterRow } from '../../lib/db/clusters';
import {
  fetchJurisdictions,
  fetchHouseholds,
  fetchUnlinkedMembersForJurisdiction,
  suggestPersonMatches,
  createHousehold,
  updateHousehold,
  type Household,
  type LsaJurisdiction,
} from '../../lib/db/households';
import { geocodeAddressForCluster, geocodeAddressBatchForCluster } from '../../lib/geocoder';
import { getCallerContext } from '../../lib/db/users';
import {
  canAccessLsaLayer,
  lsaAccessibleClusterIds,
  type CallerContext,
} from '../../lib/permissions';
import { householdMarkerIcon, householdMarkerArchivedIcon } from './HouseholdMarkerIcon';
import { HouseholdDrawer } from './HouseholdDrawer';
import { HouseholdImportModal } from './HouseholdImportModal';

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.setView(center, zoom); }, [center, zoom, map]);
  return null;
}

// When `mode` is set, the next map click captures coordinates
// and hands them back. Used for both "new household" (place) and
// "move this household" (re-pin) flows.
function MapClickCapture({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (enabled) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}


export function LsaHouseholdMapView() {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [callerCtx, setCallerCtx] = useState<CallerContext | null>(null);
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [jurisdictions, setJurisdictions] = useState<LsaJurisdiction[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  // Map placement / move state
  const [placing, setPlacing] = useState<null | { mode: 'new' } | { mode: 'move'; householdId: string }>(null);
  const [draftLocation, setDraftLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftAddress, setDraftAddress] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  // The selected household id is mirrored to ?household=<id> in
  // the URL so that the household drawer survives a round-trip
  // through (e.g.) a linked person's profile page: when the user
  // hits Back on the profile, the map remounts with the param
  // still in place and reopens the drawer where they left off.
  const selectedHouseholdId = searchParams.get('household');
  const setSelectedHouseholdId = (id: string | null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (id) next.set('household', id);
      else next.delete('household');
      return next;
    }, { replace: true });
  };
  const [showImport, setShowImport] = useState(false);

  // Backfill geocoding state — drives the "Geocode missing pins"
  // affordance in the sidebar's attention card. Progress is shown
  // so the LSA isn't left guessing during the ~1-req/sec server-
  // paced sweep through 100+ addresses.
  const [geocoding, setGeocoding] = useState<{ done: number; total: number } | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  // Match-scan state — on demand the LSA can sweep every unlinked
  // member through the community-side search and have any household
  // with hits flagged in the list, so they can triage links without
  // opening every household. Counts mean "members in this household
  // with at least one possible match", not total match count.
  const [matchScanning, setMatchScanning] = useState<{ done: number; total: number } | null>(null);
  const [matchCounts, setMatchCounts] = useState<Map<string, number>>(new Map());
  const [matchScanRan, setMatchScanRan] = useState(false);

  const [mapCenter, setMapCenter] = useState<[number, number]>([52.5, -114.0]);
  const [mapZoom, setMapZoom] = useState(6);

  // ── Bootstrap ─────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const ctx = await getCallerContext();
        setCallerCtx(ctx);
        if (!ctx || !canAccessLsaLayer(ctx)) {
          setAccessDenied(true);
          return;
        }
        const [allClusters, allJurisdictions] = await Promise.all([
          fetchClusters(),
          fetchJurisdictions(),
        ]);

        const accessible = lsaAccessibleClusterIds(ctx);
        const filteredClusters = accessible === 'all'
          ? allClusters
          : allClusters.filter(c => accessible.includes(c.id));
        setClusters(filteredClusters);
        setJurisdictions(allJurisdictions);

        // Resolve initial cluster from route param, ?cluster=, or single
        // accessible cluster fallback.
        const fromRoute = params.clusterId ?? null;
        const fromQuery = searchParams.get('cluster');
        const initialId = fromRoute
          ?? fromQuery
          ?? (filteredClusters.length === 1 ? filteredClusters[0].id : null);
        if (initialId) selectCluster(initialId, filteredClusters, allJurisdictions);
      } catch (err: any) {
        // The most common cause here is the DB migration not yet having
        // been applied (lsa_jurisdictions / households tables missing,
        // or RLS denying the SELECT). Surface the error so the LSA can
        // ask a Super Admin / engineer to apply the migration instead
        // of staring at an infinite spinner.
        const message = err?.message ?? String(err);
        setBootstrapError(
          /lsa_jurisdictions|households|relation .* does not exist/i.test(message)
            ? `Couldn't load the LSA tables. The database migration (20260516_lsa_household_layer.sql) probably hasn't been applied yet. Underlying error: ${message}`
            : `Failed to load LSA data: ${message}`
        );
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectCluster(
    clusterId: string,
    fromClusters?: ClusterRow[],
    fromJurisdictions?: LsaJurisdiction[],
  ) {
    const list = fromClusters ?? clusters;
    const cluster = list.find(c => c.id === clusterId);
    if (!cluster) return;
    setSelectedClusterId(clusterId);
    setMapCenter([cluster.center.lat, cluster.center.lng]);
    setMapZoom(Math.max(11, cluster.zoom));
    setSelectedHouseholdId(null);

    const jurList = fromJurisdictions ?? jurisdictions;
    const jur = jurList.find(j => j.clusterId === clusterId);
    if (jur) {
      loadHouseholds(jur.id);
    } else {
      setHouseholds([]);
    }
  }

  const activeJurisdiction = useMemo(
    () => jurisdictions.find(j => j.clusterId === selectedClusterId) ?? null,
    [jurisdictions, selectedClusterId],
  );
  const activeCluster = useMemo(
    () => clusters.find(c => c.id === selectedClusterId) ?? null,
    [clusters, selectedClusterId],
  );

  async function loadHouseholds(jurisdictionId: string) {
    const rows = await fetchHouseholds(jurisdictionId, { includeArchived });
    setHouseholds(rows);
  }

  useEffect(() => {
    if (activeJurisdiction) loadHouseholds(activeJurisdiction.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeArchived]);

  // ── Placement handlers ───────────────────────────────────
  function startNewPlacement() {
    setPlacing({ mode: 'new' });
    setDraftLocation(null);
    setDraftName('');
    setDraftAddress('');
    setDraftError(null);
    setSelectedHouseholdId(null);
  }
  function cancelPlacement() {
    setPlacing(null);
    setDraftLocation(null);
    setDraftError(null);
  }
  function handleMapClick(lat: number, lng: number) {
    if (!placing) return;
    if (placing.mode === 'new') {
      setDraftLocation({ lat, lng });
    } else {
      // Move existing household — apply immediately.
      applyMove(placing.householdId, lat, lng);
    }
  }
  async function applyMove(householdId: string, lat: number, lng: number) {
    try {
      await updateHousehold(householdId, { lat, lng });
      if (activeJurisdiction) await loadHouseholds(activeJurisdiction.id);
    } finally {
      setPlacing(null);
    }
  }

  // Backfill geocoding for households that have an address but no
  // lat/lng. The edge function paces requests to Nominatim's rate
  // limit, so we batch in chunks and report progress between batches.
  // Households where the geocoder returns no hit are left alone — they
  // remain in the "needs attention" bucket and the LSA can hand-pin
  // them via "Move pin" on the drawer.
  async function geocodeMissing() {
    if (!activeJurisdiction || !activeCluster) return;
    const candidates = households.filter(
      h => h.lat == null && h.archivedAt == null && (h.addressLine ?? '').trim().length > 0,
    );
    if (candidates.length === 0) return;
    setGeocodeError(null);
    setGeocoding({ done: 0, total: candidates.length });
    const CHUNK = 25;
    try {
      for (let i = 0; i < candidates.length; i += CHUNK) {
        const slice = candidates.slice(i, i + CHUNK);
        const hits = await geocodeAddressBatchForCluster(
          slice.map(h => h.addressLine!),
          activeCluster.name,
        );
        await Promise.all(
          slice.map((h, idx) => {
            const hit = hits[idx];
            if (!hit) return Promise.resolve();
            return updateHousehold(h.id, { lat: hit.lat, lng: hit.lng });
          }),
        );
        setGeocoding({ done: Math.min(i + slice.length, candidates.length), total: candidates.length });
      }
      await loadHouseholds(activeJurisdiction.id);
    } catch (e: any) {
      setGeocodeError(e.message ?? 'Geocoding failed');
    } finally {
      setGeocoding(null);
    }
  }

  // Walk every unlinked household member in this jurisdiction and
  // ask the community-building search for possible matches. Results
  // are aggregated by household and surfaced as a green badge on
  // each list row, so the LSA can see at-a-glance which households
  // are worth opening to review links. The drawer's own per-row
  // scan still runs independently when a household is opened.
  async function scanForMatches() {
    if (!activeJurisdiction) return;
    let members: Awaited<ReturnType<typeof fetchUnlinkedMembersForJurisdiction>>;
    try {
      members = await fetchUnlinkedMembersForJurisdiction(activeJurisdiction.id);
    } catch {
      return;
    }
    if (members.length === 0) {
      setMatchCounts(new Map());
      setMatchScanRan(true);
      return;
    }
    setMatchScanning({ done: 0, total: members.length });
    const counts = new Map<string, number>();
    const CONCURRENCY = 5;
    try {
      for (let i = 0; i < members.length; i += CONCURRENCY) {
        const slice = members.slice(i, i + CONCURRENCY);
        const hits = await Promise.all(
          slice.map(m =>
            suggestPersonMatches(m.displayName, activeJurisdiction.id, { limit: 1 })
              .then(s => [m.householdId, s.length > 0] as const)
              .catch(() => [m.householdId, false] as const),
          ),
        );
        for (const [hid, hasMatch] of hits) {
          if (hasMatch) counts.set(hid, (counts.get(hid) ?? 0) + 1);
        }
        setMatchScanning({ done: Math.min(i + slice.length, members.length), total: members.length });
      }
      setMatchCounts(counts);
      setMatchScanRan(true);
    } finally {
      setMatchScanning(null);
    }
  }

  async function geocodeDraft() {
    if (!draftAddress.trim() || !activeCluster) return;
    setSavingDraft(true); setDraftError(null);
    try {
      const hit = await geocodeAddressForCluster(draftAddress.trim(), activeCluster.name);
      if (!hit) { setDraftError('Address not found. Click on the map to place a pin manually.'); return; }
      setDraftLocation({ lat: hit.lat, lng: hit.lng });
      setMapCenter([hit.lat, hit.lng]);
      setMapZoom(15);
    } catch (e: any) {
      setDraftError(e.message ?? 'Geocoding failed');
    } finally { setSavingDraft(false); }
  }
  async function commitNewHousehold() {
    if (!activeJurisdiction || !draftLocation || !draftName.trim()) return;
    setSavingDraft(true); setDraftError(null);
    try {
      const created = await createHousehold({
        jurisdictionId: activeJurisdiction.id,
        displayName: draftName.trim(),
        addressLine: draftAddress.trim() || null,
        lat: draftLocation.lat,
        lng: draftLocation.lng,
      });
      await loadHouseholds(activeJurisdiction.id);
      setSelectedHouseholdId(created.id);
      cancelPlacement();
    } catch (e: any) {
      setDraftError(e.message ?? 'Failed to save household');
    } finally { setSavingDraft(false); }
  }

  // ── Cluster switcher (top-bar) ────────────────────────────
  function handleClusterSwitch(id: string) {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set('cluster', id);
      return p;
    }, { replace: true });
    selectCluster(id);
  }

  // ── Render guards ─────────────────────────────────────────
  if (accessDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50 px-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">LSA layer access required</h1>
          <p className="text-sm text-gray-600 mb-4">
            This view is restricted to Super Admins and LSA Members.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 rounded-lg bg-amber-700 text-white text-sm font-semibold hover:bg-amber-800">
            Back to map
          </button>
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-amber-50">
        <LoaderIcon className="w-6 h-6 text-amber-500 animate-spin" />
      </div>
    );
  }
  if (bootstrapError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50 px-6">
        <div className="max-w-xl">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">LSA layer not ready</h1>
          <p className="text-sm text-gray-700 mb-4 whitespace-pre-wrap">{bootstrapError}</p>
          <div className="flex gap-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-amber-700 text-white text-sm font-semibold hover:bg-amber-800">
              Retry
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 rounded-lg border border-amber-200 text-amber-700 text-sm font-semibold hover:bg-amber-100">
              Back to map
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (clusters.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50 px-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">No LSA jurisdiction</h1>
          <p className="text-sm text-gray-600">
            Your account isn't attached to an LSA jurisdiction yet. A Super Admin can grant you LSA membership in a cluster.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-amber-50 font-sans">
      <header className="bg-white border-b border-amber-200 px-4 sm:px-6 py-3 flex items-center justify-between z-10 relative shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/')}
            aria-label="Back to community map"
            title="Back to community map"
            className="w-9 h-9 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center hover:bg-amber-200">
            <ArrowLeftIcon className="w-4 h-4" />
          </button>
          <div className="w-9 h-9 bg-amber-700 text-white rounded-xl flex items-center justify-center shadow-sm hidden sm:flex">
            <HomeIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-semibold text-gray-900 tracking-tight truncate">
              LSA Households
            </h1>
            <p className="text-[11px] sm:text-xs text-amber-500">
              {activeJurisdiction
                ? activeJurisdiction.name
                : 'Select a jurisdiction'}
              {households.length > 0 ? ` · ${households.length} household${households.length === 1 ? '' : 's'}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle: Community ↔ Households */}
          <div className="hidden sm:flex items-center bg-amber-100 rounded-xl p-1">
            <button
              onClick={() => navigate(selectedClusterId ? `/?cluster=${selectedClusterId}` : '/')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg text-amber-600 hover:text-amber-900">
              Community
            </button>
            <button
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white text-amber-900 shadow-sm">
              Households
            </button>
          </div>

          {clusters.length > 1 && (
            <select
              value={selectedClusterId ?? ''}
              onChange={e => handleClusterSwitch(e.target.value)}
              className="rounded-xl border border-amber-200 px-3 py-1.5 text-sm bg-white">
              <option value="">Choose cluster…</option>
              {clusters.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          {activeJurisdiction && !placing && (
            <>
              <button
                onClick={() => setShowImport(true)}
                title="Import from spreadsheet"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-amber-200 bg-white text-amber-700 hover:bg-amber-50">
                <UploadIcon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Import</span>
              </button>
              <button
                onClick={startNewPlacement}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800">
                <PlusIcon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">New household</span>
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative flex-col lg:flex-row">
        {/* Left panel: either household detail (when selected) or the household list. */}
        {selectedHouseholdId && activeJurisdiction && activeCluster ? (
          <HouseholdDrawer
            householdId={selectedHouseholdId}
            jurisdictionId={activeJurisdiction.id}
            clusterName={activeCluster.name}
            onClose={() => setSelectedHouseholdId(null)}
            onStartMove={(hid) => {
              setSelectedHouseholdId(null);
              setPlacing({ mode: 'move', householdId: hid });
            }}
            onChanged={() => activeJurisdiction && loadHouseholds(activeJurisdiction.id)}
          />
        ) : (
          <HouseholdSidebar
            households={households}
            selectedId={selectedHouseholdId}
            includeArchived={includeArchived}
            onSelect={(id, h) => {
              setSelectedHouseholdId(id);
              if (h.lat != null && h.lng != null) {
                setMapCenter([h.lat, h.lng]);
                setMapZoom(15);
              }
            }}
            onToggleArchived={() => setIncludeArchived(v => !v)}
            onGeocodeMissing={geocodeMissing}
            geocoding={geocoding}
            geocodeError={geocodeError}
            onScanForMatches={scanForMatches}
            matchScanning={matchScanning}
            matchCounts={matchCounts}
            matchScanRan={matchScanRan}
          />
        )}

        <main className="flex-1 relative">
          {/* Placement banner */}
          {placing && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white border border-amber-200 rounded-xl shadow-md px-4 py-2 text-xs font-semibold text-amber-800 flex items-center gap-3">
              <CrosshairIcon className="w-3.5 h-3.5 text-amber-500" />
              {placing.mode === 'new'
                ? (draftLocation
                    ? 'Pin placed — fill in the details to save.'
                    : 'Click on the map to drop a pin (or type an address below).')
                : 'Click on the map to move the pin.'}
              <button
                onClick={cancelPlacement}
                className="ml-2 text-amber-500 hover:text-amber-900">
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            className="h-full w-full"
            zoomControl={true}>
            <MapController center={mapCenter} zoom={mapZoom} />
            <MapClickCapture enabled={!!placing} onPick={handleMapClick} />
            {/* Carto Voyager — vibrant pastel palette, full colour, but
                visually distinct from the raw OSM tiles the community
                map uses. Reads as "place / geography" at a glance
                without competing with the engagement-bucket colouring
                on the community side. */}
            <TileLayer
              url="https://cartodb-basemaps-a.global.ssl.fastly.net/rastertiles/voyager/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
              maxZoom={19}
            />
            {households.map(h => {
              if (h.lat == null || h.lng == null) return null;
              return (
                <Marker
                  key={h.id}
                  position={[h.lat, h.lng]}
                  icon={h.archivedAt ? householdMarkerArchivedIcon : householdMarkerIcon}
                  eventHandlers={{
                    click: () => setSelectedHouseholdId(h.id),
                  }}>
                  <Popup>
                    <div className="text-xs font-semibold text-gray-900">{h.displayName}</div>
                  </Popup>
                </Marker>
              );
            })}
            {placing?.mode === 'new' && draftLocation && (
              <Marker
                position={[draftLocation.lat, draftLocation.lng]}
                icon={householdMarkerIcon}
              />
            )}
          </MapContainer>

          {/* New household form — appears in the bottom-right once a pin is dropped. */}
          {placing?.mode === 'new' && (
            <div className="absolute bottom-4 right-4 z-[1000] bg-white rounded-2xl border border-amber-200 shadow-lg p-4 w-80">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">New household</h3>
              <div className="space-y-2">
                <input
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  placeholder="Display name (e.g. Sabet family)"
                  className="w-full rounded-lg border border-amber-200 px-2.5 py-1.5 text-sm"
                />
                <div className="flex gap-1">
                  <input
                    value={draftAddress}
                    onChange={e => setDraftAddress(e.target.value)}
                    placeholder="Address (optional)"
                    className="flex-1 rounded-lg border border-amber-200 px-2.5 py-1.5 text-sm"
                  />
                  <button
                    onClick={geocodeDraft}
                    disabled={savingDraft || !draftAddress.trim()}
                    title="Look up address and drop pin"
                    className="px-2 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50">
                    <MapPinIcon className="w-4 h-4" />
                  </button>
                </div>
                {draftLocation && (
                  <div className="text-[11px] text-amber-500">
                    Pin: {draftLocation.lat.toFixed(5)}, {draftLocation.lng.toFixed(5)}
                  </div>
                )}
                {draftError && (
                  <div className="rounded bg-red-50 border border-red-200 px-2 py-1 text-[11px] text-red-700">
                    {draftError}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={cancelPlacement}
                    className="flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50">
                    Cancel
                  </button>
                  <button
                    onClick={commitNewHousehold}
                    disabled={savingDraft || !draftLocation || !draftName.trim()}
                    className="flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50">
                    {savingDraft ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {showImport && activeJurisdiction && (
        <HouseholdImportModal
          jurisdictionId={activeJurisdiction.id}
          onClose={() => setShowImport(false)}
          onImported={() => {
            if (activeJurisdiction) loadHouseholds(activeJurisdiction.id);
          }}
        />
      )}
    </div>
  );
}


function HouseholdSidebar({
  households,
  selectedId,
  includeArchived,
  onSelect,
  onToggleArchived,
  onGeocodeMissing,
  geocoding,
  geocodeError,
  onScanForMatches,
  matchScanning,
  matchCounts,
  matchScanRan,
}: {
  households: Household[];
  selectedId: string | null;
  includeArchived: boolean;
  onSelect: (id: string, h: Household) => void;
  onToggleArchived: () => void;
  onGeocodeMissing: () => Promise<void> | void;
  geocoding: { done: number; total: number } | null;
  geocodeError: string | null;
  onScanForMatches: () => Promise<void> | void;
  matchScanning: { done: number; total: number } | null;
  matchCounts: Map<string, number>;
  matchScanRan: boolean;
}) {
  const [query, setQuery] = useState('');
  const [onlyNeedsAttention, setOnlyNeedsAttention] = useState(false);

  const needsPin = useMemo(
    () => households.filter(h => h.archivedAt == null && h.lat == null && (h.addressLine ?? '').trim().length > 0),
    [households],
  );
  const needsAddress = useMemo(
    () => households.filter(h => h.archivedAt == null && !(h.addressLine ?? '').trim().length),
    [households],
  );
  const attentionCount = needsPin.length + needsAddress.length;

  const filtered = useMemo(() => {
    let list = households;
    if (onlyNeedsAttention) {
      const flagIds = new Set([...needsPin, ...needsAddress].map(h => h.id));
      list = list.filter(h => flagIds.has(h.id));
    }
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(h =>
      h.displayName.toLowerCase().includes(q)
      || (h.addressLine ?? '').toLowerCase().includes(q),
    );
  }, [households, query, onlyNeedsAttention, needsPin, needsAddress]);

  return (
    <aside className="bg-white border-r border-amber-200 overflow-y-auto shadow-sm flex flex-col w-80 lg:w-96">
      <div className="p-4 border-b border-amber-100 sticky top-0 bg-white z-10 space-y-3">
        <h2 className="text-xs font-bold text-amber-500 uppercase tracking-widest">Households</h2>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search…"
          className="w-full rounded-lg border border-amber-200 px-3 py-1.5 text-sm"
        />
        <div className="flex items-center justify-between">
          <button
            onClick={onToggleArchived}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 hover:text-amber-900">
            <ArchiveIcon className="w-3 h-3" />
            {includeArchived ? 'Hide archived' : 'Show archived'}
          </button>
          {attentionCount > 0 && (
            <button
              onClick={() => setOnlyNeedsAttention(v => !v)}
              className={`text-[11px] font-semibold ${onlyNeedsAttention ? 'text-amber-900 underline' : 'text-amber-600 hover:text-amber-900'}`}>
              {onlyNeedsAttention ? 'Show all' : `Only needs attention (${attentionCount})`}
            </button>
          )}
        </div>
      </div>

      {attentionCount > 0 && (
        <div className="mx-4 mt-3 mb-2 rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <MapPinOffIcon className="w-3.5 h-3.5 text-amber-700" />
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
              Needs attention
            </h3>
          </div>
          {needsPin.length > 0 && (
            <div className="text-[11px] text-amber-900 leading-snug">
              <strong>{needsPin.length}</strong> household{needsPin.length === 1 ? '' : 's'} ha{needsPin.length === 1 ? 's' : 've'} an address but no pin on the map.
              <button
                onClick={onGeocodeMissing}
                disabled={!!geocoding}
                className="block mt-1.5 px-2 py-1 text-[11px] font-semibold rounded-lg bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed">
                {geocoding
                  ? <span className="inline-flex items-center gap-1.5"><LoaderIcon className="w-3 h-3 animate-spin" /> Geocoding… {geocoding.done}/{geocoding.total}</span>
                  : `Geocode ${needsPin.length} address${needsPin.length === 1 ? '' : 'es'}`}
              </button>
            </div>
          )}
          {needsAddress.length > 0 && (
            <div className="text-[11px] text-amber-900 leading-snug">
              <strong>{needsAddress.length}</strong> household{needsAddress.length === 1 ? '' : 's'} ha{needsAddress.length === 1 ? 's' : 've'} no address recorded. Open each to add one.
            </div>
          )}
          {geocodeError && (
            <div className="rounded bg-red-50 border border-red-200 px-2 py-1 text-[11px] text-red-700">
              {geocodeError}
            </div>
          )}
        </div>
      )}

      {/* Community-link scan — surfaces possible community-side
          profile matches at the list level, before the LSA opens
          individual households. The drawer still runs its own
          per-row scan once a household is opened. */}
      {households.length > 0 && (
        <div className="mx-4 mt-3 mb-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Link2Icon className="w-3.5 h-3.5 text-emerald-700" />
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              Community-side links
            </h3>
          </div>
          {matchScanRan && matchCounts.size === 0 && !matchScanning ? (
            <div className="text-[11px] text-emerald-900 leading-snug">
              No possible community-side matches found across this jurisdiction's unlinked members.
            </div>
          ) : matchScanRan && !matchScanning ? (
            <div className="text-[11px] text-emerald-900 leading-snug">
              <strong>{matchCounts.size}</strong> household{matchCounts.size === 1 ? '' : 's'} ha{matchCounts.size === 1 ? 's' : 've'} at least one possible community-side match. Look for the green badge in the list below.
            </div>
          ) : (
            <div className="text-[11px] text-emerald-900 leading-snug">
              Sweep every unlinked household member through the community-building search and flag households whose members might already have a profile.
            </div>
          )}
          <button
            onClick={onScanForMatches}
            disabled={!!matchScanning}
            className="block px-2 py-1 text-[11px] font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed">
            {matchScanning
              ? <span className="inline-flex items-center gap-1.5"><LoaderIcon className="w-3 h-3 animate-spin" /> Scanning… {matchScanning.done}/{matchScanning.total}</span>
              : matchScanRan ? 'Re-scan' : 'Scan for community matches'}
          </button>
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="px-4 py-6 text-sm text-amber-500 italic">
          No households yet. Use <strong className="font-semibold text-amber-700">New household</strong> or <strong className="font-semibold text-amber-700">Import</strong> to add some.
        </div>
      ) : (
        <ul className="divide-y divide-amber-100">
          {filtered.map(h => (
            <li key={h.id}>
              <button
                onClick={() => onSelect(h.id, h)}
                className={`w-full text-left px-4 py-3 hover:bg-amber-50 ${selectedId === h.id ? 'bg-amber-100' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{h.displayName}</div>
                    <div className="text-[11px] text-amber-500 truncate">
                      {h.addressLine || 'No address'}
                    </div>
                  </div>
                  {h.archivedAt && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                      Archived
                    </span>
                  )}
                  {h.lat == null && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 inline-flex items-center gap-1">
                      <MapPinOffIcon className="w-3 h-3" />
                      {(h.addressLine ?? '').trim().length > 0 ? 'No pin' : 'No address'}
                    </span>
                  )}
                  {matchCounts.get(h.id) ? (
                    <span
                      title={`${matchCounts.get(h.id)} member${matchCounts.get(h.id) === 1 ? '' : 's'} with possible community-side match${matchCounts.get(h.id) === 1 ? '' : 'es'}`}
                      className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 inline-flex items-center gap-1">
                      <Link2Icon className="w-3 h-3" />
                      {matchCounts.get(h.id)} match{matchCounts.get(h.id) === 1 ? '' : 'es'}
                    </span>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto px-4 py-3 border-t border-amber-100 text-[10px] text-amber-400 leading-relaxed">
        Household data is private to the LSA layer. Ordinary coordinators and viewers cannot see addresses or household membership.
      </div>
    </aside>
  );
}

// Compatibility shim so router can also expose the inline (non-:clusterId)
// route — the bootstrap selects the first accessible cluster automatically.
export { LsaHouseholdMapView as LsaHouseholdMap };
