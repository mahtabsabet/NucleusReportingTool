import { supabase } from '../supabase';
import { canDirectly } from '../permissions';
import { getCallerContext } from './users';

export interface ClusterRow {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  zoom: number;
}

export interface NucleusRow {
  id: string;
  clusterId: string;
  name: string;
  location: { lat: number; lng: number };
  engagementCounts: {
    coordinating: number;
    supporting: number;
    participating: number;
    aware: number;
  };
}

export async function fetchClusters(): Promise<ClusterRow[]> {
  const { data, error } = await supabase
    .from('clusters')
    .select('id, name, center_lat, center_lng, zoom')
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  return data.map(c => ({
    id: c.id,
    name: c.name,
    center: { lat: c.center_lat, lng: c.center_lng },
    zoom: c.zoom,
  }));
}

export async function fetchNuclei(clusterId?: string | null): Promise<NucleusRow[]> {
  let query = supabase
    .from('nuclei')
    .select('id, cluster_id, name, lat, lng, nucleus_enrollments(engagement_level, deleted_at)')
    .is('deleted_at', null)
    .order('name');

  if (clusterId) query = query.eq('cluster_id', clusterId);

  const { data, error } = await query;
  if (error) throw error;

  return data.map(n => {
    const active = (n.nucleus_enrollments as any[]).filter(e => !e.deleted_at);
    return {
      id: n.id,
      clusterId: n.cluster_id,
      name: n.name,
      location: { lat: n.lat, lng: n.lng },
      engagementCounts: {
        coordinating: active.filter(e => e.engagement_level === 'coordinating').length,
        supporting:   active.filter(e => e.engagement_level === 'supporting').length,
        participating: active.filter(e => e.engagement_level === 'participating').length,
        aware:        active.filter(e => e.engagement_level === 'aware').length,
      },
    };
  });
}

export async function canCreateNucleusInCluster(clusterId: string): Promise<boolean> {
  const ctx = await getCallerContext();
  if (!ctx) return false;
  return canDirectly(ctx, 'create_nucleus', { clusterId });
}

export async function createNucleus(params: {
  clusterId: string;
  name: string;
  lat: number;
  lng: number;
}): Promise<NucleusRow> {
  const { data, error } = await supabase
    .from('nuclei')
    .insert({ cluster_id: params.clusterId, name: params.name, lat: params.lat, lng: params.lng })
    .select('id, cluster_id, name, lat, lng')
    .single();
  if (error) throw error;

  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('event_log').insert({
    type: 'nucleus_created',
    cluster_id: data.cluster_id,
    nucleus_id: data.id,
    user_id: user?.id ?? null,
    description: `Created nucleus "${data.name}"`,
    details: { nucleusName: data.name },
  });

  return {
    id: data.id,
    clusterId: data.cluster_id,
    name: data.name,
    location: { lat: data.lat, lng: data.lng },
    engagementCounts: { coordinating: 0, supporting: 0, participating: 0, aware: 0 },
  };
}
