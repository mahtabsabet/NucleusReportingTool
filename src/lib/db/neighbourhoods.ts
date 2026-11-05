import { supabase } from '../supabase';

export type NeighbourhoodMilestone = 1 | 2 | 3;

// The neighbourhood overlay covers Calgary only for now: its shapes are
// a static file traced from the CREB 2025 community map and placed using
// the City of Calgary's community centre points.
export const NEIGHBOURHOODS_URL = '/data/calgary-communities.geojson';
// Extent of that file. The overlay belongs to whichever cluster is
// centred inside it, so it works whatever the cluster is called (the
// demo database's fictional "Cedar Hollow" sits on Calgary).
const NEIGHBOURHOOD_BOUNDS = { south: 50.84, north: 51.22, west: -114.32, east: -113.85 };

export function neighbourhoodClusterId(
  clusters: { id: string; name: string; center: { lat: number; lng: number } }[],
): string | null {
  const b = NEIGHBOURHOOD_BOUNDS;
  const inside = clusters.filter(c =>
    c.center.lat >= b.south && c.center.lat <= b.north && c.center.lng >= b.west && c.center.lng <= b.east);
  return (inside.find(c => c.name.trim().toLowerCase() === 'calgary') ?? inside[0])?.id ?? null;
}

export interface NeighbourhoodProps {
  id: string;        // City of Calgary community code (or CREB code for CREB-only areas)
  name: string;
  sector: string | null;
  class: string;
}

// Milestone per neighbourhood code. Returns an empty map on a database
// that doesn't have the table yet, so the overlay still draws.
export async function fetchNeighbourhoodMilestones(
  clusterId: string,
): Promise<Map<string, NeighbourhoodMilestone>> {
  const { data, error } = await supabase
    .from('neighbourhood_milestones' as any)
    .select('neighbourhood_code, milestone')
    .eq('cluster_id', clusterId);
  if (error) {
    if (error.code === '42P01' || /does not exist|schema cache/i.test(error.message ?? '')) return new Map();
    throw error;
  }
  return new Map(((data ?? []) as any[]).map(r => [r.neighbourhood_code, r.milestone as NeighbourhoodMilestone]));
}

// null clears the milestone.
export async function setNeighbourhoodMilestone(
  clusterId: string,
  code: string,
  milestone: NeighbourhoodMilestone | null,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const table = supabase.from('neighbourhood_milestones' as any) as any;
  const { error } = milestone == null
    ? await table.delete().eq('cluster_id', clusterId).eq('neighbourhood_code', code)
    : await table.upsert(
        {
          cluster_id: clusterId, neighbourhood_code: code, milestone,
          updated_by: user?.id ?? null, updated_at: new Date().toISOString(),
        },
        { onConflict: 'cluster_id,neighbourhood_code' },
      );
  if (error) throw error;
}
