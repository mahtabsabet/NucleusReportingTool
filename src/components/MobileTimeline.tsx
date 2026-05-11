import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon } from 'lucide-react';
import { Timeline } from './Timeline';
import { TimelineItemDetailDrawer } from './TimelineItemDetailDrawer';
import { fetchClusters } from '../lib/db/clusters';
import type { ClusterRow } from '../lib/db/clusters';
import { deleteTimelineEvent } from '../lib/db/timeline';
import { getCallerContext } from '../lib/db/users';
import {
  type CallerContext,
  canManageClusterTimelineEvents,
} from '../lib/permissions';
import type { TimelineEvent } from '../types';

export function MobileTimeline() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cluster = searchParams.get('cluster');
  const [clusterName, setClusterName] = useState<string | null>(null);
  const [callerCtx, setCallerCtx] = useState<CallerContext | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<TimelineEvent | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [editSignal, setEditSignal] = useState<{ id: string; nonce: number } | null>(
    null,
  );

  useEffect(() => {
    if (!cluster) return;
    let cancelled = false;
    fetchClusters().then((rows: ClusterRow[]) => {
      if (cancelled) return;
      setClusterName(rows.find(c => c.id === cluster)?.name ?? null);
    });
    return () => { cancelled = true; };
  }, [cluster]);

  useEffect(() => {
    getCallerContext().then(setCallerCtx).catch(() => setCallerCtx(null));
  }, []);

  const canManageItem = useMemo(() => {
    if (!callerCtx || !selectedItem) return false;
    const cid = selectedItem.clusterId ?? cluster ?? null;
    return canManageClusterTimelineEvents(callerCtx, cid);
  }, [callerCtx, selectedItem, cluster]);

  const onItemClick = (item: TimelineEvent) => {
    setSelectedItemId(item.id);
    setSelectedItem(item);
  };

  const closeDrawer = () => {
    setSelectedItemId(null);
    setSelectedItem(null);
  };

  const onEdit = () => {
    if (!selectedItem) return;
    setEditSignal({ id: selectedItem.id, nonce: Date.now() });
  };

  const onDelete = async () => {
    if (!selectedItem) return;
    if (!window.confirm(`Delete "${selectedItem.name}"?`)) return;
    try {
      await deleteTimelineEvent(selectedItem.id);
      closeDrawer();
      setReloadToken(t => t + 1);
    } catch (err) {
      console.error('Failed to delete item', err);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 font-sans">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 px-4 py-4 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          aria-label="Back to home"
          className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 tracking-tight truncate">Timeline</h1>
          <p className="text-xs font-medium text-gray-500 truncate">
            {clusterName ? `${clusterName} cluster` : 'All Alberta clusters'}
          </p>
        </div>
      </header>
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 relative">
          <Timeline
            key={`mt-${cluster ?? 'all'}-${reloadToken}`}
            clusterId={cluster}
            orientation="vertical"
            onItemClick={onItemClick}
            selectedItemId={selectedItemId}
            openEditForItemId={editSignal}
          />
        </div>
        {selectedItem && (
          <TimelineItemDetailDrawer
            item={selectedItem}
            canManage={canManageItem}
            onClose={closeDrawer}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )}
      </div>
    </div>
  );
}
