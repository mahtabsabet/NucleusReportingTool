import { supabase } from '../supabase';
import type { Activity } from '../../types';
import type { PersonProfile, CourseRow } from './clusterProfile';

export type { PersonProfile, CourseRow };

const DB_TO_APP_TYPE: Record<string, Activity['type']> = {
  children_class: 'children-class',
  junior_youth: 'junior-youth',
  study_circle: 'study-circle',
  devotional: 'devotional',
  fireside: 'other',
  other: 'other',
};

const APP_TO_DB_TYPE: Record<Activity['type'], string> = {
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
