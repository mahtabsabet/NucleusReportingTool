import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CalendarIcon,
  ChevronDownIcon,
  GlobeIcon,
  MapIcon,
} from 'lucide-react';
import { Timeline } from './Timeline';
import { TimelineItemDetailDrawer } from './TimelineItemDetailDrawer';
import { GlobalSearch } from './GlobalSearch';
import { fetchClusters } from '../lib/db/clusters';
import type { ClusterRow } from '../lib/db/clusters';
import {
  deleteTimelineEvent,
  fetchTimelineEvents,
} from '../lib/db/timeline';
import type { TimelineEvent } from '../types';
import { getCallerContext } from '../lib/db/users';
import {
  type CallerContext,
  canManageClusterTimelineEvents,
} from '../lib/permissions';
import { useIsMobile } from '../lib/useIsMobile';

// Full-page timeline workspace. Replaces the bottom-banner Timeline
// that used to live under the cluster map.
//
// The page is structured so the timeline strip occupies the full
// horizontal width of the viewport and the detail drawer (when an
// item is selected) docks to the bottom — preserving the timeline's
// horizontal real-estate for panning/zooming while keeping the
// selected item's context one glance away.
export function TimelineWorkspace() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();

  const initialCluster = searchParams.get('cluster');
  const initialSelected = searchParams.get('item');

  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [clustersLoading, setClustersLoading] = useState(true);
  const [clusterId, setClusterId] = useState<string | null>(initialCluster);
  const [clusterDropdownOpen, setClusterDropdownOpen] = useState(false);
  const [callerCtx, setCallerCtx] = useState<CallerContext | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(initialSelected);
  const [selectedItem, setSelectedItem] = useState<TimelineEvent | null>(null);
  // Bumping `reloadToken` invalidates the Timeline's cached events
  // by remounting it. Used after the workspace deletes an item via
  // the drawer (the Timeline owns its own events state otherwise).
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchClusters()
      .then(c => {
        if (cancelled) return;
        setClusters(c);
      })
      .catch(() => { /* keep empty */ })
      .finally(() => {
        if (!cancelled) setClustersLoading(false);
      });
    getCallerContext().then(setCallerCtx).catch(() => setCallerCtx(null));
    return () => {
      cancelled = true;
    };
  }, []);

  // If a deep link includes an item id, fetch it once the cluster
  // is known. The Timeline component owns its own item list, but
  // the drawer needs the full record — fetch it independently here.
  useEffect(() => {
    if (!initialSelected) return;
    let cancelled = false;
    fetchTimelineEvents({ clusterId: clusterId ?? undefined })
      .then(rows => {
        if (cancelled) return;
        const match = rows.find(r => r.id === initialSelected);
        if (match) setSelectedItem(match);
      })
      .catch(() => { /* swallow — drawer simply won't open */ });
    return () => {
      cancelled = true;
    };
    // We only resolve the deep-link once, on mount; subsequent
    // selections come from clicks which already provide the full row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist selection (and cluster) in the URL so the deep link round-
  // trips through browser back/forward.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (clusterId) next.set('cluster', clusterId);
    else next.delete('cluster');
    if (selectedItemId) next.set('item', selectedItemId);
    else next.delete('item');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId, selectedItemId]);

  const handleItemClick = (item: TimelineEvent) => {
    setSelectedItemId(item.id);
    setSelectedItem(item);
  };

  const closeDrawer = () => {
    setSelectedItemId(null);
    setSelectedItem(null);
  };

  // The Timeline component owns the edit modal. We surface "Edit" in
  // the drawer by closing the drawer + re-triggering its add/edit UI
  // — but the Timeline's modal needs a ref hook to open from outside.
  // A clean compromise: we delete via this workspace, and "Edit" in
  // the drawer simulates a second click on the strip (which the
  // Timeline interprets as "open detail drawer", because onItemClick
  // is wired). So a true edit goes through the Timeline strip itself
  // by long-press or a context menu in future. For Phase 1 we make
  // Edit close the drawer and route the user to a quick rename inline
  // by reopening the strip's existing modal via a workspace-level
  // event. Concretely: we expose an editItemSignal so the Timeline
  // re-opens its edit modal when this changes.
  const [editItemSignal, setEditItemSignal] = useState<{
    id: string;
    nonce: number;
  } | null>(null);

  const handleEditFromDrawer = () => {
    if (!selectedItem) return;
    setEditItemSignal({ id: selectedItem.id, nonce: Date.now() });
  };

  const handleDeleteFromDrawer = async () => {
    if (!selectedItem) return;
    if (!window.confirm(`Delete "${selectedItem.name}"?`)) return;
    try {
      await deleteTimelineEvent(selectedItem.id);
      closeDrawer();
      setReloadToken(t => t + 1);
    } catch (err) {
      console.error('Failed to delete item from workspace', err);
    }
  };

  const canManageItem = useMemo(() => {
    if (!callerCtx || !selectedItem) return false;
    // Notes and meeting edits gate on the parent item's cluster — fall
    // back to the workspace's cluster if the row's cluster is null.
    const cid = selectedItem.clusterId ?? clusterId ?? null;
    return canManageClusterTimelineEvents(callerCtx, cid);
  }, [callerCtx, selectedItem, clusterId]);

  const currentClusterName = useMemo(
    () => clusters.find(c => c.id === clusterId)?.name ?? null,
    [clusters, clusterId],
  );

  // Mobile-specific layout — close-on-outside-click for the cluster picker.
  const clusterDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!clusterDropdownOpen) return;
    const onClick = (e: MouseEvent) => {
      if (
        clusterDropdownRef.current &&
        !clusterDropdownRef.current.contains(e.target as Node)
      ) {
        setClusterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [clusterDropdownOpen]);

  // Reserve vertical room for the drawer so the timeline doesn't
  // shrink unexpectedly as the user drags the drawer handle. On
  // desktop the drawer is `position: fixed` and overlays the
  // strip's lower half — that's fine because the strip has plenty
  // of vertical room (events on top, meetings below the axis), and
  // the user can still pan/zoom because the drawer doesn't capture
  // wheel/touch events directed at the timeline above it.

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-3 z-10 shadow-sm">
        <button
          onClick={() => navigate('/')}
          aria-label="Back"
          className="w-10 h-10 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 flex-shrink-0"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-md hidden sm:flex flex-shrink-0">
          <CalendarIcon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900 tracking-tight truncate">
            Timeline
          </h1>
          <p className="text-xs sm:text-sm font-medium text-gray-500 truncate">
            {currentClusterName
              ? `${currentClusterName} cluster`
              : 'All Alberta clusters'}
          </p>
        </div>

        {!isMobile && (
          <div className="hidden md:block flex-1 max-w-md">
            <GlobalSearch />
          </div>
        )}

        {/* Cluster picker — same dropdown pattern as the map sidebar so
            users can flip between clusters without leaving the workspace. */}
        <div className="relative flex-shrink-0" ref={clusterDropdownRef}>
          <button
            onClick={() => setClusterDropdownOpen(v => !v)}
            disabled={clustersLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-semibold text-gray-700 max-w-[200px]"
          >
            {clusterId ? (
              <MapIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
            ) : (
              <GlobeIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            )}
            <span className="truncate">
              {currentClusterName ?? 'All Clusters'}
            </span>
            <ChevronDownIcon
              className={`w-4 h-4 text-gray-400 transition-transform ${
                clusterDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          {clusterDropdownOpen && (
            <div className="absolute right-0 mt-1 w-64 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-20 p-1">
              <button
                onClick={() => {
                  setClusterId(null);
                  setClusterDropdownOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm font-semibold ${
                  clusterId === null
                    ? 'bg-blue-50 text-blue-800'
                    : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <GlobeIcon className="w-4 h-4 text-gray-400" /> All Clusters
              </button>
              {clusters.map(c => (
                <button
                  key={c.id}
                  onClick={() => {
                    setClusterId(c.id);
                    setClusterDropdownOpen(false);
                    // Clear selection when switching cluster — the
                    // previously-selected item likely lives in another scope.
                    setSelectedItemId(null);
                    setSelectedItem(null);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm font-semibold ${
                    clusterId === c.id
                      ? 'bg-blue-50 text-blue-800'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <MapIcon className="w-4 h-4 text-blue-500" /> {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {!isMobile && (
        <div className="md:hidden bg-white border-b border-gray-200 px-4 py-2">
          <GlobalSearch />
        </div>
      )}

      <main className="flex-1 min-h-0 relative">
        <Timeline
          // Re-mount on reload-token bumps so the Timeline picks up
          // newly-deleted items without us reaching into its state.
          key={`tl-${clusterId ?? 'all'}-${reloadToken}`}
          clusterId={clusterId}
          orientation="horizontal"
          mode="fill"
          onItemClick={handleItemClick}
          selectedItemId={selectedItemId}
          openEditForItemId={editItemSignal}
        />
        {selectedItem && (
          <TimelineItemDetailDrawer
            item={selectedItem}
            canManage={canManageItem}
            onClose={closeDrawer}
            onEdit={handleEditFromDrawer}
            onDelete={handleDeleteFromDrawer}
          />
        )}
      </main>
    </div>
  );
}
