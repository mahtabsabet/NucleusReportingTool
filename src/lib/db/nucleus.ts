import { supabase } from '../supabase';
import type {
  Activity,
  ActivityLifecycle,
  ActivitySchedulingMode,
} from '../../types';
import type { PersonProfile, CourseRow } from './clusterProfile';
import { actionPermission, canDirectly } from '../permissions';
import { getCallerContext } from './users';

// Date columns on `activities` are Postgres `date` (calendar date,
// no time zone) — same convention as timeline_events. We parse them
// as local-calendar dates here so they don't shift by ±1 across UTC.
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

const ACTIVITY_BASE_COLUMNS =
  'id, nucleus_id, name, type, schedule_notes, schedule_day_of_week, ' +
  'schedule_days_of_week, schedule_time, schedule_interval_weeks, ' +
  'lifecycle_state, scheduling_mode, start_date, end_date, ' +
  'completed_at, is_active, notes, current_course_id';

// Pre-20260512-migration column set. Used as a fallback for read
// queries so a deployment running the new code against an un-
// migrated database still renders the nucleus dashboard — the
// alternative was a "Nucleus not found" misfire when the wider
// SELECT failed and bubbled all the way up to Promise.all in the
// dashboard loader.
const ACTIVITY_LEGACY_COLUMNS =
  'id, nucleus_id, name, type, schedule_notes, schedule_day_of_week, ' +
  'schedule_time, schedule_interval_weeks, is_active, notes, current_course_id';

// PostgREST returns SQLSTATE 42703 ("undefined_column") when a
// SELECT references a column that isn't in the live schema. We
// match on both the code and the message because PostgREST has
// historically been inconsistent about which it populates.
function isMissingColumnError(err: any): boolean {
  if (!err) return false;
  if (err.code === '42703') return true;
  const msg = String(err.message ?? '');
  return /column .* does not exist/i.test(msg);
}

function mapActivityRow(a: any, participants: Record<string, string[]>): Activity {
  // Tolerate older DBs that haven't run the lifecycle migration yet —
  // is_active still tells us "this is an active activity" in that case.
  const lifecycle = (a.lifecycle_state ?? (a.is_active === false ? 'completed' : 'active')) as ActivityLifecycle;
  const schedulingMode = (a.scheduling_mode ?? 'sporadic_ongoing') as ActivitySchedulingMode;
  // schedule_days_of_week is the canonical array; fall back to the
  // legacy single-day column when the array is empty so old rows
  // continue to render their day-of-week.
  const daysArr: number[] = Array.isArray(a.schedule_days_of_week) ? a.schedule_days_of_week : [];
  const daysOfWeek = daysArr.length > 0
    ? daysArr
    : (typeof a.schedule_day_of_week === 'number' ? [a.schedule_day_of_week] : []);
  return {
    id: a.id,
    nucleusId: a.nucleus_id,
    name: a.name,
    type: (DB_TO_APP_TYPE[a.type] ?? 'other') as Activity['type'],
    participants,
    schedule: a.schedule_notes ?? undefined,
    notes: a.notes ?? undefined,
    currentBook: a.current_course_id ?? undefined,
    lifecycle,
    schedulingMode,
    daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek : undefined,
    time: a.schedule_time ?? undefined,
    intervalWeeks: a.schedule_interval_weeks ?? undefined,
    startDate: a.start_date ? parseLocalDate(a.start_date) : undefined,
    endDate: a.end_date ? parseLocalDate(a.end_date) : undefined,
    completedAt: a.completed_at ? new Date(a.completed_at) : undefined,
  };
}

export type { PersonProfile, CourseRow };

export const DB_TO_APP_TYPE: Record<string, Activity['type']> = {
  children_class: 'children-class',
  junior_youth: 'junior-youth',
  study_circle: 'study-circle',
  devotional: 'devotional',
  fireside: 'other',
  other: 'other',
};

export const APP_TO_DB_TYPE: Record<Activity['type'], string> = {
  'children-class': 'children_class',
  'junior-youth': 'junior_youth',
  'study-circle': 'study_circle',
  devotional: 'devotional',
  other: 'other',
};

export interface NucleusDetail {
  id: string;
  clusterId: string;
  name: string;
  notes: string;
  bannerImageUrl: string | null;
}

export async function fetchNucleus(nucleusId: string): Promise<NucleusDetail | null> {
  const { data, error } = await supabase
    .from('nuclei')
    .select('id, cluster_id, name, notes, banner_image_url')
    .eq('id', nucleusId)
    .is('deleted_at', null)
    .single();
  if (error) return null;
  return {
    id: data.id,
    clusterId: data.cluster_id,
    name: data.name,
    notes: data.notes ?? '',
    bannerImageUrl: data.banner_image_url,
  };
}

// Default lists every activity the user can see in their nucleus —
// including completed and cancelled ones — so the dashboard can
// surface historical activities without a separate query. Callers
// that only want active rows pass { includeInactive: false }.
export async function fetchActivitiesForNucleus(
  nucleusId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<Activity[]> {
  const includeInactive = opts.includeInactive ?? true;
  const run = async (cols: string) => {
    let q = supabase
      .from('activities')
      .select(`${cols}, activity_participants(person_id, role, deleted_at)`)
      .eq('nucleus_id', nucleusId)
      .is('deleted_at', null)
      .order('name');
    if (!includeInactive) q = q.eq('is_active', true);
    return q;
  };

  let { data, error } = await run(ACTIVITY_BASE_COLUMNS);
  if (error && isMissingColumnError(error)) {
    // Migration not yet applied — retry with the columns that
    // existed before 20260512. mapActivityRow tolerates the
    // missing fields via defaults.
    ({ data, error } = await run(ACTIVITY_LEGACY_COLUMNS));
  }
  if (error) throw error;

  return (data as any[]).map(a => {
    const participants: Record<string, string[]> = {};
    (a.activity_participants ?? [])
      .filter((p: any) => !p.deleted_at)
      .forEach((p: any) => {
        if (!participants[p.role]) participants[p.role] = [];
        participants[p.role].push(p.person_id);
      });
    return mapActivityRow(a, participants);
  });
}

export interface CreateActivityParams {
  nucleusId: string;
  name: string;
  type: Activity['type'];
  // Optional initial scheduling info. When provided, the activity is
  // saved in the requested mode and (for structured_recurring /
  // short_duration) an associated nucleus-timeline row is synced so
  // the nucleus timeline doesn't require manual duplicate entry.
  schedulingMode?: ActivitySchedulingMode;
  lifecycle?: ActivityLifecycle;
  schedule?: string;
  daysOfWeek?: number[];
  time?: string;
  intervalWeeks?: number;
  startDate?: Date;
  endDate?: Date;
}

export async function createActivity(params: CreateActivityParams): Promise<Activity> {
  const lifecycle = params.lifecycle ?? 'active';
  const schedulingMode = params.schedulingMode ?? 'sporadic_ongoing';
  const insertRow: Record<string, any> = {
    nucleus_id: params.nucleusId,
    name: params.name,
    type: APP_TO_DB_TYPE[params.type] as any,
    is_active: lifecycle === 'active' || lifecycle === 'planned',
    lifecycle_state: lifecycle,
    scheduling_mode: schedulingMode,
    schedule_notes: params.schedule ?? null,
    schedule_days_of_week: params.daysOfWeek ?? [],
    schedule_day_of_week:
      params.daysOfWeek && params.daysOfWeek.length > 0 ? params.daysOfWeek[0] : null,
    schedule_time: params.time ?? null,
    schedule_interval_weeks: params.intervalWeeks ?? null,
    start_date: params.startDate ? formatLocalDate(params.startDate) : null,
    end_date: params.endDate ? formatLocalDate(params.endDate) : null,
  };
  const { data, error } = await supabase
    .from('activities')
    .insert(insertRow)
    .select(ACTIVITY_BASE_COLUMNS)
    .single();
  if (error) throw error;

  const { data: nucleus } = await supabase
    .from('nuclei')
    .select('cluster_id')
    .eq('id', params.nucleusId)
    .single();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('event_log').insert({
    type: 'activity_created',
    cluster_id: (nucleus as any)?.cluster_id ?? null,
    nucleus_id: (data as any).nucleus_id,
    activity_id: (data as any).id,
    user_id: user?.id ?? null,
    description: `Created activity "${(data as any).name}"`,
    details: { activityName: (data as any).name, activityType: (data as any).type },
  });

  await syncActivityTimelineEntry(mapActivityRow(data, {}), { clusterId: (nucleus as any)?.cluster_id ?? null });

  return mapActivityRow(data, {});
}

export async function updateNucleusNotes(nucleusId: string, notes: string): Promise<void> {
  const { error } = await supabase
    .from('nuclei')
    .update({ notes })
    .eq('id', nucleusId);
  if (error) throw error;
}

export async function renameNucleus(nucleusId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('nuclei')
    .update({ name })
    .eq('id', nucleusId);
  if (error) throw error;
}

// Renaming = network-structure edit. Allowed for cluster coordinators
// (own cluster) and nucleus collaborators (own nucleus); request-only is
// not in the table for renames so we just return a boolean.
export async function canRenameNucleus(nucleusId: string): Promise<boolean> {
  const ctx = await getCallerContext();
  if (!ctx) return false;
  const { data: nucleus } = await supabase
    .from('nuclei')
    .select('cluster_id')
    .eq('id', nucleusId)
    .single();
  if (!nucleus) return false;
  return canDirectly(ctx, 'edit_network_structure', {
    clusterId: (nucleus as any).cluster_id,
    nucleusId,
  });
}

export async function canDeleteNucleus(nucleusId: string): Promise<boolean> {
  const ctx = await getCallerContext();
  if (!ctx) return false;
  const { data: nucleus } = await supabase
    .from('nuclei')
    .select('cluster_id')
    .eq('id', nucleusId)
    .single();
  if (!nucleus) return false;
  return canDirectly(ctx, 'delete_nucleus', {
    clusterId: (nucleus as any).cluster_id,
    nucleusId,
  });
}

export async function deleteNucleus(nucleusId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: nucleus } = await supabase
    .from('nuclei')
    .select('cluster_id, name')
    .eq('id', nucleusId)
    .single();
  if (!nucleus) throw new Error('Nucleus not found');

  const now = new Date().toISOString();

  const { data: activities } = await supabase
    .from('activities')
    .select('id')
    .eq('nucleus_id', nucleusId)
    .is('deleted_at', null);

  if (activities && activities.length > 0) {
    const activityIds = activities.map((a: any) => a.id);
    await supabase
      .from('activity_participants')
      .update({ deleted_at: now })
      .in('activity_id', activityIds)
      .is('deleted_at', null);

    const { error: actErr } = await supabase
      .from('activities')
      .update({ deleted_at: now })
      .in('id', activityIds)
      .is('deleted_at', null);
    if (actErr) throw actErr;
  }

  const { error: enrollErr } = await supabase
    .from('nucleus_enrollments')
    .update({ deleted_at: now })
    .eq('nucleus_id', nucleusId)
    .is('deleted_at', null);
  if (enrollErr) throw enrollErr;

  const { error: nucleusErr } = await supabase
    .from('nuclei')
    .update({ deleted_at: now })
    .eq('id', nucleusId);
  if (nucleusErr) throw nucleusErr;

  await supabase.from('event_log').insert({
    type: 'nucleus_deleted',
    nucleus_id: nucleusId,
    cluster_id: (nucleus as any).cluster_id,
    user_id: user.id,
    description: `Deleted nucleus "${(nucleus as any).name}"`,
    details: { nucleusName: (nucleus as any).name },
  });
}

export interface ActivityDetailResult {
  activity: Activity;
  nucleusName: string;
  personNames: Record<string, string>;
}

export async function fetchActivityDetail(activityId: string): Promise<ActivityDetailResult | null> {
  const run = (cols: string) =>
    supabase
      .from('activities')
      .select(`${cols}, nuclei(name), activity_participants(person_id, role, deleted_at)`)
      .eq('id', activityId)
      .is('deleted_at', null)
      .single();

  let { data, error } = await run(ACTIVITY_BASE_COLUMNS);
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await run(ACTIVITY_LEGACY_COLUMNS));
  }
  if (error) return null;

  const a = data as any;
  const activeParticipants = (a.activity_participants ?? []).filter((p: any) => !p.deleted_at);

  const participants: Record<string, string[]> = {};
  activeParticipants.forEach((p: any) => {
    if (!participants[p.role]) participants[p.role] = [];
    participants[p.role].push(p.person_id);
  });

  const personNames: Record<string, string> = {};
  const allPersonIds = activeParticipants.map((p: any) => p.person_id);
  if (allPersonIds.length > 0) {
    const { data: persons } = await supabase
      .from('persons')
      .select('id, name')
      .in('id', allPersonIds);
    ((persons ?? []) as any[]).forEach((p: any) => { personNames[p.id] = p.name; });
  }

  let currentBook: string | undefined;
  if (a.current_course_id) {
    const { data: course } = await supabase
      .from('courses')
      .select('name')
      .eq('id', a.current_course_id)
      .single();
    currentBook = (course as any)?.name;
  }

  const activity: Activity = {
    ...mapActivityRow(a, participants),
    currentBook,
  };

  return { activity, nucleusName: (a.nuclei as any)?.name ?? '', personNames };
}

export async function addPersonToActivity(params: {
  name: string;
  nucleusId: string;
  activityId: string;
  role: string;
  existingPersonId?: string;
}): Promise<{ personId: string; name: string }> {
  let personId: string;
  let personName: string;

  if (params.existingPersonId) {
    personId = params.existingPersonId;
    personName = params.name;
  } else {
    const { data: person, error } = await supabase
      .from('persons')
      .insert({ name: params.name, is_minor: false })
      .select('id, name')
      .single();
    if (error) throw error;
    const p = person as any;
    personId = p.id;
    personName = p.name;
  }

  const { data: existingEnrollment } = await supabase
    .from('nucleus_enrollments')
    .select('person_id, deleted_at')
    .eq('person_id', personId)
    .eq('nucleus_id', params.nucleusId)
    .maybeSingle();
  const isNewToNucleus = !existingEnrollment || (existingEnrollment as any).deleted_at !== null;

  await supabase
    .from('nucleus_enrollments')
    .upsert(
      { person_id: personId, nucleus_id: params.nucleusId, deleted_at: null },
      { onConflict: 'person_id,nucleus_id' }
    );

  const { data: existingParticipant } = await supabase
    .from('activity_participants')
    .select('activity_id, deleted_at')
    .eq('activity_id', params.activityId)
    .eq('person_id', personId)
    .maybeSingle();
  const isNewParticipant =
    !existingParticipant || (existingParticipant as any).deleted_at !== null;

  await supabase
    .from('activity_participants')
    .upsert(
      { activity_id: params.activityId, person_id: personId, role: params.role as any, deleted_at: null },
      { onConflict: 'activity_id,person_id' }
    );

  if (isNewToNucleus || isNewParticipant) {
    const { data: nucleus } = await supabase
      .from('nuclei')
      .select('cluster_id')
      .eq('id', params.nucleusId)
      .single();
    const clusterId = (nucleus as any)?.cluster_id ?? null;
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    if (isNewToNucleus) {
      await supabase.from('event_log').insert({
        type: 'person_created',
        cluster_id: clusterId,
        nucleus_id: params.nucleusId,
        person_id: personId,
        user_id: userId,
        description: `${personName} joined nucleus`,
        details: { personName },
      });
    }

    if (isNewParticipant) {
      await supabase.from('event_log').insert({
        type: 'participant_added',
        cluster_id: clusterId,
        nucleus_id: params.nucleusId,
        activity_id: params.activityId,
        person_id: personId,
        user_id: userId,
        description: `${personName} added to activity as ${params.role}`,
        details: { personName, role: params.role },
      });
    }
  }

  return { personId, name: personName };
}

export async function removeActivityParticipant(
  activityId: string,
  personId: string,
  role: string
): Promise<void> {
  const { error } = await supabase
    .from('activity_participants')
    .update({ deleted_at: new Date().toISOString() })
    .eq('activity_id', activityId)
    .eq('person_id', personId)
    .eq('role', role as any)
    .is('deleted_at', null);
  if (error) throw error;

  const { data: activity } = await supabase
    .from('activities')
    .select('nucleus_id, nuclei(cluster_id)')
    .eq('id', activityId)
    .single();
  const { data: person } = await supabase
    .from('persons')
    .select('name')
    .eq('id', personId)
    .single();
  const { data: { user } } = await supabase.auth.getUser();
  const personName = (person as any)?.name ?? 'Person';

  await supabase.from('event_log').insert({
    type: 'participant_removed',
    cluster_id: (activity as any)?.nuclei?.cluster_id ?? null,
    nucleus_id: (activity as any)?.nucleus_id ?? null,
    activity_id: activityId,
    person_id: personId,
    user_id: user?.id ?? null,
    description: `${personName} removed from activity (${role})`,
    details: { personName, role },
  });
}

// Returns one of 'direct' | 'request' | 'none'. Activity Leads may
// request deletion of their own activity; CC/NC delete directly.
export async function activityDeletePermission(activityId: string): Promise<'direct' | 'request' | 'none'> {
  const ctx = await getCallerContext();
  if (!ctx) return 'none';
  const { data: activity } = await supabase
    .from('activities')
    .select('nucleus_id, nuclei(cluster_id)')
    .eq('id', activityId)
    .single();
  if (!activity) return 'none';
  return actionPermission(ctx, 'delete_activity', {
    clusterId: (activity as any).nuclei?.cluster_id,
    nucleusId: (activity as any).nucleus_id,
    activityId,
  });
}

// Backwards-compatible boolean helper for existing call sites that only
// care about the direct-delete case.
export async function canDeleteActivity(activityId: string): Promise<boolean> {
  return (await activityDeletePermission(activityId)) === 'direct';
}

export async function canRequestDeleteActivity(activityId: string): Promise<boolean> {
  return (await activityDeletePermission(activityId)) === 'request';
}

export async function deleteActivity(activityId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: activity } = await supabase
    .from('activities')
    .select('name, nucleus_id, nuclei(cluster_id)')
    .eq('id', activityId)
    .single();
  if (!activity) throw new Error('Activity not found');

  const now = new Date().toISOString();

  await supabase
    .from('activity_participants')
    .update({ deleted_at: now })
    .eq('activity_id', activityId)
    .is('deleted_at', null);

  // Tear down the derived timeline_events row (best-effort; the
  // outer activity soft-delete is what the caller cares about).
  await supabase.from('timeline_events').delete().eq('activity_id', activityId);

  const { error } = await supabase
    .from('activities')
    .update({ deleted_at: now })
    .eq('id', activityId);
  if (error) throw error;

  await supabase.from('event_log').insert({
    type: 'activity_deleted',
    activity_id: activityId,
    nucleus_id: (activity as any).nucleus_id,
    cluster_id: (activity as any).nuclei?.cluster_id,
    user_id: user.id,
    description: `Deleted activity "${(activity as any).name}"`,
    details: { activityName: (activity as any).name },
  });
}

export interface UpdateActivityDetailsParams {
  scheduleNotes?: string;
  notes?: string;
  schedulingMode?: ActivitySchedulingMode;
  daysOfWeek?: number[] | null;
  time?: string | null;
  intervalWeeks?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
}

export async function updateActivityDetails(
  activityId: string,
  params: UpdateActivityDetailsParams,
): Promise<void> {
  const update: Record<string, any> = {};
  if (params.scheduleNotes !== undefined) update.schedule_notes = params.scheduleNotes || null;
  if (params.notes !== undefined) update.notes = params.notes || null;
  if (params.schedulingMode !== undefined) update.scheduling_mode = params.schedulingMode;
  if (params.daysOfWeek !== undefined) {
    const arr = params.daysOfWeek ?? [];
    update.schedule_days_of_week = arr;
    update.schedule_day_of_week = arr.length > 0 ? arr[0] : null;
  }
  if (params.time !== undefined) update.schedule_time = params.time;
  if (params.intervalWeeks !== undefined) update.schedule_interval_weeks = params.intervalWeeks;
  if (params.startDate !== undefined) update.start_date = params.startDate ? formatLocalDate(params.startDate) : null;
  if (params.endDate !== undefined) update.end_date = params.endDate ? formatLocalDate(params.endDate) : null;
  if (Object.keys(update).length === 0) return;

  const { data, error } = await supabase
    .from('activities')
    .update(update)
    .eq('id', activityId)
    .select(`${ACTIVITY_BASE_COLUMNS}, nuclei(cluster_id)`)
    .single();
  if (error) throw error;

  await syncActivityTimelineEntry(
    mapActivityRow(data, {}),
    { clusterId: ((data as any).nuclei as any)?.cluster_id ?? null },
  );
}

// Transition the activity's lifecycle. Completed and cancelled
// activities are PRESERVED in place (not soft-deleted) so the
// dashboard, reports, and growth charts can still surface them
// historically — the user simply sees them in a "Completed" /
// "Cancelled" group rather than the active list.
export async function setActivityLifecycle(
  activityId: string,
  lifecycle: ActivityLifecycle,
): Promise<void> {
  const update: Record<string, any> = {
    lifecycle_state: lifecycle,
    is_active: lifecycle === 'active' || lifecycle === 'planned',
  };
  if (lifecycle === 'completed' || lifecycle === 'cancelled') {
    update.completed_at = new Date().toISOString();
    // For short-duration activities being marked completed early or
    // late, snap end_date to today so the historical bar on the
    // timeline reflects when the activity actually ended.
    const { data: existing } = await supabase
      .from('activities')
      .select('scheduling_mode, end_date')
      .eq('id', activityId)
      .single();
    const mode = (existing as any)?.scheduling_mode;
    const existingEnd = (existing as any)?.end_date;
    if (mode !== 'sporadic_ongoing' && !existingEnd) {
      update.end_date = formatLocalDate(new Date());
    }
  } else {
    update.completed_at = null;
  }

  const { data, error } = await supabase
    .from('activities')
    .update(update)
    .eq('id', activityId)
    .select(`${ACTIVITY_BASE_COLUMNS}, nuclei(cluster_id)`)
    .single();
  if (error) throw error;

  await syncActivityTimelineEntry(
    mapActivityRow(data, {}),
    { clusterId: ((data as any).nuclei as any)?.cluster_id ?? null },
  );
}

// Mirror short-duration activities into a single timeline_events row
// tagged with this activity_id. Structured-recurring activities are
// NOT persisted as timeline rows — the nucleus timeline view
// synthesizes one marker per occurrence at render time from the
// activity's daysOfWeek + intervalWeeks, so a weekly study circle
// shows every Tuesday rather than a lone marker on its start date.
//
// Rules:
//   • short_duration AND start_date set                         → upsert (event bar)
//   • structured_recurring                                       → never persist (and clean up any
//                                                                  stale row from earlier saves)
//   • sporadic_ongoing                                           → delete the row (no auto-entry)
//   • lifecycle = 'cancelled'                                    → delete the row
//
// We never touch user-edited timeline rows — only those that were
// originally generated from this activity (i.e. the unique row with
// activity_id = this activity's id).
export async function syncActivityTimelineEntry(
  activity: Activity,
  ctx: { clusterId: string | null },
): Promise<void> {
  // Look up the existing derived row (at most one per activity).
  const { data: existing } = await supabase
    .from('timeline_events')
    .select('id, start_date, end_date, name, item_type')
    .eq('activity_id', activity.id)
    .maybeSingle();

  const shouldExist =
    activity.lifecycle !== 'cancelled'
    && activity.schedulingMode === 'short_duration'
    && !!activity.startDate;

  if (!shouldExist) {
    if (existing) {
      await supabase.from('timeline_events').delete().eq('id', (existing as any).id);
    }
    return;
  }

  // Short-duration bar: explicit start/end (or completedAt fallback
  // for an activity finished without an explicit end_date).
  const startDate = activity.startDate!;
  let endDate: Date | null = activity.endDate ?? null;
  if (activity.lifecycle === 'completed' && !endDate) {
    endDate = activity.completedAt ?? new Date();
  }

  const row: Record<string, any> = {
    name: activity.name,
    start_date: formatLocalDate(startDate),
    end_date: endDate ? formatLocalDate(endDate) : null,
    item_type: 'event',
    cluster_id: ctx.clusterId,
    nucleus_id: activity.nucleusId,
    activity_id: activity.id,
  };

  if (existing) {
    await supabase
      .from('timeline_events')
      .update(row)
      .eq('id', (existing as any).id);
  } else {
    await supabase.from('timeline_events').insert(row);
  }
}

export interface NucleusEnrollmentEntry {
  personId: string;
  name: string;
  engagementLevel: 'aware' | 'participating' | 'supporting' | 'coordinating' | null;
  primaryContactId: string | null;
  photoUrl: string | null;
}

export async function fetchNucleusEnrollmentsWithNames(nucleusId: string): Promise<NucleusEnrollmentEntry[]> {
  // Fetch enrollments first; try with primary_contact_id, fall back without it
  const { data: withContact, error: e1 } = await supabase
    .from('nucleus_enrollments')
    .select('person_id, engagement_level, primary_contact_id')
    .eq('nucleus_id', nucleusId)
    .is('deleted_at', null);

  let rows: any[];
  if (!e1) {
    rows = withContact ?? [];
  } else {
    const { data, error: e2 } = await supabase
      .from('nucleus_enrollments')
      .select('person_id, engagement_level')
      .eq('nucleus_id', nucleusId)
      .is('deleted_at', null);
    if (e2) throw e2;
    rows = data ?? [];
  }

  if (rows.length === 0) return [];

  // Fetch person names and photos in a separate query — avoids PostgREST FK-join ambiguity.
  // Fall back to name-only if profile_image_url column hasn't been added to the live DB yet.
  const personIds = rows.map((e: any) => e.person_id);
  const { data: persons, error: personsErr } = await supabase
    .from('persons')
    .select('id, name, profile_image_url')
    .in('id', personIds);
  const personData = personsErr
    ? ((await supabase.from('persons').select('id, name').in('id', personIds)).data ?? [])
    : (persons ?? []);
  const nameMap = Object.fromEntries(((personData) as any[]).map(p => [p.id, p.name]));
  const photoMap = Object.fromEntries(((personData) as any[]).map(p => [p.id, (p as any).profile_image_url ?? null]));

  return rows.map((e: any) => ({
    personId: e.person_id,
    name: nameMap[e.person_id] ?? e.person_id,
    engagementLevel: (e.engagement_level ?? null) as NucleusEnrollmentEntry['engagementLevel'],
    primaryContactId: (e.primary_contact_id ?? null) as string | null,
    photoUrl: photoMap[e.person_id] ?? null,
  }));
}

export async function updatePrimaryContact(
  personId: string,
  nucleusId: string,
  primaryContactId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('nucleus_enrollments')
    .update({ primary_contact_id: primaryContactId } as any)
    .eq('person_id', personId)
    .eq('nucleus_id', nucleusId)
    .is('deleted_at', null);
  if (error) throw error;
}

export async function updateEngagementLevel(
  personId: string,
  nucleusId: string,
  level: NucleusEnrollmentEntry['engagementLevel']
): Promise<void> {
  const { data: prior } = await supabase
    .from('nucleus_enrollments')
    .select('engagement_level')
    .eq('person_id', personId)
    .eq('nucleus_id', nucleusId)
    .is('deleted_at', null)
    .maybeSingle();
  const previousLevel = (prior as any)?.engagement_level ?? null;

  const { error } = await supabase
    .from('nucleus_enrollments')
    .update({ engagement_level: level })
    .eq('person_id', personId)
    .eq('nucleus_id', nucleusId)
    .is('deleted_at', null);
  if (error) throw error;

  if (previousLevel === level) return;

  const { data: nucleus } = await supabase
    .from('nuclei')
    .select('cluster_id')
    .eq('id', nucleusId)
    .single();
  const { data: person } = await supabase
    .from('persons')
    .select('name')
    .eq('id', personId)
    .single();
  const { data: { user } } = await supabase.auth.getUser();
  const personName = (person as any)?.name ?? 'Person';

  await supabase.from('event_log').insert({
    type: 'circle_movement',
    cluster_id: (nucleus as any)?.cluster_id ?? null,
    nucleus_id: nucleusId,
    person_id: personId,
    user_id: user?.id ?? null,
    description: `${personName} moved from ${previousLevel ?? 'none'} to ${level ?? 'none'}`,
    details: { personName, from: previousLevel, to: level },
  });
}

export async function fetchPersonsForNucleus(nucleusId: string): Promise<PersonProfile[]> {
  const { data: enrollments, error: enrollError } = await supabase
    .from('nucleus_enrollments')
    .select('person_id')
    .eq('nucleus_id', nucleusId)
    .is('deleted_at', null);
  if (enrollError) throw enrollError;

  const personIds = enrollments.map(e => e.person_id);
  if (personIds.length === 0) return [];

  const { data, error } = await supabase
    .from('persons')
    .select('id, name, capacities, course_enrollments(status, courses(id, name))')
    .in('id', personIds)
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;

  return (data as any[]).map(p => ({
    id: p.id,
    name: p.name,
    capacities: p.capacities ?? [],
    courseEnrollments: (p.course_enrollments ?? []).map((ce: any) => ({
      courseId: ce.courses?.id ?? '',
      courseName: ce.courses?.name ?? '',
      status: ce.status as 'in_progress' | 'completed',
    })),
  }));
}
