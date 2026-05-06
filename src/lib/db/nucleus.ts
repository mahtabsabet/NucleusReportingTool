import { supabase } from '../supabase';
import type { Activity } from '../../types';
import type { PersonProfile, CourseRow } from './clusterProfile';

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

export async function fetchActivitiesForNucleus(nucleusId: string): Promise<Activity[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('id, nucleus_id, name, type, schedule_notes, notes, current_course_id, activity_participants(person_id, role, deleted_at)')
    .eq('nucleus_id', nucleusId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;

  return (data as any[]).map(a => {
    const participants: Record<string, string[]> = {};
    (a.activity_participants ?? [])
      .filter((p: any) => !p.deleted_at)
      .forEach((p: any) => {
        if (!participants[p.role]) participants[p.role] = [];
        participants[p.role].push(p.person_id);
      });
    return {
      id: a.id,
      nucleusId: a.nucleus_id,
      name: a.name,
      type: (DB_TO_APP_TYPE[a.type] ?? 'other') as Activity['type'],
      participants,
      schedule: a.schedule_notes ?? undefined,
      notes: a.notes ?? undefined,
      currentBook: a.current_course_id ?? undefined,
    };
  });
}

export async function createActivity(params: {
  nucleusId: string;
  name: string;
  type: Activity['type'];
}): Promise<Activity> {
  const { data, error } = await supabase
    .from('activities')
    .insert({
      nucleus_id: params.nucleusId,
      name: params.name,
      type: APP_TO_DB_TYPE[params.type] as any,
      is_active: true,
    })
    .select('id, nucleus_id, name, type')
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
    nucleus_id: data.nucleus_id,
    activity_id: data.id,
    user_id: user?.id ?? null,
    description: `Created activity "${data.name}"`,
    details: { activityName: data.name, activityType: data.type },
  });

  return {
    id: data.id,
    nucleusId: data.nucleus_id,
    name: data.name,
    type: (DB_TO_APP_TYPE[data.type] ?? 'other') as Activity['type'],
    participants: {},
  };
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

export async function canRenameNucleus(nucleusId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if ((profile as any)?.is_admin) return true;

  const { data: nucleus } = await supabase
    .from('nuclei')
    .select('cluster_id')
    .eq('id', nucleusId)
    .single();
  if (!nucleus) return false;

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('id')
    .eq('user_id', user.id)
    .or(`nucleus_id.eq.${nucleusId},cluster_id.eq.${(nucleus as any).cluster_id}`)
    .in('role', ['nucleus_collaborator', 'cluster_coordinator'])
    .limit(1)
    .maybeSingle();

  return perm !== null;
}

export async function canDeleteNucleus(nucleusId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if ((profile as any)?.is_admin) return true;

  const { data: nucleus } = await supabase
    .from('nuclei')
    .select('cluster_id')
    .eq('id', nucleusId)
    .single();
  if (!nucleus) return false;

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('id')
    .eq('user_id', user.id)
    .eq('cluster_id', (nucleus as any).cluster_id)
    .eq('role', 'cluster_coordinator')
    .limit(1)
    .maybeSingle();

  return perm !== null;
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
  const { data, error } = await supabase
    .from('activities')
    .select('id, nucleus_id, name, type, schedule_notes, notes, current_course_id, nuclei(name), activity_participants(person_id, role, deleted_at)')
    .eq('id', activityId)
    .is('deleted_at', null)
    .single();
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
    id: a.id,
    nucleusId: a.nucleus_id,
    name: a.name,
    type: (DB_TO_APP_TYPE[a.type] ?? 'other') as Activity['type'],
    participants,
    schedule: a.schedule_notes ?? undefined,
    notes: a.notes ?? undefined,
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

export async function canDeleteActivity(activityId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if ((profile as any)?.is_admin) return true;

  const { data: activity } = await supabase
    .from('activities')
    .select('nucleus_id, nuclei(cluster_id)')
    .eq('id', activityId)
    .single();
  if (!activity) return false;

  const nucleusId = (activity as any).nucleus_id;
  const clusterId = (activity as any).nuclei?.cluster_id;

  const { data: perm } = await supabase
    .from('user_permissions')
    .select('id')
    .eq('user_id', user.id)
    .or(`nucleus_id.eq.${nucleusId},cluster_id.eq.${clusterId}`)
    .in('role', ['nucleus_collaborator', 'cluster_coordinator'])
    .limit(1)
    .maybeSingle();

  return perm !== null;
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

export async function updateActivityDetails(
  activityId: string,
  params: { scheduleNotes?: string; notes?: string }
): Promise<void> {
  const update: Record<string, any> = {};
  if (params.scheduleNotes !== undefined) update.schedule_notes = params.scheduleNotes || null;
  if (params.notes !== undefined) update.notes = params.notes || null;
  const { error } = await supabase.from('activities').update(update).eq('id', activityId);
  if (error) throw error;
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

  // Fetch person names and photos in a separate query — avoids PostgREST FK-join ambiguity
  const personIds = rows.map((e: any) => e.person_id);
  const { data: persons } = await supabase.from('persons').select('id, name, profile_image_url').in('id', personIds);
  const nameMap = Object.fromEntries(((persons ?? []) as any[]).map(p => [p.id, p.name]));
  const photoMap = Object.fromEntries(((persons ?? []) as any[]).map(p => [p.id, p.profile_image_url ?? null]));

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
