import { supabase } from '../supabase';
import { actionPermission, activityLeadActivityIds } from '../permissions';
import { getCallerContext } from './users';
import { fetchPersonCapacities, type PersonCapacity } from './capacities';
import type { AgeGroup, ProfileStatus, CompletionStatus, ReligiousStatus } from '../database.types';
import {
  isMinorForAgeGroup,
  pickDistinguishingLabels,
  type PersonDisambiguatorContext,
} from '../persons/disambiguators';

export interface PersonDetail {
  id: string;
  name: string;
  ageGroup: AgeGroup;
  isMinor: boolean;
  profileStatus: ProfileStatus;
  religiousStatus: ReligiousStatus;
  // Canonical cluster affiliation (null until set via enrollment or the
  // cluster people interface).
  clusterId: string | null;
  email: string | null;
  phone: string | null;
  // Cluster-scoped capacities the person currently holds (one entry per
  // catalog row across all their clusters).
  capacities: PersonCapacity[];
  notes: string;
  photoUrl: string | null;
  nuclei: Array<{ id: string; name: string }>;
  // Course-level progress. For a Ruhi book this is the rollup of its
  // unit enrollments (maintained by syncCurriculumProgress); for JY
  // texts and branch courses it is the whole-course status.
  courseEnrollments: Array<{
    courseId: string;
    courseName: string;
    status: CompletionStatus;
  }>;
  // Unit-level progress for Ruhi books.
  unitEnrollments: Array<{
    courseUnitId: string;
    courseId: string;
    unitName: string;
    status: CompletionStatus;
  }>;
  activities: Array<{
    activityId: string;
    activityName: string;
    nucleusId: string;
    role: string;
  }>;
}

export interface PersonSearchMatch {
  id: string;
  name: string;
  ageGroup: AgeGroup;
  isMinor: boolean;
  profileStatus: ProfileStatus;
  nucleusNames: string[];
  activityNames: string[];
  /** Short labels picked to differentiate this match from the others returned in the same call. */
  disambiguators: string[];
}

export async function fetchPersonDetail(personId: string): Promise<PersonDetail | null> {
  const [personRes, nucleiRes, coursesRes, unitsRes, activitiesRes, capacities] = await Promise.all([
    supabase
      .from('persons')
      .select('id, name, age_group, is_minor, profile_status, religious_status, cluster_id, email, phone, notes, profile_image_url')
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
      .from('course_unit_enrollments')
      .select('course_unit_id, status, course_units(id, name, course_id)')
      .eq('person_id', personId),
    supabase
      .from('activity_participants')
      .select('activity_id, role, activities(id, name, nucleus_id)')
      .eq('person_id', personId)
      .is('deleted_at', null),
    fetchPersonCapacities(personId),
  ]);

  if (personRes.error || !personRes.data) return null;
  const p = personRes.data as any;

  return {
    id: p.id,
    name: p.name,
    ageGroup: (p.age_group ?? 'unknown') as AgeGroup,
    isMinor: !!p.is_minor,
    profileStatus: (p.profile_status ?? 'provisional') as ProfileStatus,
    religiousStatus: (p.religious_status ?? 'unknown') as ReligiousStatus,
    clusterId: p.cluster_id ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    capacities,
    notes: p.notes ?? '',
    photoUrl: p.profile_image_url ?? null,
    nuclei: ((nucleiRes.data ?? []) as any[]).map((e: any) => ({
      id: e.nucleus_id,
      name: e.nuclei?.name ?? e.nucleus_id,
    })),
    courseEnrollments: ((coursesRes.data ?? []) as any[]).map((ce: any) => ({
      courseId: ce.course_id,
      courseName: ce.courses?.name ?? ce.course_id,
      status: ce.status as CompletionStatus,
    })),
    unitEnrollments: ((unitsRes.data ?? []) as any[]).map((ue: any) => ({
      courseUnitId: ue.course_unit_id,
      courseId: ue.course_units?.course_id ?? '',
      unitName: ue.course_units?.name ?? ue.course_unit_id,
      status: ue.status as CompletionStatus,
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
  params: {
    name?: string;
    ageGroup?: AgeGroup;
    minorOverride?: boolean;
    profileStatus?: ProfileStatus;
    religiousStatus?: ReligiousStatus;
    clusterId?: string | null;
    email?: string | null;
    phone?: string | null;
  }
): Promise<void> {
  const update: Record<string, any> = {};
  if (params.name !== undefined) update.name = params.name;
  if (params.profileStatus !== undefined) update.profile_status = params.profileStatus;
  if (params.religiousStatus !== undefined) update.religious_status = params.religiousStatus;
  if (params.clusterId !== undefined) update.cluster_id = params.clusterId;

  if (params.ageGroup !== undefined) {
    update.age_group = params.ageGroup;
    update.is_minor = isMinorForAgeGroup(params.ageGroup, params.minorOverride);
  } else if (params.minorOverride !== undefined) {
    // Caller is only toggling the minor flag (allowed for youth/unknown);
    // the DB invariant rejects the write if the existing age_group disallows it.
    update.is_minor = params.minorOverride;
  }

  // Privacy: minors never carry contact info. We force the columns null
  // whenever the resulting state is is_minor=true, regardless of what the
  // caller sent.
  const willBeMinor = update.is_minor === true;
  if (willBeMinor) {
    update.email = null;
    update.phone = null;
  } else {
    if (params.email !== undefined) update.email = params.email;
    if (params.phone !== undefined) update.phone = params.phone;
  }

  if (Object.keys(update).length === 0) return;

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

export async function uploadProfilePhoto(personId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${personId}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('profile-photos')
    .upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from('profile-photos').getPublicUrl(path);
  const url = data.publicUrl;
  const { data: updated, error: updateError } = await supabase
    .from('persons')
    .update({ profile_image_url: url })
    .eq('id', personId)
    .select('id');
  if (updateError) throw updateError;
  // Supabase returns no error but 0 rows when RLS blocks the write.
  if (!updated?.length) throw new Error('profile_image_url update matched 0 rows — check persons RLS update policy');
  return url;
}

export interface EnrollmentDiff {
  idsToDelete: string[];
  toInsert: Array<{ courseId: string; status: CompletionStatus }>;
  toUpdate: Array<{ id: string; courseId: string; newStatus: CompletionStatus }>;
}

export function computeEnrollmentDiff(
  current: Array<{ id: string; course_id: string; status: string }>,
  desired: Array<{ courseId: string; status: CompletionStatus }>
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

export interface UnitEnrollmentDiff {
  idsToDelete: string[];
  toInsert: Array<{ courseUnitId: string; status: CompletionStatus }>;
  toUpdate: Array<{ id: string; courseUnitId: string; newStatus: CompletionStatus }>;
}

// Same shape as computeEnrollmentDiff, keyed on course_unit_id — the
// unit-level analogue used to reconcile course_unit_enrollments.
export function computeUnitEnrollmentDiff(
  current: Array<{ id: string; course_unit_id: string; status: string }>,
  desired: Array<{ courseUnitId: string; status: CompletionStatus }>
): UnitEnrollmentDiff {
  const currentMap = new Map(current.map(e => [e.course_unit_id, e]));
  const desiredMap = new Map(desired.map(d => [d.courseUnitId, d.status]));

  const idsToDelete = current
    .filter(e => !desiredMap.has(e.course_unit_id))
    .map(e => e.id);

  const toInsert: UnitEnrollmentDiff['toInsert'] = [];
  const toUpdate: UnitEnrollmentDiff['toUpdate'] = [];

  for (const { courseUnitId, status } of desired) {
    const existing = currentMap.get(courseUnitId);
    if (existing) {
      if (existing.status !== status) {
        toUpdate.push({ id: existing.id, courseUnitId, newStatus: status });
      }
    } else {
      toInsert.push({ courseUnitId, status });
    }
  }

  return { idsToDelete, toInsert, toUpdate };
}

// Returns the matching persons enriched with the structural data the UI
// needs to render contextual disambiguators (so two "John"s can be told
// apart without inventing fake distinguishers like "John2").
// Escape PostgREST `ilike` wildcards so a stray % or _ in user input
// doesn't broaden the match unexpectedly.
function escapeIlike(input: string): string {
  return input.replace(/[\\%_]/g, m => `\\${m}`);
}

export async function searchPersonsByName(
  query: string,
  options: { limit?: number } = {},
): Promise<PersonSearchMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data } = await supabase
    .from('persons')
    .select('id, name, age_group, is_minor, profile_status')
    .ilike('name', `%${escapeIlike(trimmed)}%`)
    .is('deleted_at', null)
    .order('name')
    .limit(options.limit ?? 10);

  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    age_group: AgeGroup;
    is_minor: boolean;
    profile_status: ProfileStatus;
  }>;
  if (rows.length === 0) return [];

  const ids = rows.map(r => r.id);
  const [{ data: nucleiData }, { data: partsData }] = await Promise.all([
    supabase
      .from('nucleus_enrollments')
      .select('person_id, nuclei(name)')
      .in('person_id', ids)
      .is('deleted_at', null),
    supabase
      .from('activity_participants')
      .select('person_id, activities(name)')
      .in('person_id', ids)
      .is('deleted_at', null),
  ]);

  const nucleiByPerson = new Map<string, string[]>();
  for (const r of (nucleiData ?? []) as any[]) {
    const n = r.nuclei?.name;
    if (!n) continue;
    const arr = nucleiByPerson.get(r.person_id) ?? [];
    arr.push(n);
    nucleiByPerson.set(r.person_id, arr);
  }
  const activitiesByPerson = new Map<string, string[]>();
  for (const r of (partsData ?? []) as any[]) {
    const n = r.activities?.name;
    if (!n) continue;
    const arr = activitiesByPerson.get(r.person_id) ?? [];
    arr.push(n);
    activitiesByPerson.set(r.person_id, arr);
  }

  // Group matches by exact (case-insensitive) name so disambiguators are
  // chosen *within* each name cluster. We don't try to differentiate
  // "John" from "Johnny" — they're rendered separately by the UI.
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.name.toLowerCase();
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const result: PersonSearchMatch[] = [];
  for (const sameName of groups.values()) {
    const ctxs: PersonDisambiguatorContext[] = sameName.map(r => ({
      id: r.id,
      name: r.name,
      ageGroup: r.age_group,
      isMinor: r.is_minor,
      profileStatus: r.profile_status,
      nucleusNames: nucleiByPerson.get(r.id) ?? [],
      activityNames: activitiesByPerson.get(r.id) ?? [],
      clusterName: null,
      attendsWith: [],
      email: null,
      phone: null,
    }));
    const labels = pickDistinguishingLabels(ctxs, 2);
    for (const c of ctxs) {
      result.push({
        id: c.id,
        name: c.name,
        ageGroup: c.ageGroup,
        isMinor: c.isMinor,
        profileStatus: c.profileStatus,
        nucleusNames: c.nucleusNames,
        activityNames: c.activityNames,
        disambiguators: labels[c.id] ?? [],
      });
    }
  }

  // Preserve the original alphabetical ordering by name.
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

// Insert a new person. Identity is the returned id; the name is just a
// label, so duplicates are allowed at this layer. Callers must obtain
// the right contextual signals (age_group, profile_status) from the UI.
export async function createPerson(params: {
  name: string;
  ageGroup?: AgeGroup;
  minorOverride?: boolean;
  profileStatus?: ProfileStatus;
  religiousStatus?: ReligiousStatus;
  clusterId?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<{ id: string; name: string }> {
  const ageGroup: AgeGroup = params.ageGroup ?? 'unknown';
  const isMinor = isMinorForAgeGroup(ageGroup, params.minorOverride);
  const row: Record<string, any> = {
    name: params.name,
    age_group: ageGroup,
    is_minor: isMinor,
    profile_status: params.profileStatus ?? 'provisional',
  };
  if (params.religiousStatus !== undefined) row.religious_status = params.religiousStatus;
  if (params.clusterId !== undefined && params.clusterId !== null) row.cluster_id = params.clusterId;
  if (!isMinor) {
    if (params.email !== undefined) row.email = params.email;
    if (params.phone !== undefined) row.phone = params.phone;
  }

  const { data, error } = await supabase
    .from('persons')
    .insert(row)
    .select('id, name')
    .single();
  if (error) throw error;
  const p = data as any;
  return { id: p.id, name: p.name };
}

export interface ClusterPerson {
  id: string;
  name: string;
  ageGroup: AgeGroup;
  isMinor: boolean;
  profileStatus: ProfileStatus;
  religiousStatus: ReligiousStatus;
  clusterId: string | null;
  photoUrl: string | null;
  email: string | null;
  phone: string | null;
  // Nuclei in *this* cluster the person is currently enrolled in.
  nuclei: Array<{ id: string; name: string }>;
}

// Everyone attributable to a cluster: a canonical `cluster_id` match, plus
// anyone reachable through one of the cluster's nuclei (an enrollment) or its
// activities (a participation). The three sets are unioned so the roster never
// misses someone who belongs to the cluster by any of those routes.
export async function fetchClusterPeople(clusterId: string): Promise<ClusterPerson[]> {
  // The cluster's nuclei (id + name) — used both to scope enrollments and to
  // label each person's nucleus chips.
  const { data: nucleiRows, error: nucleiErr } = await supabase
    .from('nuclei')
    .select('id, name')
    .eq('cluster_id', clusterId)
    .is('deleted_at', null);
  if (nucleiErr) throw nucleiErr;
  const nuclei = (nucleiRows ?? []) as Array<{ id: string; name: string }>;
  const nucleusIds = nuclei.map(n => n.id);
  const nucleusNameById = new Map(nuclei.map(n => [n.id, n.name]));

  // person_id -> set of (this cluster's) nucleus ids they're enrolled in.
  const enrollmentsByPerson = new Map<string, Set<string>>();
  if (nucleusIds.length) {
    const { data: enr, error: enrErr } = await supabase
      .from('nucleus_enrollments')
      .select('person_id, nucleus_id')
      .in('nucleus_id', nucleusIds)
      .is('deleted_at', null);
    if (enrErr) throw enrErr;
    for (const row of (enr ?? []) as any[]) {
      if (!enrollmentsByPerson.has(row.person_id)) enrollmentsByPerson.set(row.person_id, new Set());
      enrollmentsByPerson.get(row.person_id)!.add(row.nucleus_id);
    }
  }

  // People reachable only through an activity in one of the cluster's nuclei.
  const activityPersonIds = new Set<string>();
  if (nucleusIds.length) {
    const { data: acts } = await supabase
      .from('activities')
      .select('id')
      .in('nucleus_id', nucleusIds)
      .is('deleted_at', null);
    const activityIds = ((acts ?? []) as any[]).map(a => a.id);
    if (activityIds.length) {
      const { data: parts } = await supabase
        .from('activity_participants')
        .select('person_id')
        .in('activity_id', activityIds)
        .is('deleted_at', null);
      for (const row of (parts ?? []) as any[]) activityPersonIds.add(row.person_id);
    }
  }

  // People with a canonical affiliation to this cluster.
  const { data: byCluster, error: byClusterErr } = await supabase
    .from('persons')
    .select('id')
    .eq('cluster_id', clusterId)
    .is('deleted_at', null);
  if (byClusterErr) throw byClusterErr;

  const ids = new Set<string>();
  for (const r of (byCluster ?? []) as any[]) ids.add(r.id);
  for (const id of enrollmentsByPerson.keys()) ids.add(id);
  for (const id of activityPersonIds) ids.add(id);
  if (ids.size === 0) return [];

  const { data: persons, error: personsErr } = await supabase
    .from('persons')
    .select('id, name, age_group, is_minor, profile_status, religious_status, cluster_id, profile_image_url, email, phone')
    .in('id', [...ids])
    .is('deleted_at', null);
  if (personsErr) throw personsErr;

  return ((persons ?? []) as any[])
    .map(p => ({
      id: p.id,
      name: p.name,
      ageGroup: (p.age_group ?? 'unknown') as AgeGroup,
      isMinor: !!p.is_minor,
      profileStatus: (p.profile_status ?? 'provisional') as ProfileStatus,
      religiousStatus: (p.religious_status ?? 'unknown') as ReligiousStatus,
      clusterId: p.cluster_id ?? null,
      photoUrl: (p.profile_image_url ?? null) as string | null,
      email: (p.email ?? null) as string | null,
      phone: (p.phone ?? null) as string | null,
      nuclei: [...(enrollmentsByPerson.get(p.id) ?? [])]
        .map(nid => ({ id: nid, name: nucleusNameById.get(nid) ?? nid }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Bulk-set the relationship-to-the-Faith on several people at once. RLS is
// the authority on which of these the caller may actually write.
export async function bulkSetReligiousStatus(
  personIds: string[],
  status: ReligiousStatus,
): Promise<void> {
  if (personIds.length === 0) return;
  const { error } = await supabase
    .from('persons')
    .update({ religious_status: status })
    .in('id', personIds);
  if (error) throw error;
}

// Bulk-reassign the canonical cluster affiliation for several people.
export async function bulkSetClusterAffiliation(
  personIds: string[],
  clusterId: string,
): Promise<void> {
  if (personIds.length === 0) return;
  const { error } = await supabase
    .from('persons')
    .update({ cluster_id: clusterId })
    .in('id', personIds);
  if (error) throw error;
}

// Direct-delete capability irrespective of person scope. Only Super Admin /
// Admin / Cluster Coordinator (within their cluster) can delete directly.
// Use personDeletePermission(personId) for scope-aware results including
// the request-only path used by Nucleus Coordinators and Activity Leads.
export async function canDeletePerson(): Promise<boolean> {
  const ctx = await getCallerContext();
  if (!ctx) return false;
  return ctx.isSuperAdmin || ctx.isAdmin;
}

// Resolves direct vs. request-only delete capability for a specific person
// by looking up their nucleus + activity scope and consulting the central
// permissions module.
export async function personDeletePermission(personId: string): Promise<'direct' | 'request' | 'none'> {
  const ctx = await getCallerContext();
  if (!ctx) return 'none';
  if (ctx.isSuperAdmin || ctx.isAdmin) return 'direct';

  // Pull all the scopes this person belongs to. The central module checks
  // whether ANY of them sits within the caller's permitted scope.
  const [{ data: enrollments }, { data: parts }] = await Promise.all([
    supabase
      .from('nucleus_enrollments')
      .select('nucleus_id, nuclei(cluster_id)')
      .eq('person_id', personId)
      .is('deleted_at', null),
    supabase
      .from('activity_participants')
      .select('activity_id, activities(nucleus_id, nuclei(cluster_id))')
      .eq('person_id', personId)
      .is('deleted_at', null),
  ]);

  const checks: Array<{ clusterId?: string; nucleusId?: string; activityId?: string }> = [];
  for (const e of (enrollments ?? []) as any[]) {
    checks.push({ clusterId: e.nuclei?.cluster_id, nucleusId: e.nucleus_id });
  }
  for (const p of (parts ?? []) as any[]) {
    checks.push({
      clusterId: p.activities?.nuclei?.cluster_id,
      nucleusId: p.activities?.nucleus_id,
      activityId: p.activity_id,
    });
  }

  // Activity leads see nucleus-enrolled persons via the NC's nucleus, but their
  // activityId is never in `parts` for persons who have no activity_participants
  // row yet. Add synthetic checks so inOwnActivity can fire for them.
  const alActivityIds = activityLeadActivityIds(ctx);
  if (alActivityIds.length > 0 && (enrollments ?? []).length > 0) {
    const enrolledNucleusIds = (enrollments as any[]).map((e: any) => e.nucleus_id);
    const { data: alActivities } = await supabase
      .from('activities')
      .select('id, nucleus_id, nuclei(cluster_id)')
      .in('id', alActivityIds)
      .in('nucleus_id', enrolledNucleusIds)
      .is('deleted_at', null);
    for (const a of (alActivities ?? []) as any[]) {
      checks.push({
        clusterId: a.nuclei?.cluster_id,
        nucleusId: a.nucleus_id,
        activityId: a.id,
      });
    }
  }

  // Aggregate: pick the strongest permission across scopes.
  let best: 'direct' | 'request' | 'none' = 'none';
  for (const t of checks) {
    const r = actionPermission(ctx, 'delete_person', t);
    if (r === 'direct') return 'direct';
    if (r === 'request') best = 'request';
  }
  return best;
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

  // Soft-delete (per the policy in DATA_MODEL.md): archive the person and the
  // roster memberships that would otherwise keep surfacing them in cluster
  // rosters and concentric circles. Course / session / journal history is left
  // intact so "who attended when" survives the archive. Who may do this is
  // governed by the persons UPDATE RLS policy.
  const ts = new Date().toISOString();
  const { error } = await supabase
    .from('persons')
    .update({ deleted_at: ts })
    .eq('id', personId);
  if (error) throw error;

  await supabase
    .from('nucleus_enrollments')
    .update({ deleted_at: ts })
    .eq('person_id', personId)
    .is('deleted_at', null);
  await supabase
    .from('activity_participants')
    .update({ deleted_at: ts })
    .eq('person_id', personId)
    .is('deleted_at', null);

  // best-effort audit log
  try {
    await supabase.from('event_log').insert({
      type: 'person_deleted' as any,
      person_id: personId,
      user_id: user.id,
      description: `Archived person "${(person as any).name}"`,
      details: { personName: (person as any).name },
    });
  } catch {
    // non-critical; archive already committed
  }
}

// Merge a duplicate person (loser) into the one to keep (survivor). All of the
// loser's nuclei, activities, courses, attendance and history move to the
// survivor; the loser is archived and tagged with merged_into_id. Runs entirely
// in the `merge_persons` SQL function so it is atomic. RLS / the function's own
// guard decide whether the caller may do it.
export async function mergePersons(loserId: string, survivorId: string): Promise<void> {
  if (loserId === survivorId) throw new Error('Cannot merge a person into themselves');
  const { error } = await (supabase as any).rpc('merge_persons', {
    p_loser: loserId,
    p_survivor: survivorId,
  });
  if (error) throw error;
}

export interface CurriculumProgressInput {
  // Course-level desired state: whole Ruhi books, JY texts, branch
  // courses. For Ruhi books the caller passes the rollup status
  // derived from the book's units (see deriveBookStatus).
  courses: Array<{ courseId: string; status: CompletionStatus }>;
  // Unit-level desired state for Ruhi book units.
  units: Array<{ courseUnitId: string; status: CompletionStatus }>;
}

// Reconciles a person's curriculum progress against the desired state
// in one pass: unit-level enrollments and course-level enrollments
// (the latter including the rollup of a Ruhi book's unit progress).
// Course-level transitions are mirrored into the append-only event
// log; unit-level changes are not — the log has no unit-grained
// event type yet.
export async function syncCurriculumProgress(
  personId: string,
  desired: CurriculumProgressInput
): Promise<void> {
  const now = new Date().toISOString();

  // --- Unit-level enrollments ------------------------------------
  const { data: currentUnits } = await supabase
    .from('course_unit_enrollments')
    .select('id, course_unit_id, status')
    .eq('person_id', personId);

  const unitDiff = computeUnitEnrollmentDiff(
    (currentUnits ?? []) as Array<{ id: string; course_unit_id: string; status: string }>,
    desired.units
  );

  if (unitDiff.idsToDelete.length > 0) {
    await supabase.from('course_unit_enrollments').delete().in('id', unitDiff.idsToDelete);
  }
  for (const { id, newStatus } of unitDiff.toUpdate) {
    await supabase
      .from('course_unit_enrollments')
      .update({
        status: newStatus,
        completed_at: newStatus === 'completed' ? now : null,
      })
      .eq('id', id);
  }
  for (const { courseUnitId, status } of unitDiff.toInsert) {
    await supabase.from('course_unit_enrollments').insert({
      person_id: personId,
      course_unit_id: courseUnitId,
      status,
      started_at: now,
      completed_at: status === 'completed' ? now : null,
    });
  }

  // --- Course-level enrollments ----------------------------------
  const { data: current } = await supabase
    .from('course_enrollments')
    .select('id, course_id, status')
    .eq('person_id', personId);

  const { idsToDelete, toInsert, toUpdate } = computeEnrollmentDiff(
    (current ?? []) as Array<{ id: string; course_id: string; status: string }>,
    desired.courses
  );

  if (idsToDelete.length > 0) {
    await supabase.from('course_enrollments').delete().in('id', idsToDelete);
  }

  const newlyStarted: string[] = [];
  const newlyCompleted: string[] = [];

  for (const { id, courseId, newStatus } of toUpdate) {
    await supabase
      .from('course_enrollments')
      .update({
        status: newStatus,
        completed_at: newStatus === 'completed' ? now : null,
      })
      .eq('id', id);
    if (newStatus === 'completed') newlyCompleted.push(courseId);
  }

  for (const { courseId, status } of toInsert) {
    await supabase.from('course_enrollments').insert({
      person_id: personId,
      course_id: courseId,
      status,
      started_at: now,
      completed_at: status === 'completed' ? now : null,
    });
    if (status === 'completed') newlyCompleted.push(courseId);
    else newlyStarted.push(courseId);
  }

  if (newlyStarted.length === 0 && newlyCompleted.length === 0) return;

  const courseIdsToName = [...new Set([...newlyStarted, ...newlyCompleted])];
  const { data: courses } = await supabase
    .from('courses')
    .select('id, name')
    .in('id', courseIdsToName);
  const courseNameMap: Record<string, string> = {};
  ((courses ?? []) as any[]).forEach(c => { courseNameMap[c.id] = c.name; });

  const { data: person } = await supabase
    .from('persons')
    .select('name')
    .eq('id', personId)
    .single();
  const personName = (person as any)?.name ?? 'Person';

  const { data: enrollments } = await supabase
    .from('nucleus_enrollments')
    .select('nucleus_id, nuclei(cluster_id)')
    .eq('person_id', personId)
    .is('deleted_at', null);
  const nucleusScopes = ((enrollments ?? []) as any[]).map(e => ({
    nucleusId: e.nucleus_id as string,
    clusterId: (e.nuclei?.cluster_id ?? null) as string | null,
  }));
  const scopes = nucleusScopes.length > 0
    ? nucleusScopes
    : [{ nucleusId: null as string | null, clusterId: null as string | null }];

  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const rows: any[] = [];
  for (const courseId of newlyStarted) {
    const courseName = courseNameMap[courseId] ?? 'course';
    for (const scope of scopes) {
      rows.push({
        type: 'course_started',
        cluster_id: scope.clusterId,
        nucleus_id: scope.nucleusId,
        person_id: personId,
        user_id: userId,
        description: `${personName} started ${courseName}`,
        details: { personName, courseId, courseName },
      });
    }
  }
  for (const courseId of newlyCompleted) {
    const courseName = courseNameMap[courseId] ?? 'course';
    for (const scope of scopes) {
      rows.push({
        type: 'course_completed',
        cluster_id: scope.clusterId,
        nucleus_id: scope.nucleusId,
        person_id: personId,
        user_id: userId,
        description: `${personName} completed ${courseName}`,
        details: { personName, courseId, courseName },
      });
    }
  }

  if (rows.length > 0) {
    await supabase.from('event_log').insert(rows);
  }
}
