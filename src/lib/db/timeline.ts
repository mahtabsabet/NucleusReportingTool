import { supabase } from '../supabase';
import type { TimelineCycle, TimelineEvent } from '../../types';

// Date columns in this module are Postgres `date` (calendar date, no time
// zone). We MUST NOT round-trip them through the Date object's UTC view —
// `new Date('2026-05-02')` parses ISO date-only strings as UTC midnight,
// which renders as the previous day in any negative-UTC zone, and
// `Date.toISOString()` shifts a local-midnight Date the other way for
// positive zones. The helpers below treat the wire format as a local
// calendar date in both directions, which is what callers (and the user)
// actually mean when they pick a date.

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

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
    startDate: parseLocalDate(c.start_date),
    endDate: parseLocalDate(c.end_date),
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
    startDate: parseLocalDate(e.start_date),
    endDate: e.end_date ? parseLocalDate(e.end_date) : undefined,
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
  if (startDate) update.start_date = formatLocalDate(startDate);
  if (endDate) update.end_date = formatLocalDate(endDate);
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
      start_date: formatLocalDate(params.startDate),
      end_date: formatLocalDate(params.endDate),
      cluster_id: params.clusterId ?? null,
    })
    .select('id, label, start_date, end_date, cluster_id')
    .single();
  if (error) throw error;
  const c = data as any;
  return {
    id: c.id,
    label: c.label,
    startDate: parseLocalDate(c.start_date),
    endDate: parseLocalDate(c.end_date),
  };
}

export async function addTimelineEvent(params: {
  name: string;
  startDate: Date;
  endDate?: Date;
  clusterId?: string;
  location?: string;
}): Promise<TimelineEvent> {
  const { data, error } = await supabase
    .from('timeline_events')
    .insert({
      name: params.name,
      start_date: formatLocalDate(params.startDate),
      end_date: params.endDate ? formatLocalDate(params.endDate) : null,
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
    startDate: parseLocalDate(e.start_date),
    endDate: e.end_date ? parseLocalDate(e.end_date) : undefined,
    clusterId: e.cluster_id ?? undefined,
    nucleusId: e.nucleus_id ?? undefined,
    location: e.location ?? undefined,
  };
}

export async function updateTimelineEvent(
  id: string,
  params: { name: string; startDate: Date; endDate: Date | null; location: string | null },
): Promise<TimelineEvent> {
  const { data, error } = await supabase
    .from('timeline_events')
    .update({
      name: params.name,
      start_date: formatLocalDate(params.startDate),
      end_date: params.endDate ? formatLocalDate(params.endDate) : null,
      location: params.location,
    })
    .eq('id', id)
    .select('id, name, start_date, end_date, cluster_id, nucleus_id, location')
    .single();
  if (error) throw error;
  const e = data as any;
  return {
    id: e.id,
    name: e.name,
    startDate: parseLocalDate(e.start_date),
    endDate: e.end_date ? parseLocalDate(e.end_date) : undefined,
    clusterId: e.cluster_id ?? undefined,
    nucleusId: e.nucleus_id ?? undefined,
    location: e.location ?? undefined,
  };
}

export async function deleteTimelineEvent(id: string): Promise<void> {
  const { error } = await supabase.from('timeline_events').delete().eq('id', id);
  if (error) throw error;
}
