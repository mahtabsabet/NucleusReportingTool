import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeftIcon,
  UserPlusIcon,
  SearchIcon,
  XIcon,
  CheckIcon,
  UsersIcon,
  Loader2Icon,
} from 'lucide-react';
import { getCallerContext } from '../lib/db/users';
import {
  canDirectly,
  coordinatorClusterIds,
  lsaMemberClusterIds,
  type CallerContext,
} from '../lib/permissions';
import { fetchClusters, fetchNuclei } from '../lib/db/clusters';
import type { ClusterRow, NucleusRow } from '../lib/db/clusters';
import {
  fetchClusterPeople,
  createPerson,
  bulkSetReligiousStatus,
  bulkSetClusterAffiliation,
  searchPersonsByName,
  type ClusterPerson,
  type PersonSearchMatch,
} from '../lib/db/persons';
import { setPersonClusterNuclei } from '../lib/db/nucleus';
import { AGE_GROUP_LABELS } from '../lib/persons/disambiguators';
import type { AgeGroup, ReligiousStatus } from '../lib/database.types';

const FAITH_OPTIONS: Array<{ value: ReligiousStatus; label: string }> = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'bahai', label: "Bahá'í" },
  { value: 'friend', label: 'Friend of the Faith' },
];

const AGE_OPTIONS: AgeGroup[] = ['child', 'junior_youth', 'youth', 'adult', 'unknown'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

// Supabase/PostgREST errors are plain objects ({ message, details, hint, code }),
// not Error instances — so `e.message` via `instanceof Error` drops the real
// reason. Pull out the message (and code, e.g. 42501 for an RLS denial) so the
// UI shows something actionable instead of a generic "failed".
function errText(e: unknown): string {
  if (e && typeof e === 'object') {
    const any = e as any;
    const msg = any.message ?? any.error_description ?? any.error;
    if (msg) {
      const extra = [any.code, any.details, any.hint].filter(Boolean).join(' · ');
      return extra ? `${msg} (${extra})` : String(msg);
    }
  }
  return e instanceof Error ? e.message : 'Unexpected error';
}

function FaithBadge({ status }: { status: ReligiousStatus }) {
  if (status === 'bahai') {
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Bahá'í</span>;
  }
  if (status === 'friend') {
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Friend of the Faith</span>;
  }
  return null;
}

export function ClusterPeople() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const clusterParam = params.get('cluster');

  const [ctx, setCtx] = useState<CallerContext | null>(null);
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(clusterParam);
  const [people, setPeople] = useState<ClusterPerson[]>([]);
  const [clusterNuclei, setClusterNuclei] = useState<NucleusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Modal state.
  const [addOpen, setAddOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<ClusterPerson | null>(null);

  // Which clusters the signed-in user may pick from. Admins / Super Admins /
  // Regional viewers see every cluster; Cluster Coordinators and LSA members
  // see the clusters they're granted.
  const accessibleClusters = useMemo(() => {
    if (!ctx) return [];
    if (ctx.isAdmin || ctx.isSuperAdmin || ctx.isRegionalViewer) return clusters;
    const allowed = new Set([...coordinatorClusterIds(ctx), ...lsaMemberClusterIds(ctx)]);
    return clusters.filter(c => allowed.has(c.id));
  }, [ctx, clusters]);

  // Editing (add / bulk-tag / reassign / assign nuclei) is gated to the same
  // roles RLS allows: Admins, Super Admins, and the cluster's Coordinator.
  // Regional viewers and LSA members get a read-only roster.
  const canEdit = useMemo(
    () => !!ctx && !!selectedCluster && canDirectly(ctx, 'edit_person', { clusterId: selectedCluster }),
    [ctx, selectedCluster],
  );

  const clusterName = useMemo(
    () => clusters.find(c => c.id === selectedCluster)?.name ?? '',
    [clusters, selectedCluster],
  );

  // Bootstrap: caller context + cluster list.
  useEffect(() => {
    Promise.all([getCallerContext(), fetchClusters()]).then(([c, cl]) => {
      setCtx(c);
      setClusters(cl);
    });
  }, []);

  // Default the selected cluster once we know which ones the user can access.
  useEffect(() => {
    if (selectedCluster || accessibleClusters.length === 0) return;
    if (clusterParam && accessibleClusters.some(c => c.id === clusterParam)) {
      setSelectedCluster(clusterParam);
    } else if (accessibleClusters.length === 1) {
      setSelectedCluster(accessibleClusters[0].id);
    }
  }, [accessibleClusters, clusterParam, selectedCluster]);

  const reload = async (clusterId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [ppl, nuc] = await Promise.all([
        fetchClusterPeople(clusterId),
        fetchNuclei(clusterId),
      ]);
      setPeople(ppl);
      setClusterNuclei(nuc);
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Failed to load cluster people:', err);
      setError(errText(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedCluster) {
      setLoading(false);
      return;
    }
    reload(selectedCluster);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCluster]);

  const onPickCluster = (id: string) => {
    setSelectedCluster(id);
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('cluster', id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter(p => p.name.toLowerCase().includes(q));
  }, [people, search]);

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id));
  const toggleAll = () => {
    setSelectedIds(prev => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        filtered.forEach(p => next.delete(p.id));
        return next;
      }
      return new Set([...prev, ...filtered.map(p => p.id)]);
    });
  };

  const applyBulkFaith = async (status: ReligiousStatus) => {
    if (!selectedCluster || selectedIds.size === 0) return;
    try {
      await bulkSetReligiousStatus([...selectedIds], status);
      await reload(selectedCluster);
    } catch (err) {
      console.error('Bulk faith tagging failed:', err);
      setError(errText(err));
    }
  };

  const applyBulkReassign = async (targetClusterId: string) => {
    if (!selectedCluster || selectedIds.size === 0) return;
    try {
      await bulkSetClusterAffiliation([...selectedIds], targetClusterId);
      await reload(selectedCluster);
    } catch (err) {
      console.error('Bulk cluster reassign failed:', err);
      setError(errText(err));
    }
  };

  // Reuse an existing person surfaced as a possible duplicate in the add dialog
  // instead of creating a new profile. If they're already on this cluster's
  // roster we hand the live ClusterPerson (with its current nuclei) to the
  // assign modal; otherwise we build a minimal one so it starts unchecked.
  const assignExistingFromAdd = (match: PersonSearchMatch) => {
    setAddOpen(false);
    const onRoster = people.find(p => p.id === match.id);
    setAssignTarget(onRoster ?? {
      id: match.id,
      name: match.name,
      ageGroup: match.ageGroup,
      isMinor: match.isMinor,
      profileStatus: match.profileStatus,
      religiousStatus: 'unknown',
      clusterId: null,
      photoUrl: null,
      nuclei: [],
    });
  };

  const openProfileFromAdd = (personId: string) => {
    setAddOpen(false);
    navigate(`/individual/${personId}`);
  };

  // ----- render -----

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(selectedCluster ? `/?cluster=${selectedCluster}` : '/')}
            className="p-2 rounded-lg hover:bg-stone-200 text-stone-600"
            aria-label="Back"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <UsersIcon className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-stone-900">People</h1>
              {clusterName && <p className="text-sm text-stone-500">{clusterName}</p>}
            </div>
          </div>
        </div>

        {/* Cluster picker (only when the user can reach more than one) */}
        {accessibleClusters.length > 1 && (
          <div className="mb-4">
            <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1">
              Cluster
            </label>
            <select
              value={selectedCluster ?? ''}
              onChange={e => onPickCluster(e.target.value)}
              className="w-full sm:w-72 px-3 py-2 text-sm border border-stone-300 rounded-lg bg-white"
            >
              <option value="" disabled>Select a cluster…</option>
              {accessibleClusters.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {!selectedCluster ? (
          <div className="text-center text-stone-500 py-16">
            {accessibleClusters.length === 0
              ? 'You don’t have access to any clusters.'
              : 'Select a cluster to see its people.'}
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <div className="relative flex-1">
                <SearchIcon className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name…"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-stone-300 rounded-lg bg-white"
                />
              </div>
              {canEdit && (
                <button
                  onClick={() => setAddOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                >
                  <UserPlusIcon className="w-4 h-4" /> Add person
                </button>
              )}
            </div>

            {!canEdit && (
              <p className="text-xs text-stone-500 bg-stone-100 border border-stone-200 rounded-md px-3 py-2 mb-4">
                You have view-only access to this cluster’s people.
              </p>
            )}

            {error && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">
                {error}
              </p>
            )}

            {/* Bulk action bar */}
            {canEdit && selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200">
                <span className="text-sm font-semibold text-blue-900">{selectedIds.size} selected</span>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-stone-600">Enrolled?</label>
                  <select
                    value=""
                    onChange={e => { if (e.target.value) applyBulkFaith(e.target.value as ReligiousStatus); e.currentTarget.value = ''; }}
                    className="px-2 py-1.5 text-sm border border-stone-300 rounded-lg bg-white"
                  >
                    <option value="" disabled>Choose…</option>
                    {FAITH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {accessibleClusters.length > 1 && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-stone-600">Reassign to:</label>
                    <select
                      value=""
                      onChange={e => { if (e.target.value) applyBulkReassign(e.target.value); e.currentTarget.value = ''; }}
                      className="px-2 py-1.5 text-sm border border-stone-300 rounded-lg bg-white"
                    >
                      <option value="" disabled>Cluster…</option>
                      {accessibleClusters.filter(c => c.id !== selectedCluster).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-stone-500 hover:text-stone-700 ml-auto"
                >
                  Clear
                </button>
              </div>
            )}

            {/* List */}
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2Icon className="w-6 h-6 text-stone-400 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-stone-500 py-16">
                {people.length === 0 ? 'No people in this cluster yet.' : 'No matches.'}
              </div>
            ) : (
              <div className="space-y-2">
                {canEdit && (
                  <label className="flex items-center gap-2 px-2 text-xs text-stone-500 cursor-pointer select-none">
                    <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} className="rounded" />
                    Select all ({filtered.length})
                  </label>
                )}
                {filtered.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-3 hover:shadow-sm transition-shadow"
                  >
                    {canEdit && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        className="rounded flex-shrink-0"
                        aria-label={`Select ${p.name}`}
                      />
                    )}
                    <button
                      onClick={() => navigate(`/individual/${p.id}`)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-stone-200 to-stone-300 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {p.photoUrl
                          ? <img src={p.photoUrl} alt="" className="w-full h-full object-cover" />
                          : <span className="text-sm font-semibold text-stone-600">{initials(p.name)}</span>}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-stone-900 truncate">{p.name}</span>
                          <FaithBadge status={p.religiousStatus} />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-xs text-stone-500 mt-0.5">
                          <span>{AGE_GROUP_LABELS[p.ageGroup] || 'Unknown'}</span>
                          {p.profileStatus === 'provisional' && <span className="text-amber-600">Provisional</span>}
                          {p.nuclei.map(n => (
                            <span key={n.id} className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">{n.name}</span>
                          ))}
                        </div>
                      </div>
                    </button>
                    {canEdit && (
                      <button
                        onClick={() => setAssignTarget(p)}
                        className="flex-shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50"
                      >
                        Nuclei
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {addOpen && selectedCluster && (
        <AddPersonModal
          clusterId={selectedCluster}
          nuclei={clusterNuclei}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); reload(selectedCluster); }}
          onOpenProfile={openProfileFromAdd}
          onAssignExisting={assignExistingFromAdd}
        />
      )}

      {assignTarget && selectedCluster && (
        <AssignNucleiModal
          person={assignTarget}
          clusterId={selectedCluster}
          nuclei={clusterNuclei}
          onClose={() => setAssignTarget(null)}
          onSaved={() => { setAssignTarget(null); reload(selectedCluster); }}
        />
      )}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-stone-900">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-stone-100 text-stone-500">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddPersonModal({
  clusterId, nuclei, onClose, onSaved, onOpenProfile, onAssignExisting,
}: {
  clusterId: string;
  nuclei: NucleusRow[];
  onClose: () => void;
  onSaved: () => void;
  onOpenProfile: (personId: string) => void;
  onAssignExisting: (match: PersonSearchMatch) => void;
}) {
  const [name, setName] = useState('');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('adult');
  const [faith, setFaith] = useState<ReligiousStatus>('unknown');
  const [firstNucleus, setFirstNucleus] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Possible-duplicate detection: as they type a name we surface existing
  // people so they can reuse a profile instead of creating a duplicate.
  const [matches, setMatches] = useState<PersonSearchMatch[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = name.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (trimmed.length < 2) {
      setMatches([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        setMatches(await searchPersonsByName(trimmed, { limit: 6 }));
      } catch {
        // A failed lookup shouldn't block adding a person — just hide hints.
        setMatches([]);
      }
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [name]);

  const hasMatches = matches.length > 0;

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const created = await createPerson({
        name: name.trim(),
        ageGroup,
        religiousStatus: faith,
        clusterId,
        profileStatus: 'confirmed',
      });
      // Optional first nucleus — they can add more later from the roster.
      if (firstNucleus) {
        await setPersonClusterNuclei(created.id, clusterId, [firstNucleus]);
      }
      onSaved();
    } catch (e) {
      console.error('Create person failed:', e);
      setErr(errText(e));
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Add person to cluster" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider mb-1">Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            placeholder="Full name"
          />
        </div>

        {hasMatches && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
            <p className="text-xs font-semibold text-amber-800 mb-1.5">
              {matches.length === 1 ? 'A person with a similar name already exists' : 'People with similar names already exist'}
            </p>
            <ul className="space-y-1.5">
              {matches.map(m => {
                const detail = m.disambiguators.length > 0
                  ? m.disambiguators.join(' • ')
                  : AGE_GROUP_LABELS[m.ageGroup] || 'Unknown';
                return (
                  <li
                    key={m.id}
                    className="flex items-center gap-2 rounded-md bg-white border border-amber-100 px-2.5 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-stone-900 truncate">{m.name}</div>
                      <div className="text-[11px] text-stone-500 truncate">{detail}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenProfile(m.id)}
                      className="flex-shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800 px-1.5 py-1 rounded hover:bg-blue-50"
                    >
                      Open profile
                    </button>
                    <button
                      type="button"
                      onClick={() => onAssignExisting(m)}
                      className="flex-shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800 px-1.5 py-1 rounded hover:bg-blue-50"
                    >
                      Assign nucleus
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-amber-700 mt-1.5">
              Reuse one of these to avoid a duplicate, or add a new person below.
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider mb-1">Age group</label>
          <select value={ageGroup} onChange={e => setAgeGroup(e.target.value as AgeGroup)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg bg-white">
            {AGE_OPTIONS.map(a => <option key={a} value={a}>{AGE_GROUP_LABELS[a] || a}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider mb-1">Relationship to the Faith</label>
          <select value={faith} onChange={e => setFaith(e.target.value as ReligiousStatus)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg bg-white">
            {FAITH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider mb-1">Assign first nucleus?</label>
          <select value={firstNucleus} onChange={e => setFirstNucleus(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg bg-white">
            <option value="">None — assign later (optional)</option>
            {nuclei.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
          <p className="text-xs text-stone-400 mt-1">Optional. You can add this person to more nuclei later from the roster.</p>
        </div>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-stone-600 hover:bg-stone-100">Cancel</button>
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Adding…' : hasMatches ? 'Add as new person anyway' : 'Add person'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function AssignNucleiModal({
  person, clusterId, nuclei, onClose, onSaved,
}: {
  person: ClusterPerson;
  clusterId: string;
  nuclei: NucleusRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set(person.nuclei.map(n => n.id)));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (id: string) => setChecked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await setPersonClusterNuclei(person.id, clusterId, [...checked]);
      onSaved();
    } catch (e) {
      console.error('Assign nuclei failed:', e);
      setErr(errText(e));
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`Nuclei for ${person.name}`} onClose={onClose}>
      <p className="text-xs text-stone-500 mb-3">
        A person added to a nucleus here appears in that nucleus’s concentric circles, even without joining an activity.
      </p>
      {nuclei.length === 0 ? (
        <p className="text-sm text-stone-500">This cluster has no nuclei yet.</p>
      ) : (
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {nuclei.map(n => (
            <label key={n.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-stone-50 cursor-pointer">
              <input type="checkbox" checked={checked.has(n.id)} onChange={() => toggle(n.id)} className="rounded" />
              <span className="text-sm text-stone-800">{n.name}</span>
              {checked.has(n.id) && <CheckIcon className="w-4 h-4 text-blue-600 ml-auto" />}
            </label>
          ))}
        </div>
      )}
      {err && <p className="text-sm text-red-700 mt-2">{err}</p>}
      <div className="flex justify-end gap-2 pt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-stone-600 hover:bg-stone-100">Cancel</button>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </ModalShell>
  );
}
