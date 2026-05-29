import { supabase } from '../supabase';
import { coordinatorClusterIds } from '../permissions';
import { getCallerContext } from './users';

// A capacity as held by a person — always tied to the cluster whose
// catalog it lives in (capacities are scoped per cluster).
export interface PersonCapacity {
  capacityId: string;
  name: string;
  clusterId: string;
  clusterName: string;
}

export interface ClusterCapacity {
  id: string;
  name: string;
}

export interface ClusterCapacityWithCount extends ClusterCapacity {
  /** Number of people in the cluster who currently hold this capacity. */
  count: number;
}

// The distinct clusters a person belongs to, via their (non-deleted)
// nucleus enrollments. This is the set of catalogs whose capacities can
// be recorded on the person's profile.
export async function fetchPersonClusters(
  personId: string,
): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase
    .from('nucleus_enrollments')
    .select('nuclei!inner(cluster_id, clusters!inner(id, name))')
    .eq('person_id', personId)
    .is('deleted_at', null);
  if (error) throw error;

  const byId = new Map<string, string>();
  for (const row of (data ?? []) as any[]) {
    const cluster = row.nuclei?.clusters;
    if (cluster?.id) byId.set(cluster.id, cluster.name ?? cluster.id);
  }
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The full capacity catalog for one cluster (used to populate the
// profile picker's dropdown).
export async function fetchClusterCapacities(clusterId: string): Promise<ClusterCapacity[]> {
  const { data, error } = await supabase
    .from('cluster_capacities')
    .select('id, name')
    .eq('cluster_id', clusterId)
    .order('name');
  if (error) throw error;
  return ((data ?? []) as any[]).map(c => ({ id: c.id, name: c.name }));
}

// Every capacity a person currently holds, across all their clusters.
export async function fetchPersonCapacities(personId: string): Promise<PersonCapacity[]> {
  const { data, error } = await supabase
    .from('person_capacities')
    .select('capacity_id, cluster_capacities!inner(id, name, cluster_id, clusters!inner(name))')
    .eq('person_id', personId);
  if (error) throw error;

  return ((data ?? []) as any[])
    .map(row => {
      const cc = row.cluster_capacities;
      return {
        capacityId: cc.id as string,
        name: cc.name as string,
        clusterId: cc.cluster_id as string,
        clusterName: (cc.clusters?.name ?? cc.cluster_id) as string,
      };
    })
    .sort(
      (a, b) =>
        a.clusterName.localeCompare(b.clusterName) || a.name.localeCompare(b.name),
    );
}

// Capacity names held by each of the given people, optionally narrowed to
// a single cluster's catalog. Used by the nucleus/cluster stats, which
// group people by capacity name. Returns a map keyed by person id.
export async function fetchCapacityNamesByPerson(
  personIds: string[],
  clusterId: string | null,
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (personIds.length === 0) return result;

  let query = supabase
    .from('person_capacities')
    .select('person_id, cluster_capacities!inner(name, cluster_id)')
    .in('person_id', personIds);
  if (clusterId) query = query.eq('cluster_capacities.cluster_id', clusterId);

  const { data, error } = await query;
  if (error) throw error;

  for (const row of (data ?? []) as any[]) {
    const name = row.cluster_capacities?.name;
    if (!name) continue;
    const arr = result.get(row.person_id) ?? [];
    arr.push(name);
    result.set(row.person_id, arr);
  }
  for (const [id, names] of result) {
    result.set(id, names.sort((a, b) => a.localeCompare(b)));
  }
  return result;
}

// Find a cluster's catalog entry by name (case-insensitively), creating
// it if absent. Returns the entry id. Tolerant of a concurrent insert
// racing into the (cluster_id, lower(name)) unique index.
async function findOrCreateCapacity(clusterId: string, rawName: string): Promise<string> {
  const name = rawName.trim();
  if (!name) throw new Error('Capacity name is required.');

  const existing = await fetchClusterCapacities(clusterId);
  const lower = name.toLowerCase();
  const hit = existing.find(c => c.name.toLowerCase() === lower);
  if (hit) return hit.id;

  const { data, error } = await supabase
    .from('cluster_capacities')
    .insert({ cluster_id: clusterId, name })
    .select('id')
    .single();
  if (error) {
    // A concurrent insert may have won the unique index — re-read.
    const again = await fetchClusterCapacities(clusterId);
    const raced = again.find(c => c.name.toLowerCase() === lower);
    if (raced) return raced.id;
    throw error;
  }
  return (data as any).id;
}

// Reconcile a person's full capacity set against the desired list. New
// entries (no capacityId) are resolved to catalog ids first, creating
// the catalog entry in the chosen cluster when needed.
export async function savePersonCapacities(
  personId: string,
  desired: Array<{ capacityId?: string; clusterId: string; name: string }>,
): Promise<void> {
  const desiredIds: string[] = [];
  for (const d of desired) {
    desiredIds.push(d.capacityId ?? (await findOrCreateCapacity(d.clusterId, d.name)));
  }
  const desiredSet = new Set(desiredIds);

  const { data: current, error } = await supabase
    .from('person_capacities')
    .select('capacity_id')
    .eq('person_id', personId);
  if (error) throw error;
  const currentSet = new Set(((current ?? []) as any[]).map(r => r.capacity_id as string));

  const toAdd = [...desiredSet].filter(id => !currentSet.has(id));
  const toRemove = [...currentSet].filter(id => !desiredSet.has(id));

  if (toRemove.length) {
    const { error: delErr } = await supabase
      .from('person_capacities')
      .delete()
      .eq('person_id', personId)
      .in('capacity_id', toRemove);
    if (delErr) throw delErr;
  }
  if (toAdd.length) {
    const { error: insErr } = await supabase
      .from('person_capacities')
      .insert(toAdd.map(capacity_id => ({ person_id: personId, capacity_id })));
    if (insErr) throw insErr;
  }
}

// ── Cluster-stewardship: rename / merge (admins + that cluster's CCs) ──

// Capacities for a cluster with the number of people holding each —
// powers the management panel.
export async function fetchClusterCapacitiesWithCounts(
  clusterId: string,
): Promise<ClusterCapacityWithCount[]> {
  const { data, error } = await supabase
    .from('cluster_capacities')
    .select('id, name, person_capacities(person_id)')
    .eq('cluster_id', clusterId)
    .order('name');
  if (error) throw error;
  return ((data ?? []) as any[]).map(c => ({
    id: c.id,
    name: c.name,
    count: (c.person_capacities ?? []).length,
  }));
}

// Whether the signed-in user may rename/merge capacities for this
// cluster: admins / super admins, or a coordinator of this cluster.
export async function canManageClusterCapacities(clusterId: string): Promise<boolean> {
  const ctx = await getCallerContext();
  if (!ctx) return false;
  return ctx.isAdmin || coordinatorClusterIds(ctx).includes(clusterId);
}

export async function renameCapacity(capacityId: string, newName: string): Promise<void> {
  const name = newName.trim();
  if (!name) throw new Error('Capacity name is required.');
  const { error } = await supabase
    .from('cluster_capacities')
    .update({ name })
    .eq('id', capacityId);
  if (error) {
    // 23505: a different entry in the same cluster already uses this name.
    if ((error as any).code === '23505') {
      throw new Error(
        'Another capacity in this cluster already uses that name. Merge them instead.',
      );
    }
    throw error;
  }
}

// Merge source capacities into a target: everyone holding a source gains
// the target, then the source entries are deleted (cascading their
// person links). All ids must belong to the same cluster — enforced by
// RLS, which pins each row to its cluster_id.
export async function mergeCapacities(targetId: string, sourceIds: string[]): Promise<void> {
  const sources = sourceIds.filter(id => id !== targetId);
  if (sources.length === 0) return;

  const { data: holders, error: holdersErr } = await supabase
    .from('person_capacities')
    .select('person_id')
    .in('capacity_id', sources);
  if (holdersErr) throw holdersErr;

  const personIds = [...new Set(((holders ?? []) as any[]).map(h => h.person_id as string))];
  if (personIds.length) {
    const { error: upsertErr } = await supabase
      .from('person_capacities')
      .upsert(
        personIds.map(person_id => ({ person_id, capacity_id: targetId })),
        { onConflict: 'person_id,capacity_id', ignoreDuplicates: true },
      );
    if (upsertErr) throw upsertErr;
  }

  const { error: delErr } = await supabase
    .from('cluster_capacities')
    .delete()
    .in('id', sources);
  if (delErr) throw delErr;
}
