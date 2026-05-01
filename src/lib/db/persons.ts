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

export async function syncCourseEnrollments(
  personId: string,
  desired: Array<{ courseId: string; status: 'in_progress' | 'completed' }>
): Promise<void> {
  // Fetch current enrollments
  const { data: current } = await supabase
    .from('course_enrollments')
    .select('id, course_id, status')
    .eq('person_id', personId);

  const currentMap = new Map(
    ((current ?? []) as any[]).map((e: any) => [e.course_id, e])
  );
  const desiredMap = new Map(desired.map(d => [d.courseId, d.status]));

  // Delete enrollments no longer desired
  const toDelete = ((current ?? []) as any[])
    .filter((e: any) => !desiredMap.has(e.course_id))
    .map((e: any) => e.id);
  if (toDelete.length > 0) {
    await supabase.from('course_enrollments').delete().in('id', toDelete);
  }

  // Insert or update
  for (const { courseId, status } of desired) {
    const existing = currentMap.get(courseId);
    if (existing) {
      if (existing.status !== status) {
        await supabase
          .from('course_enrollments')
          .update({
            status,
            completed_at: status === 'completed' ? new Date().toISOString() : null,
          })
          .eq('id', existing.id);
      }
    } else {
      await supabase.from('course_enrollments').insert({
        person_id: personId,
        course_id: courseId,
        status,
        started_at: new Date().toISOString(),
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      });
    }
  }
}
