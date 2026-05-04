import { supabase } from '../supabase';

export interface PersonDetail {
  id: string;
  name: string;
  capacities: string[];
  notes: string;
  nuclei: Array<{ id: string; name: string }>;
  courseEnrollments: Array<{
    courseId: string;
    courseName: string;
    status: 'in_progress' | 'completed';
  }>;
  activities: Array<{
    activityId: string;
    activityName: string;
    nucleusId: string;
    role: string;
  }>;
}

export async function fetchPersonDetail(personId: string): Promise<PersonDetail | null> {
  const [personRes, nucleiRes, coursesRes, activitiesRes] = await Promise.all([
    supabase
      .from('persons')
      .select('id, name, capacities, notes')
      .eq('id', personId)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('nucleus_enrollments')
      .select('nucleus_id, nuclei(id, name)')
      .eq('person_id', personId)
      .is('deleted_at', null),
    supabase
      .from('course_enrollments')
      .select('course_id, status, courses(id, name)')
      .eq('person_id', personId),
    supabase
      .from('activity_participants')
      .select('activity_id, role, activities(id, name, nucleus_id)')
      .eq('person_id', personId)
      .is('deleted_at', null),
  ]);

  if (personRes.error || !personRes.data) return null;
  const p = personRes.data as any;

  return {
    id: p.id,
    name: p.name,
    capacities: p.capacities ?? [],
    notes: p.notes ?? '',
    nuclei: ((nucleiRes.data ?? []) as any[]).map((e: any) => ({
      id: e.nucleus_id,
      name: e.nuclei?.name ?? e.nucleus_id,
    })),
    courseEnrollments: ((coursesRes.data ?? []) as any[]).map((ce: any) => ({
      courseId: ce.course_id,
      courseName: ce.courses?.name ?? ce.course_id,
      status: ce.status as 'in_progress' | 'completed',
    })),
    activities: ((activitiesRes.data ?? []) as any[]).map((ap: any) => ({
      activityId: ap.activity_id,
      activityName: ap.activities?.name ?? ap.activity_id,
      nucleusId: ap.activities?.nucleus_id ?? '',
      role: ap.role,
    })),
  };
}

export async function updatePersonBasic(
  personId: string,
  params: { name?: string; capacities?: string[] }
): Promise<void> {
  const update: Record<string, any> = {};
  if (params.name !== undefined) update.name = params.name;
  if (params.capacities !== undefined) update.capacities = params.capacities;
  const { error } = await supabase.from('persons').update(update).eq('id', personId);
  if (error) throw error;
}

export async function updatePersonNotes(personId: string, notes: string): Promise<void> {
  const { error } = await supabase
    .from('persons')
    .update({ notes: notes || null })
    .eq('id', personId);
  if (error) throw error;
}

export interface EnrollmentDiff {
  idsToDelete: string[];
  toInsert: Array<{ courseId: string; status: 'in_progress' | 'completed' }>;
  toUpdate: Array<{ id: string; courseId: string; newStatus: 'in_progress' | 'completed' }>;
}

export function computeEnrollmentDiff(
  current: Array<{ id: string; course_id: string; status: string }>,
  desired: Array<{ courseId: string; status: 'in_progress' | 'completed' }>
): EnrollmentDiff {
  const currentMap = new Map(current.map(e => [e.course_id, e]));
  const desiredMap = new Map(desired.map(d => [d.courseId, d.status]));

  const idsToDelete = current
    .filter(e => !desiredMap.has(e.course_id))
    .map(e => e.id);

  const toInsert: EnrollmentDiff['toInsert'] = [];
  const toUpdate: EnrollmentDiff['toUpdate'] = [];

  for (const { courseId, status } of desired) {
    const existing = currentMap.get(courseId);
    if (existing) {
      if (existing.status !== status) {
        toUpdate.push({ id: existing.id, courseId, newStatus: status });
      }
    } else {
      toInsert.push({ courseId, status });
    }
  }

  return { idsToDelete, toInsert, toUpdate };
}

export async function searchPersonsByName(
  query: string
): Promise<Array<{ id: string; name: string }>> {
  if (!query.trim()) return [];
  const { data } = await supabase
    .from('persons')
    .select('id, name')
    .ilike('name', `%${query.trim()}%`)
    .is('deleted_at', null)
    .order('name')
    .limit(8);
  return (data ?? []) as Array<{ id: string; name: string }>;
}

export async function canDeletePerson(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  return (profile as any)?.is_admin === true;
}

export async function deletePerson(personId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: person } = await supabase
    .from('persons')
    .select('name')
    .eq('id', personId)
    .single();
  if (!person) throw new Error('Person not found');

  const now = new Date().toISOString();

  // Remove from all activities
  await supabase
    .from('activity_participants')
    .update({ deleted_at: now })
    .eq('person_id', personId)
    .is('deleted_at', null);

  // Clear primary_contact_id references where this person is someone else's contact
  await supabase
    .from('nucleus_enrollments')
    .update({ primary_contact_id: null } as any)
    .eq('primary_contact_id', personId)
    .is('deleted_at', null);

  // Remove nucleus enrollments (engagement level placement)
  const { error: enrollErr } = await supabase
    .from('nucleus_enrollments')
    .update({ deleted_at: now })
    .eq('person_id', personId)
    .is('deleted_at', null);
  if (enrollErr) throw enrollErr;

  // Remove course enrollments (no deleted_at column — hard delete)
  await supabase
    .from('course_enrollments')
    .delete()
    .eq('person_id', personId);

  // Soft-delete the person record
  const { error: personErr } = await supabase
    .from('persons')
    .update({ deleted_at: now })
    .eq('id', personId);
  if (personErr) throw personErr;

  // best-effort audit log — swallow errors so a missing enum value never surfaces
  // as a deletion failure (person_deleted must be in event_log_type_enum on the live DB)
  try {
    await supabase.from('event_log').insert({
      type: 'person_deleted' as any,
      person_id: personId,
      user_id: user.id,
      description: `Deleted person "${(person as any).name}"`,
      details: { personName: (person as any).name },
    });
  } catch {
    // non-critical; deletion already committed
  }
}

export async function syncCourseEnrollments(
  personId: string,
  desired: Array<{ courseId: string; status: 'in_progress' | 'completed' }>
): Promise<void> {
  const { data: current } = await supabase
    .from('course_enrollments')
    .select('id, course_id, status')
    .eq('person_id', personId);

  const { idsToDelete, toInsert, toUpdate } = computeEnrollmentDiff(
    (current ?? []) as Array<{ id: string; course_id: string; status: string }>,
    desired
  );

  if (idsToDelete.length > 0) {
    await supabase.from('course_enrollments').delete().in('id', idsToDelete);
  }

  for (const { id, newStatus } of toUpdate) {
    await supabase
      .from('course_enrollments')
      .update({
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
      })
      .eq('id', id);
  }

  for (const { courseId, status } of toInsert) {
    await supabase.from('course_enrollments').insert({
      person_id: personId,
      course_id: courseId,
      status,
      started_at: new Date().toISOString(),
      completed_at: status === 'completed' ? new Date().toISOString() : null,
    });
  }
}
