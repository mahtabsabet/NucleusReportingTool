import { supabase } from '../supabase';
import type { Activity } from '../../types';

const APP_TO_DB_TYPE: Record<string, string> = {
  'children-class': 'children_class',
  'junior-youth': 'junior_youth',
  'study-circle': 'study_circle',
  devotional: 'devotional',
  other: 'other',
};

const DB_TO_APP_TYPE: Record<string, Activity['type']> = {
  children_class: 'children-class',
  junior_youth: 'junior-youth',
  study_circle: 'study-circle',
  devotional: 'devotional',
  fireside: 'other',
  other: 'other',
};

export interface ActivityReportRow {
  id: string;
  nucleusId: string;
  nucleusName: string;
  name: string;
  type: Activity['type'];
  currentBook: string | undefined;
  participants: Record<string, string[]>;
  personNames: Record<string, string>;
}

export async function fetchActivitiesByType(
  appType: Activity['type'],
  clusterId?: string | null
): Promise<ActivityReportRow[]> {
  let nucleusIds: string[] | null = null;
  if (clusterId) {
    const { data: nuclei } = await supabase
      .from('nuclei')
      .select('id')
      .eq('cluster_id', clusterId)
      .is('deleted_at', null);
    nucleusIds = ((nuclei ?? []) as any[]).map((n: any) => n.id);
    if (nucleusIds.length === 0) return [];
  }

  let query = supabase
    .from('activities')
    .select('id, nucleus_id, name, type, current_course_id, nuclei(name), activity_participants(person_id, role, deleted_at)')
    .eq('type', APP_TO_DB_TYPE[appType] as any)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name');

  if (nucleusIds) query = query.in('nucleus_id', nucleusIds);

  const { data, error } = await query;
  if (error) throw error;

  const allPersonIds = new Set<string>();
  (data as any[]).forEach(a => {
    (a.activity_participants ?? [])
      .filter((p: any) => !p.deleted_at)
      .forEach((p: any) => allPersonIds.add(p.person_id));
  });

  const personNamesMap: Record<string, string> = {};
  if (allPersonIds.size > 0) {
    const { data: persons } = await supabase
      .from('persons')
      .select('id, name')
      .in('id', [...allPersonIds]);
    ((persons ?? []) as any[]).forEach((p: any) => { personNamesMap[p.id] = p.name; });
  }

  const courseIds = [...new Set(
    (data as any[]).map((a: any) => a.current_course_id).filter(Boolean)
  )];
  const courseNameMap: Record<string, string> = {};
  if (courseIds.length > 0) {
    const { data: courses } = await supabase
      .from('courses')
      .select('id, name')
      .in('id', courseIds);
    ((courses ?? []) as any[]).forEach((c: any) => { courseNameMap[c.id] = c.name; });
  }

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
      nucleusName: (a.nuclei as any)?.name ?? a.nucleus_id,
      name: a.name,
      type: (DB_TO_APP_TYPE[a.type] ?? 'other') as Activity['type'],
      currentBook: a.current_course_id ? courseNameMap[a.current_course_id] : undefined,
      participants,
      personNames: personNamesMap,
    };
  });
}

export interface EventEntry {
  id: string;
  timestamp: Date;
  type: string;
  nucleusId?: string;
  nucleusName?: string;
  activityId?: string;
  personId?: string;
  personName?: string;
  description: string;
  details?: Record<string, unknown>;
}

export interface EventSummary {
  activitiesCreated: EventEntry[];
  participantsAdded: EventEntry[];
  participantsRemoved: EventEntry[];
  circleMovements: EventEntry[];
  coursesCompleted: EventEntry[];
  coursesStarted: EventEntry[];
  peopleCreated: EventEntry[];
  nucleiCreated: EventEntry[];
  total: number;
}

export async function fetchEventSummary(params: {
  startDate: Date;
  endDate: Date;
  nucleusId?: string;
  nucleusIds?: string[];
}): Promise<EventSummary> {
  let query = supabase
    .from('event_log')
    .select('*')
    .gte('timestamp', params.startDate.toISOString())
    .lte('timestamp', params.endDate.toISOString())
    .order('timestamp', { ascending: false });

  if (params.nucleusId) {
    query = query.eq('nucleus_id', params.nucleusId);
  } else if (params.nucleusIds && params.nucleusIds.length > 0) {
    query = query.in('nucleus_id', params.nucleusIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as any[];

  const personIds = [...new Set(rows.map((e: any) => e.person_id).filter(Boolean))];
  const personNameMap: Record<string, string> = {};
  if (personIds.length > 0) {
    const { data: persons } = await supabase
      .from('persons').select('id, name').in('id', personIds);
    ((persons ?? []) as any[]).forEach((p: any) => { personNameMap[p.id] = p.name; });
  }

  const nucleusIds = [...new Set(rows.map((e: any) => e.nucleus_id).filter(Boolean))];
  const nucleusNameMap: Record<string, string> = {};
  if (nucleusIds.length > 0) {
    const { data: nuclei } = await supabase
      .from('nuclei').select('id, name').in('id', nucleusIds);
    ((nuclei ?? []) as any[]).forEach((n: any) => { nucleusNameMap[n.id] = n.name; });
  }

  const toEntry = (e: any): EventEntry => ({
    id: e.id,
    timestamp: new Date(e.timestamp),
    type: e.type,
    nucleusId: e.nucleus_id ?? undefined,
    nucleusName: e.nucleus_id ? nucleusNameMap[e.nucleus_id] : undefined,
    activityId: e.activity_id ?? undefined,
    personId: e.person_id ?? undefined,
    personName: e.person_id ? personNameMap[e.person_id] : undefined,
    description: e.description,
    details: e.details ?? undefined,
  });

  const events = rows.map(toEntry);

  return {
    activitiesCreated: events.filter(e => e.type === 'activity_created'),
    participantsAdded: events.filter(e => e.type === 'participant_added'),
    participantsRemoved: events.filter(e => e.type === 'participant_removed'),
    circleMovements: events.filter(e => e.type === 'circle_movement'),
    coursesCompleted: events.filter(e => e.type === 'course_completed'),
    coursesStarted: events.filter(e => e.type === 'course_started'),
    peopleCreated: events.filter(e => e.type === 'person_created'),
    nucleiCreated: events.filter(e => e.type === 'nucleus_created'),
    total: events.length,
  };
}

export async function fetchClusterName(clusterId: string): Promise<string | null> {
  const { data } = await supabase
    .from('clusters').select('name').eq('id', clusterId).single();
  return (data as any)?.name ?? null;
}

export async function fetchNucleusIdsForCluster(clusterId: string): Promise<string[]> {
  const { data } = await supabase
    .from('nuclei').select('id').eq('cluster_id', clusterId).is('deleted_at', null);
  return ((data ?? []) as any[]).map((n: any) => n.id);
}
