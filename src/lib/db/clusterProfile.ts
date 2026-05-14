import { supabase } from '../supabase';
import type {
  Course,
  CourseUnit,
  CompletionStatus,
  CurriculumStream,
} from '../curriculum';

export type { Course, CourseUnit, CompletionStatus, CurriculumStream };

// Back-compat alias: dashboards consume the flat course shape.
export type CourseRow = Course;

export interface PersonProfile {
  id: string;
  name: string;
  capacities: string[];
  courseEnrollments: Array<{
    courseId: string;
    courseName: string;
    status: CompletionStatus;
  }>;
}

// Fetches the full curriculum catalog as a flat list of courses, each
// carrying its units. Call buildCurriculum() to nest branch courses
// and group by stream for display.
export async function fetchCourses(): Promise<Course[]> {
  const [coursesRes, unitsRes] = await Promise.all([
    supabase
      .from('courses')
      .select('id, name, short_name, order, stream, parent_course_id, allows_whole_completion')
      .eq('is_active', true)
      .order('order'),
    supabase
      .from('course_units')
      .select('id, course_id, name, order, is_placeholder')
      .order('order'),
  ]);
  if (coursesRes.error) throw coursesRes.error;
  if (unitsRes.error) throw unitsRes.error;

  const unitsByCourse = new Map<string, CourseUnit[]>();
  for (const u of (unitsRes.data ?? []) as any[]) {
    const arr = unitsByCourse.get(u.course_id) ?? [];
    arr.push({
      id: u.id,
      courseId: u.course_id,
      name: u.name,
      order: u.order,
      isPlaceholder: !!u.is_placeholder,
    });
    unitsByCourse.set(u.course_id, arr);
  }

  return ((coursesRes.data ?? []) as any[]).map(c => ({
    id: c.id,
    name: c.name,
    shortName: c.short_name,
    order: c.order,
    stream: (c.stream ?? 'ruhi_main') as CurriculumStream,
    parentCourseId: c.parent_course_id ?? null,
    allowsWholeCompletion: c.allows_whole_completion ?? true,
    units: (unitsByCourse.get(c.id) ?? []).sort((a, b) => a.order - b.order),
  }));
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
      status: ce.status as CompletionStatus,
    })),
  }));
}
