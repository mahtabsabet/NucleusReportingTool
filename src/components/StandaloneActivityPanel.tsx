import { useEffect, useState } from 'react';
import { MapPinIcon, PlusIcon, ArrowRightIcon } from 'lucide-react';
import type { Activity } from '../types';
import { fetchNuclei, type NucleusRow } from '../lib/db/clusters';
import {
  attachActivityToNucleus,
  canManageStandaloneActivities,
  createNucleusFromActivity,
} from '../lib/db/nucleus';

// Shown on a standalone activity (one with no nucleus). Cluster
// coordinators can move it into an existing nucleus in the same
// cluster, or grow a new nucleus around it at its map location.
// Everyone else just sees that it isn't part of a nucleus yet.
export function StandaloneActivityPanel({
  activity,
  onAttached,
}: {
  activity: Activity;
  onAttached: (nucleusId: string) => void | Promise<void>;
}) {
  const clusterId = activity.clusterId ?? null;
  const [canManage, setCanManage] = useState(false);
  const [nuclei, setNuclei] = useState<NucleusRow[]>([]);
  const [mode, setMode] = useState<'idle' | 'attach' | 'create'>('idle');
  const [selectedNucleus, setSelectedNucleus] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clusterId) return;
    canManageStandaloneActivities(clusterId).then(ok => {
      setCanManage(ok);
      if (ok) fetchNuclei(clusterId).then(setNuclei).catch(() => setNuclei([]));
    });
  }, [clusterId]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    try {
      await onAttached(await fn());
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleAttach = () => {
    if (!selectedNucleus) return;
    run(async () => {
      await attachActivityToNucleus(activity.id, selectedNucleus);
      return selectedNucleus;
    });
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    run(() => createNucleusFromActivity(activity.id, newName.trim()));
  };

  return (
    <div className="bg-sky-50 border border-sky-200 rounded-2xl p-5 sm:p-6 mb-6">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0">
          <MapPinIcon className="w-5 h-5 text-sky-700" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sky-900">Not part of a nucleus yet</h3>
          <p className="text-sm text-sky-800 mt-0.5">
            This activity shows on the cluster map as a small dot.
            {canManage
              ? ' Add it to a nucleus, or start a new nucleus around it. Its participants will be enrolled in that nucleus as unassigned.'
              : ' A cluster coordinator can add it to a nucleus later.'}
          </p>

          {canManage && mode === 'idle' && (
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                onClick={() => setMode('attach')}
                disabled={nuclei.length === 0}
                title={nuclei.length === 0 ? 'No nuclei in this cluster yet' : undefined}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-sky-300 text-sky-800 text-sm font-semibold rounded-xl hover:bg-sky-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowRightIcon className="w-4 h-4" />
                Add to nucleus…
              </button>
              <button
                onClick={() => { setNewName(activity.name); setMode('create'); }}
                disabled={!activity.location}
                title={!activity.location ? 'This activity has no map location' : undefined}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-700 text-white text-sm font-semibold rounded-xl hover:bg-sky-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PlusIcon className="w-4 h-4" />
                Create nucleus here
              </button>
            </div>
          )}

          {canManage && mode === 'attach' && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <select
                value={selectedNucleus}
                onChange={e => setSelectedNucleus(e.target.value)}
                className="px-3 py-2 border border-sky-300 rounded-xl text-sm bg-white min-w-[200px]"
                autoFocus
              >
                <option value="">Choose a nucleus…</option>
                {nuclei.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
              <button
                onClick={handleAttach}
                disabled={!selectedNucleus || busy}
                className="px-4 py-2 bg-sky-700 text-white text-sm font-semibold rounded-xl hover:bg-sky-800 disabled:opacity-50"
              >
                {busy ? 'Moving…' : 'Add to nucleus'}
              </button>
              <button
                onClick={() => { setMode('idle'); setError(null); }}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-sky-800 hover:underline"
              >
                Cancel
              </button>
            </div>
          )}

          {canManage && mode === 'create' && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="New nucleus name…"
                className="px-3 py-2 border border-sky-300 rounded-xl text-sm bg-white min-w-[200px]"
                autoFocus
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || busy}
                className="px-4 py-2 bg-sky-700 text-white text-sm font-semibold rounded-xl hover:bg-sky-800 disabled:opacity-50"
              >
                {busy ? 'Creating…' : 'Create nucleus'}
              </button>
              <button
                onClick={() => { setMode('idle'); setError(null); }}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-sky-800 hover:underline"
              >
                Cancel
              </button>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
