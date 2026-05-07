import { supabase } from '../supabase';
import type { TimelineCycle, TimelineEvent } from '../../types';

// Returns DB-backed cycle overrides for the given cluster. The schema treats
// rows with cluster_id IS NULL as "applies to all clusters", so those are
// always included as a fallback. Callers merge this with the computed
// schedule via buildCycleSchedule (see lib/timeline/cycles.ts) — empty DB
// state must NOT block the timeline from rendering.
export async function fetchTimelineCycles(params: { clusterId?: string } = {}): Promise<TimelineCycle[]> {
  let query = supabase
    .from('timeline_cycles')
    .select('id, label, start_date, end_date, cluster_id')
    .order('start_date');
  if (params.clusterId) {
    query = query.or(`cluster_id.eq.${params.clusterId},cluster_id.is.null`);
  } else {
    query = query.is('cluster_id', null);
  }
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as any[]).map(c => ({
    id: c.id,
    label: c.label,
    startDate: new Date(c.start_date),
    endDate: new Date(c.end_date),
  }));
}

export async function fetchTimelineEvents(params: { clusterId?: string }): Promise<TimelineEvent[]> {
  let query = supabase
    .from('timeline_events')
    .select('id, name, start_date, end_date, cluster_id, nucleus_id, location')
    .order('start_date');
  if (params.clusterId) query = query.eq('cluster_id', params.clusterId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as any[]).map(e => ({
    id: e.id,
    name: e.name,
    startDate: new Date(e.start_date),
    endDate: e.end_date ? new Date(e.end_date) : undefined,
    clusterId: e.cluster_id ?? undefined,
    nucleusId: e.nucleus_id ?? undefined,
    location: e.location ?? undefined,
  }));
}

export async function updateCycleBoundary(
  cycleId: string,
  startDate: Date | undefined,
  endDate: Date | undefined
): Promise<void> {
  const update: Record<string, string> = {};
  if (startDate) update.start_date = startDate.toISOString().split('T')[0];
  if (endDate) update.end_date = endDate.toISOString().split('T')[0];
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase.from('timeline_cycles').update(update).eq('id', cycleId);
  if (error) throw error;
}

// Creates a cluster-scoped override row for a cycle that has only ever
// existed as a computed default. Used the first time an admin edits a
// boundary — subsequent edits go through updateCycleBoundary by id.
export async function insertCycleOverride(params: {
  label: string;
  startDate: Date;
  endDate: Date;
  clusterId?: string | null;
}): Promise<TimelineCycle> {
  const { data, error } = await supabase
    .from('timeline_cycles')
    .insert({
      label: params.label,
      start_date: params.startDate.toISOString().split('T')[0],
      end_date: params.endDate.toISOString().split('T')[0],
      cluster_id: params.clusterId ?? null,
    })
    .select('id, label, start_date, end_date, cluster_id')
    .single();
  if (error) throw error;
  const c = data as any;
  return {
    id: c.id,
    label: c.label,
    startDate: new Date(c.start_date),
    endDate: new Date(c.end_date),
  };
}

export async function addTimelineEvent(params: {
  name: string;
  startDate: Date;
  clusterId?: string;
  location?: string;
}): Promise<TimelineEvent> {
  const { data, error } = await supabase
    .from('timeline_events')
    .insert({
      name: params.name,
      start_date: params.startDate.toISOString().split('T')[0],
      cluster_id: params.clusterId ?? null,
      location: params.location ?? null,
    })
    .select('id, name, start_date, end_date, cluster_id, nucleus_id, location')
    .single();
  if (error) throw error;
  const e = data as any;
  return {
    id: e.id,
    name: e.name,
    startDate: new Date(e.start_date),
    endDate: e.end_date ? new Date(e.end_date) : undefined,
    clusterId: e.cluster_id ?? undefined,
    nucleusId: e.nucleus_id ?? undefined,
    location: e.location ?? undefined,
  };
}
