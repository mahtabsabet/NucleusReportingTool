import { supabase } from '../supabase';

export interface CourseRow {
  id: string;
  name: string;
  shortName: string;
  order: number;
}

export interface PersonProfile {
  id: string;
  name: string;
  capacities: string[];
  courseEnrollments: Array<{
    courseId: string;
    courseName: string;
    status: 'in_progress' | 'completed';
  }>;
}

export async function fetchCourses(): Promise<CourseRow[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('id, name, short_name, order')
    .eq('is_active', true)
    .order('order');
  if (error) throw error;
  return data.map(c => ({ id: c.id, name: c.name, shortName: c.short_name, order: c.order }));
}

export async function fetchPersonsForCluster(clusterId: string | null): Promise<PersonProfile[]> {
  // If scoped to a cluster, first resolve the person IDs enrolled in that cluster's nuclei
  let personIds: string[] | null = null;
  if (clusterId) {
    const { data, error } = await supabase
      .from('nucleus_enrollments')
      .select('person_id, nuclei!inner(cluster_id)')
      .eq('nuclei.cluster_id', clusterId)
      .is('deleted_at', null);
    if (error) throw error;
    personIds = [...new Set((data as any[]).map(e => e.person_id))];
    if (personIds.length === 0) return [];
  }

  let query = supabase
    .from('persons')
    .select('id, name, capacities, course_enrollments(status, courses(id, name))')
    .is('deleted_at', null)
    .order('name');

  if (personIds) query = query.in('id', personIds);

  const { data, error } = await query;
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
