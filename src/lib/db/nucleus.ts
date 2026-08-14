import { supabase } from '../supabase';
import type {
  Activity,
  ActivityLifecycle,
  ActivitySchedulingMode,
} from '../../types';
import type { PersonProfile, CourseRow, CompletionStatus } from './clusterProfile';
import { actionPermission, canDirectly } from '../permissions';
import { getCallerContext } from './users';
import { fetchCapacityNamesByPerson } from './capacities';
import { isMinorForAgeGroup } from '../persons/disambiguators';
import type { AgeGroup, ActivityParticipantStatusEnum } from '../database.types';

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

export type { PersonProfile, CourseRow, CompletionStatus };

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
  // Participation lifecycle, keyed by person id. Defaults to 'active'
  // for every roster member when the status column isn't present yet.
  participantStatus: Record<string, ActivityParticipantStatusEnum>;
  // last_reviewed_at per person, so the lapsed-participant prompt can
  // snooze after a lead acts on it.
  participantReviewedAt: Record<string, Date | null>;
}

export async function fetchActivityDetail(activityId: string): Promise<ActivityDetailResult | null> {
  const NEW_PART = 'person_id, role, deleted_at, status, last_reviewed_at';
  const OLD_PART = 'person_id, role, deleted_at';
  const run = (cols: string, part: string) =>
    supabase
      .from('activities')
      .select(`${cols}, nuclei(name), activity_participants(${part})`)
      .eq('id', activityId)
      .is('deleted_at', null)
      .single();

  // Two independent back-compat fallbacks: the participation status
  // columns, then the activity lifecycle columns.
  let { data, error } = await run(ACTIVITY_BASE_COLUMNS, NEW_PART);
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await run(ACTIVITY_BASE_COLUMNS, OLD_PART));
  }
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await run(ACTIVITY_LEGACY_COLUMNS, OLD_PART));
  }
  if (error) {
    console.warn('[fetchActivityDetail] activities query failed', { activityId, error });
    return null;
  }

  const a = data as any;
  const rawParticipants = (a.activity_participants ?? []) as any[];
  const activeParticipants = rawParticipants.filter((p: any) => !p.deleted_at);
  if (rawParticipants.length === 0) {
    // Either the activity has no participants, or RLS is hiding them
    // from the caller. The user can tell which by checking the DB; this
    // log makes the path visible from the browser.
    console.warn('[fetchActivityDetail] no activity_participants returned (may be RLS-hidden)', {
      activityId,
    });
  }

  const participants: Record<string, string[]> = {};
  const participantStatus: Record<string, ActivityParticipantStatusEnum> = {};
  const participantReviewedAt: Record<string, Date | null> = {};
  activeParticipants.forEach((p: any) => {
    if (!participants[p.role]) participants[p.role] = [];
    participants[p.role].push(p.person_id);
    participantStatus[p.person_id] = (p.status ?? 'active') as ActivityParticipantStatusEnum;
    participantReviewedAt[p.person_id] = p.last_reviewed_at ? new Date(p.last_reviewed_at) : null;
  });

  const personNames: Record<string, string> = {};
  const allPersonIds = activeParticipants.map((p: any) => p.person_id);
  if (allPersonIds.length > 0) {
    const { data: persons, error: personsError } = await supabase
      .from('persons')
      .select('id, name')
      .in('id', allPersonIds);
    if (personsError) {
      console.warn('[fetchActivityDetail] persons fetch failed', {
        activityId,
        personIds: allPersonIds,
        error: personsError,
      });
    } else if (!persons || persons.length < allPersonIds.length) {
      console.warn('[fetchActivityDetail] persons fetch returned fewer rows than expected (RLS?)', {
        activityId,
        requested: allPersonIds.length,
        returned: persons?.length ?? 0,
      });
    }
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

  return {
    activity,
    nucleusName: (a.nuclei as any)?.name ?? '',
    personNames,
    participantStatus,
    participantReviewedAt,
  };
}

export async function addPersonToActivity(params: {
  name: string;
  nucleusId: string;
  activityId: string;
  role: string;
  existingPersonId?: string;
  ageGroup?: AgeGroup;
  /** Caller's choice for the under-18 toggle; only consulted for youth/unknown. */
  minorOverride?: boolean;
}): Promise<{ personId: string; name: string }> {
  let personId: string;
  let personName: string;

  if (params.existingPersonId) {
    personId = params.existingPersonId;
    personName = params.name;
  } else {
    const ageGroup: AgeGroup = params.ageGroup ?? 'unknown';
    const isMinor = isMinorForAgeGroup(ageGroup, params.minorOverride);
    // A person added directly via an activity is, by definition, no
    // longer a fully-disconnected provisional profile — they have at
    // least one nucleus + activity link by the end of this function.
    // The persons SELECT policy's created_by = auth.uid() branch
    // (migration 20260516_persons_created_by.sql) lets non-admin
    // callers read back the row they just inserted, so the natural
    // .insert(...).select(...).single() pattern works for everyone.
    const { data: inserted, error } = await supabase
      .from('persons')
      .insert({
        name: params.name,
        age_group: ageGroup,
        is_minor: isMinor,
        profile_status: 'confirmed',
      })
      .select('id, name')
      .single();
    if (error) throw error;
    personId = (inserted as any).id;
    personName = (inserted as any).name;
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
      {
        person_id: personId,
        nucleus_id: params.nucleusId,
        deleted_at: null,
        // Only stamp engagement_level on a fresh (or reactivated) row —
        // an existing active enrollment's status must not be touched
        // just because the person joined another activity in the same
        // nucleus. Explicitly nulling it (rather than relying on the
        // DB column default) keeps a person new to THIS nucleus out of
        // whatever circle they may already occupy in a different one.
        ...(isNewToNucleus ? { engagement_level: null } : {}),
      },
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

    // Stamp the person's canonical cluster affiliation if it isn't set
    // yet, so they're counted toward this cluster's growth profile even
    // if they later leave every nucleus/activity. Only fills a blank —
    // never reassigns someone already attributed to a cluster.
    if (clusterId) {
      await supabase
        .from('persons')
        .update({ cluster_id: clusterId })
        .eq('id', personId)
        .is('cluster_id', null);
    }

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

// Flip a participant between 'active' and 'inactive' without removing
// them from the roster. Inactive participants keep their attendance
// history but drop out of the upcoming cluster growth profile. Logged
// to event_log for the same audit trail as removals.
export async function setParticipantStatus(
  activityId: string,
  personId: string,
  status: ActivityParticipantStatusEnum,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('activity_participants')
    .update({
      status,
      status_changed_at: new Date().toISOString(),
      status_changed_by: user?.id ?? null,
      // Acting on the prompt counts as a review, so it snoozes either way.
      last_reviewed_at: new Date().toISOString(),
    })
    .eq('activity_id', activityId)
    .eq('person_id', personId)
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
  const personName = (person as any)?.name ?? 'Person';

  await supabase.from('event_log').insert({
    type: status === 'inactive' ? 'participant_marked_inactive' : 'participant_reactivated',
    cluster_id: (activity as any)?.nuclei?.cluster_id ?? null,
    nucleus_id: (activity as any)?.nucleus_id ?? null,
    activity_id: activityId,
    person_id: personId,
    user_id: user?.id ?? null,
    description: `${personName} marked ${status} in activity`,
    details: { personName, status },
  });
}

// Record that a lead reviewed a lapsed participant and chose to keep
// them. Snoozes the 60-day prompt without changing their status.
export async function markParticipantReviewed(
  activityId: string,
  personId: string,
): Promise<void> {
  const { error } = await supabase
    .from('activity_participants')
    .update({ last_reviewed_at: new Date().toISOString() })
    .eq('activity_id', activityId)
    .eq('person_id', personId)
    .is('deleted_at', null);
  if (error) throw error;
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

// Transition the activity's lifecycle. The activity row is
// PRESERVED in place (not soft-deleted) regardless of which state
// it moves to — completed and cancelled activities continue to
// surface in the dashboard's activity list and in reports as
// historical records. Their timeline presence is what changes:
// syncActivityTimelineEntry below removes any persisted row, and
// the synthesis pass on the nucleus timeline skips them too. The
// schedule fields (daysOfWeek, intervalWeeks, startDate, endDate)
// stay intact so that a deliberate reactivation can restore the
// activity to the calendar exactly as it was.
export async function setActivityLifecycle(
  activityId: string,
  lifecycle: ActivityLifecycle,
): Promise<void> {
  const update: Record<string, any> = {
    lifecycle_state: lifecycle,
    is_active: lifecycle === 'active' || lifecycle === 'planned',
    completed_at:
      lifecycle === 'completed' || lifecycle === 'cancelled'
        ? new Date().toISOString()
        : null,
  };

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
// synthesizes one marker per occurrence at render time. Completed
// and cancelled activities have no timeline presence at all (their
// row is removed) — the timeline is a forward-looking calendar,
// not a historical log.
//
// Rules:
//   • short_duration AND start_date set AND lifecycle ∈ {active, planned}
//                                                              → one row (event bar)
//   • everything else                                            → no row
//
// Implementation is delete-then-conditionally-insert. That handles
// the previously-recurring-now-something-else case correctly even
// if a stale row was written by an older version of this function
// (and even if multiple stale rows accumulated, which an earlier
// version using .maybeSingle() would have failed to clean up).
// We only touch rows we generated ourselves — i.e. those whose
// activity_id matches this activity. User-created timeline rows
// are never affected.
export async function syncActivityTimelineEntry(
  activity: Activity,
  ctx: { clusterId: string | null },
): Promise<void> {
  // 1. Tear down ALL derived rows for this activity. Idempotent —
  //    a no-op when no row exists, and resilient when more than
  //    one accumulated from earlier buggy syncs.
  const { error: delErr } = await supabase
    .from('timeline_events')
    .delete()
    .eq('activity_id', activity.id);
  if (delErr) {
    // Log but don't throw — we still want to attempt the insert
    // when the activity should have an entry. A failure here is
    // usually a transient RLS issue and is recoverable on the
    // next save.
    console.warn(
      'syncActivityTimelineEntry: cleanup failed for activity', activity.id, delErr,
    );
  }

  const isActiveOrPlanned =
    activity.lifecycle === 'active' || activity.lifecycle === 'planned';
  const shouldExist =
    isActiveOrPlanned
    && activity.schedulingMode === 'short_duration'
    && !!activity.startDate;
  if (!shouldExist) return;

  // 2. Insert the fresh row. For an activity that's just been edited
  //    but kept as short-duration + active, this is functionally an
  //    update via the delete-then-insert.
  const startDate = activity.startDate!;
  const endDate = activity.endDate ?? null;

  await supabase.from('timeline_events').insert({
    name: activity.name,
    start_date: formatLocalDate(startDate),
    end_date: endDate ? formatLocalDate(endDate) : null,
    item_type: 'event',
    cluster_id: ctx.clusterId,
    nucleus_id: activity.nucleusId,
    activity_id: activity.id,
  });
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

  // Capacities are scoped per cluster, so the dashboard counts only the
  // entries from this nucleus's own cluster catalog.
  const { data: nucleusRow } = await supabase
    .from('nuclei')
    .select('cluster_id')
    .eq('id', nucleusId)
    .single();
  const clusterId = (nucleusRow as any)?.cluster_id ?? null;

  const [{ data, error }, capacitiesByPerson] = await Promise.all([
    supabase
      .from('persons')
      .select('id, name, course_enrollments(status, courses(id, name))')
      .in('id', personIds)
      .is('deleted_at', null)
      .order('name'),
    fetchCapacityNamesByPerson(personIds, clusterId),
  ]);
  if (error) throw error;

  return (data as any[]).map(p => ({
    id: p.id,
    name: p.name,
    capacities: capacitiesByPerson.get(p.id) ?? [],
    courseEnrollments: (p.course_enrollments ?? []).map((ce: any) => ({
      courseId: ce.courses?.id ?? '',
      courseName: ce.courses?.name ?? '',
      status: ce.status as CompletionStatus,
    })),
  }));
}

// Reconcile a person's nucleus memberships *within a single cluster* to exactly
// `selectedNucleusIds`: enroll them in newly-selected nuclei and soft-delete the
// enrollments they were de-selected from — but only ever touching nuclei that
// belong to `clusterId`, never the person's memberships in other clusters. This
// is the direct (no-activity) path: an enrolled person shows up in that
// nucleus's concentric circles even without joining an activity. The canonical
// `cluster_id` is stamped when still blank, mirroring addPersonToActivity.
export async function setPersonClusterNuclei(
  personId: string,
  clusterId: string,
  selectedNucleusIds: string[],
): Promise<void> {
  const { data: nucleiRows, error: nucleiErr } = await supabase
    .from('nuclei')
    .select('id, name')
    .eq('cluster_id', clusterId)
    .is('deleted_at', null);
  if (nucleiErr) throw nucleiErr;
  const clusterNucleusIds = new Set(((nucleiRows ?? []) as any[]).map(n => n.id));
  const selected = selectedNucleusIds.filter(id => clusterNucleusIds.has(id));
  const selectedSet = new Set(selected);

  const { data: existing, error: existErr } = await supabase
    .from('nucleus_enrollments')
    .select('nucleus_id, deleted_at')
    .eq('person_id', personId)
    .in('nucleus_id', [...clusterNucleusIds]);
  if (existErr) throw existErr;
  const activeNow = new Set(
    ((existing ?? []) as any[]).filter(r => r.deleted_at === null).map(r => r.nucleus_id),
  );

  const toAdd = selected.filter(id => !activeNow.has(id));
  const toRemove = [...activeNow].filter(id => !selectedSet.has(id));

  if (toAdd.length) {
    // Enroll (or revive) in each newly-selected nucleus with a null
    // engagement_level — which the concentric-circles view treats as
    // "unassigned", so a directly-assigned person starts there rather than in
    // the outer "aware" ring. Setting it explicitly also clears any stale level
    // from a prior (since-removed) enrollment. Requires engagement_level to be
    // nullable — see migrations/20260603_enrollment_engagement_nullable.sql.
    const { error: addErr } = await supabase.from('nucleus_enrollments').upsert(
      toAdd.map(nid => ({ person_id: personId, nucleus_id: nid, engagement_level: null, deleted_at: null })),
      { onConflict: 'person_id,nucleus_id' },
    );
    if (addErr) throw addErr;
  }
  if (toRemove.length) {
    const { error: rmErr } = await supabase
      .from('nucleus_enrollments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('person_id', personId)
      .in('nucleus_id', toRemove);
    if (rmErr) throw rmErr;
  }

  // Stamp the canonical affiliation if it's still blank (fills only — never
  // reassigns someone already attributed to a cluster).
  if (selected.length) {
    const { error: stampErr } = await supabase
      .from('persons')
      .update({ cluster_id: clusterId })
      .eq('id', personId)
      .is('cluster_id', null);
    if (stampErr) throw stampErr;
  }

  // Log joins so the analytics match the activity-driven enrollment path.
  if (toAdd.length) {
    const { data: person } = await supabase.from('persons').select('name').eq('id', personId).single();
    const personName = (person as any)?.name ?? '';
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? null;
    const nameById = new Map(((nucleiRows ?? []) as any[]).map(n => [n.id, n.name]));
    for (const nid of toAdd) {
      await supabase.from('event_log').insert({
        type: 'person_created',
        cluster_id: clusterId,
        nucleus_id: nid,
        person_id: personId,
        user_id: userId,
        description: `${personName} joined ${nameById.get(nid) ?? 'nucleus'}`,
        details: { personName, source: 'cluster_people' },
      });
    }
  }
}
