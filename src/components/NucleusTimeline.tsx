import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CalendarIcon,
  CircleIcon,
} from 'lucide-react';
import { Timeline } from './Timeline';
import { TimelineItemDetailDrawer } from './TimelineItemDetailDrawer';
import { GlobalSearch } from './GlobalSearch';
import { AccountMenu } from './AccountMenu';
import { fetchNucleus } from '../lib/db/nucleus';
import {
  deleteTimelineEvent,
  fetchTimelineEvents,
} from '../lib/db/timeline';
import type { TimelineEvent } from '../types';
import { getCallerContext } from '../lib/db/users';
import {
  type CallerContext,
  canManageNucleusTimelineEvents,
} from '../lib/permissions';
import { useIsMobile } from '../lib/useIsMobile';

// Nucleus-scoped timeline page. Modelled on TimelineWorkspace but
// scoped to a single nucleus — the strip shows everything the
// nucleus has on its calendar (auto-generated activity entries +
// any standalone events/meetings added here), while the cycle
// ladder stays read-only because cycles are administered at the
// cluster level.
//
// The visual model intentionally matches the cluster TimelineWorkspace
// so users can move between the two without re-learning navigation:
// same zoom-on-scroll, shift+scroll pan, pinch-zoom, and drawer.
export function NucleusTimeline() {
  const { id: nucleusId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();

  const initialSelected = searchParams.get('item');

  const [nucleus, setNucleus] = useState<{
    id: string;
    name: string;
    clusterId: string;
  } | null>(null);
  const [callerCtx, setCallerCtx] = useState<CallerContext | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(initialSelected);
  const [selectedItem, setSelectedItem] = useState<TimelineEvent | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!nucleusId) return;
    let cancelled = false;
    fetchNucleus(nucleusId)
      .then(n => {
        if (cancelled || !n) return;
        setNucleus({ id: n.id, name: n.name, clusterId: n.clusterId });
      })
      .catch(() => {});
    getCallerContext().then(setCallerCtx).catch(() => setCallerCtx(null));
    return () => {
      cancelled = true;
    };
  }, [nucleusId]);

  // Resolve a deep-linked item id once the nucleus is known.
  useEffect(() => {
    if (!initialSelected || !nucleusId) return;
    let cancelled = false;
    fetchTimelineEvents({ nucleusId })
      .then(rows => {
        if (cancelled) return;
        const match = rows.find(r => r.id === initialSelected);
        if (match) setSelectedItem(match);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nucleusId]);

  // Persist selection in the URL so deep links round-trip.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedItemId) next.set('item', selectedItemId);
    else next.delete('item');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItemId]);

  const handleItemClick = (item: TimelineEvent) => {
    // Auto-generated entries (linked to an activity) jump to the
    // activity detail page on click — editing the activity is what
    // syncs the entry, so this avoids a confusing dual-edit flow.
    if (item.activityId && nucleusId) {
      navigate(`/nucleus/${nucleusId}/activity/${item.activityId}`);
      return;
    }
    setSelectedItemId(item.id);
    setSelectedItem(item);
  };

  const closeDrawer = () => {
    setSelectedItemId(null);
    setSelectedItem(null);
  };

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
      // Auto-generated entries should clean up by deleting the
      // source activity instead — but we don't expose that here;
      // those rows are already routed to the activity detail page
      // on click, so this branch only handles standalone items.
      await deleteTimelineEvent(selectedItem.id);
      closeDrawer();
      setReloadToken(t => t + 1);
    } catch (err) {
      console.error('Failed to delete timeline item from nucleus view', err);
    }
  };

  const canManageItem = useMemo(() => {
    if (!callerCtx || !nucleus) return false;
    return canManageNucleusTimelineEvents(callerCtx, {
      clusterId: nucleus.clusterId,
      nucleusId: nucleus.id,
    });
  }, [callerCtx, nucleus]);

  if (!nucleusId) return null;
  if (!nucleus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-3 relative z-50 shadow-sm">
        <button
          onClick={() => navigate(`/nucleus/${nucleusId}`)}
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
            {nucleus.name} · Timeline
          </h1>
          <p className="text-xs sm:text-sm font-medium text-gray-500 truncate flex items-center gap-1.5">
            <CircleIcon className="w-3 h-3 text-blue-500" />
            Nucleus calendar — recurring and short-duration activities populate automatically.
          </p>
        </div>

        {!isMobile && (
          <div className="hidden md:block flex-1 max-w-md">
            <GlobalSearch />
          </div>
        )}

        <div className="flex-shrink-0">
          <AccountMenu
            inline
            buttonClassName="w-9 h-9 rounded-full bg-white shadow-sm border border-gray-200 flex items-center justify-center text-sm font-bold text-gray-700 hover:shadow-md hover:border-gray-300 transition-all overflow-hidden"
          />
        </div>
      </header>

      {!isMobile && (
        <div className="md:hidden bg-white border-b border-gray-200 px-4 py-2">
          <GlobalSearch />
        </div>
      )}

      <main className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 relative">
          <Timeline
            key={`tl-${nucleusId}-${reloadToken}`}
            clusterId={nucleus.clusterId}
            nucleusId={nucleusId}
            orientation="horizontal"
            mode="fill"
            onItemClick={handleItemClick}
            selectedItemId={selectedItemId}
            openEditForItemId={editItemSignal}
          />
        </div>
        {selectedItem && (
          <TimelineItemDetailDrawer
            item={selectedItem}
            canManage={canManageItem && !selectedItem.activityId}
            onClose={closeDrawer}
            onEdit={handleEditFromDrawer}
            onDelete={handleDeleteFromDrawer}
          />
        )}
      </main>
    </div>
  );
}

