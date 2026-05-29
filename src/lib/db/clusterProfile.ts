import { supabase } from '../supabase';
import { fetchCapacityNamesByPerson } from './capacities';
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

// PostgREST reports a missing column as 42703 and a missing table as
// 42P01 (it also varies the message wording). A database that hasn't
// run the curriculum migration yet lacks the new course columns and
// the course_units table — we tolerate that and render a degraded
// catalog rather than letting the loader reject. Same defensive
// posture as the activity-column fallback in nucleus.ts.
function isMissingSchemaError(err: any): boolean {
  if (!err) return false;
  if (err.code === '42703' || err.code === '42P01') return true;
  const msg = String(err.message ?? '');
  return /does not exist/i.test(msg) || /could not find the table/i.test(msg);
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

  // Pre-migration database: retry courses with just the legacy columns.
  let courseRows = coursesRes.data;
  if (coursesRes.error) {
    if (!isMissingSchemaError(coursesRes.error)) throw coursesRes.error;
    const legacy = await supabase
      .from('courses')
      .select('id, name, short_name, order')
      .eq('is_active', true)
      .order('order');
    if (legacy.error) throw legacy.error;
    courseRows = legacy.data;
  }

  // Pre-migration database: no course_units table — render books
  // without units rather than failing.
  let unitRows = unitsRes.data ?? [];
  if (unitsRes.error) {
    if (!isMissingSchemaError(unitsRes.error)) throw unitsRes.error;
    unitRows = [];
  }

  const unitsByCourse = new Map<string, CourseUnit[]>();
  for (const u of unitRows as any[]) {
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

  return ((courseRows ?? []) as any[]).map(c => ({
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
    .select('id, name, course_enrollments(status, courses(id, name))')
    .is('deleted_at', null)
    .order('name');

  if (personIds) query = query.in('id', personIds);

  const { data, error } = await query;
  if (error) throw error;

  // Capacities are scoped per cluster. For a cluster profile we count
  // that cluster's catalog; for the regional (all-clusters) view we
  // gather every cluster's entries and group by name.
  const capacitiesByPerson = await fetchCapacityNamesByPerson(
    (data as any[]).map(p => p.id),
    clusterId,
  );

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
