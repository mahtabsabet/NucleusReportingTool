import React, { useEffect, useState } from 'react';
import { XIcon, PencilIcon, CheckIcon, GitMergeIcon } from 'lucide-react';
import {
  fetchClusterCapacitiesWithCounts,
  renameCapacity,
  mergeCapacities,
  type ClusterCapacityWithCount,
} from '../lib/db/capacities';

interface Props {
  clusterId: string;
  clusterName: string;
  onClose: () => void;
  /** Called after any rename/merge so the parent can refresh its stats. */
  onChanged: () => void;
}

// Cluster-scoped capacity steward panel: rename entries and merge
// duplicates/variants into one canonical wording. Everything here acts
// on a single cluster's catalog — there is no cross-cluster operation.
export function CapacityManagement({ clusterId, clusterName, onClose, onChanged }: Props) {
  const [caps, setCaps] = useState<ClusterCapacityWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeTargetId, setMergeTargetId] = useState<string>('');

  async function load() {
    setLoading(true);
    try {
      setCaps(await fetchClusterCapacitiesWithCounts(clusterId));
      setError(null);
    } catch (err) {
      console.error('Failed to load capacities:', err);
      setError('Could not load capacities.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Default the merge target to the first selected if unset/removed.
      if (!next.has(mergeTargetId)) {
        const first = [...next][0];
        setMergeTargetId(first ?? '');
      }
      return next;
    });
  };

  const startRename = (cap: ClusterCapacityWithCount) => {
    setEditingId(cap.id);
    setEditingName(cap.name);
  };

  const saveRename = async () => {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await renameCapacity(editingId, name);
      setEditingId(null);
      await load();
      onChanged();
    } catch (err: any) {
      setError(err?.message ?? 'Rename failed.');
    } finally {
      setBusy(false);
    }
  };

  const doMerge = async () => {
    if (selected.size < 2 || !mergeTargetId) return;
    const sources = [...selected].filter(id => id !== mergeTargetId);
    setBusy(true);
    setError(null);
    try {
      await mergeCapacities(mergeTargetId, sources);
      setSelected(new Set());
      setMergeTargetId('');
      await load();
      onChanged();
    } catch (err: any) {
      console.error('Merge failed:', err);
      setError(err?.message ?? 'Merge failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Manage capacities</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Rename or merge duplicates in <span className="font-semibold">{clusterName}</span>.
              Merging moves everyone onto a single shared wording.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1 rounded-md hover:bg-gray-100"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {loading ? (
            <p className="text-sm text-gray-400 italic">Loading…</p>
          ) : caps.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No capacities in this cluster yet.</p>
          ) : (
            caps.map(cap => {
              const isSelected = selected.has(cap.id);
              const isTarget = mergeTargetId === cap.id;
              return (
                <div
                  key={cap.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                    isSelected ? 'border-amber-300 bg-amber-50/60' : 'border-gray-200 bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(cap.id)}
                    className="w-4 h-4 accent-amber-600"
                  />
                  {editingId === cap.id ? (
                    <>
                      <input
                        autoFocus
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveRename()}
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        onClick={saveRename}
                        disabled={busy}
                        className="text-green-600 hover:bg-green-50 p-1 rounded-md disabled:opacity-50"
                      >
                        <CheckIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-gray-400 hover:bg-gray-100 p-1 rounded-md"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium text-gray-800">
                        {cap.name}
                        {isTarget && selected.size >= 2 && (
                          <span className="ml-2 text-xs font-bold text-amber-700">(keep)</span>
                        )}
                      </span>
                      <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">
                        {cap.count}
                      </span>
                      <button
                        onClick={() => startRename(cap)}
                        className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 p-1 rounded-md"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {selected.size >= 2 && (
          <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50/60">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">Merge {selected.size} into:</span>
              <select
                value={mergeTargetId}
                onChange={e => setMergeTargetId(e.target.value)}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {[...selected].map(id => {
                  const cap = caps.find(c => c.id === id);
                  return (
                    <option key={id} value={id}>{cap?.name ?? id}</option>
                  );
                })}
              </select>
            </div>
            <button
              onClick={doMerge}
              disabled={busy || !mergeTargetId}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              <GitMergeIcon className="w-4 h-4" />
              Merge into the chosen wording
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
