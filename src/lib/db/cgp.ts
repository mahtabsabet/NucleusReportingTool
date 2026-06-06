import { supabase } from '../supabase';
import { fetchClusterPeople } from './persons';
import {
  computeClusterGrowthProfile,
  type ClusterGrowthProfile,
  type CgpBook,
  type CgpBranchCourse,
  type CgpActivity,
} from '../cgp';
import type { ActivityType, ReligiousStatus } from '../database.types';

// ============================================================
// Cluster Growth Profile — data layer
//
// One cluster-scoped fetch that gathers people, curriculum completions,
// and active activities, then defers all counting to the pure
// computeClusterGrowthProfile(). See CGP_SPEC.md.
// ============================================================

const CORE_ACTIVITY_TYPES: ActivityType[] = [
  'children_class',
  'junior_youth',
  'study_circle',
  'devotional',
];

export async function fetchClusterGrowthProfile(clusterId: string): Promise<ClusterGrowthProfile> {
  // 1. People attributable to the cluster (canonical + enrolled + participating),
  //    matching the Cluster People roster. Gives us the id set and the
  //    religious-status lookup for the friend-of-the-faith tally.
  const people = await fetchClusterPeople(clusterId);
  const clusterPersonIds = new Set(people.map(p => p.id));
  const religiousStatus = new Map<string, ReligiousStatus>(
    people.map(p => [p.id, p.religiousStatus]),
  );

  // 2. Curriculum catalogue: main-sequence books with their units, plus
  //    branch courses tagged with the parent book they hang off.
  const [coursesRes, unitsRes] = await Promise.all([
    supabase
      .from('courses')
      .select('id, name, short_name, order, stream, parent_course_id')
      .eq('is_active', true)
      .order('order'),
    supabase
      .from('course_units')
      .select('id, course_id, name, order')
      .order('order'),
  ]);
  if (coursesRes.error) throw coursesRes.error;
  if (unitsRes.error) throw unitsRes.error;

  const courseRows = (coursesRes.data ?? []) as any[];
  const unitRows = (unitsRes.data ?? []) as any[];

  // course id -> book number (its `order`), for resolving branch parents.
  const orderByCourseId = new Map<string, number>(
    courseRows.map(c => [c.id as string, c.order as number]),
  );
  const unitsByCourseId = new Map<string, { unit: number; name: string; unitId: string }[]>();
  for (const u of unitRows) {
    if (!unitsByCourseId.has(u.course_id)) unitsByCourseId.set(u.course_id, []);
    unitsByCourseId.get(u.course_id)!.push({ unit: u.order, name: u.name, unitId: u.id });
  }

  const books: CgpBook[] = courseRows
    .filter(c => c.stream === 'ruhi_main')
    .map(c => ({
      book: c.order as number,
      name: (c.name as string) ?? `Book ${c.order}`,
      courseId: c.id as string,
      units: unitsByCourseId.get(c.id) ?? [],
    }));

  const branchCourses: CgpBranchCourse[] = courseRows
    .filter(c => c.stream === 'branch' && c.parent_course_id)
    .map(c => ({
      parentBook: orderByCourseId.get(c.parent_course_id as string) ?? -1,
      label: (c.name as string) ?? (c.short_name as string) ?? '',
      courseId: c.id as string,
    }));

  // 3. Completions (whole-book and per-unit), scoped to cluster people.
  const personIds = [...clusterPersonIds];
  const completedCourse = new Set<string>();
  const completedUnit = new Set<string>();
  if (personIds.length) {
    const [enrRes, unitEnrRes] = await Promise.all([
      supabase
        .from('course_enrollments')
        .select('person_id, course_id, status')
        .eq('status', 'completed')
        .in('person_id', personIds),
      supabase
        .from('course_unit_enrollments')
        .select('person_id, course_unit_id, status')
        .eq('status', 'completed')
        .in('person_id', personIds),
    ]);
    if (enrRes.error) throw enrRes.error;
    if (unitEnrRes.error) throw unitEnrRes.error;
    for (const r of (enrRes.data ?? []) as any[]) {
      completedCourse.add(`${r.person_id}:${r.course_id}`);
    }
    for (const r of (unitEnrRes.data ?? []) as any[]) {
      completedUnit.add(`${r.person_id}:${r.course_unit_id}`);
    }
  }

  // 4. Active core activities in the cluster, with their active rosters.
  const { data: nucleiRows, error: nucleiErr } = await supabase
    .from('nuclei')
    .select('id')
    .eq('cluster_id', clusterId)
    .is('deleted_at', null);
  if (nucleiErr) throw nucleiErr;
  const nucleusIds = ((nucleiRows ?? []) as any[]).map(n => n.id);

  let activities: CgpActivity[] = [];
  if (nucleusIds.length) {
    const { data: actRows, error: actErr } = await supabase
      .from('activities')
      .select('id, type, activity_participants(person_id, status, deleted_at)')
      .in('nucleus_id', nucleusIds)
      .eq('lifecycle_state', 'active')
      .is('deleted_at', null);
    if (actErr) throw actErr;

    activities = ((actRows ?? []) as any[])
      .filter(a => CORE_ACTIVITY_TYPES.includes(a.type))
      .map(a => ({
        type: a.type as ActivityType,
        activeParticipantIds: ((a.activity_participants ?? []) as any[])
          // status defaults to 'active'; tolerate older rows without it.
          .filter(p => !p.deleted_at && (p.status ?? 'active') === 'active')
          .map(p => p.person_id as string),
      }));
  }

  return computeClusterGrowthProfile({
    clusterPersonIds,
    religiousStatus,
    completedCourse,
    completedUnit,
    books,
    branchCourses,
    activities,
  });
}
