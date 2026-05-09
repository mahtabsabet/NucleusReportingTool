/**
 * One-time dev seed: replace placeholder clusters with the 17 real Alberta
 * Bahá'í clusters from public/data/alberta-clusters.geojson, and reassign
 * existing nuclei to whichever cluster polygon they fall within. Nuclei
 * outside any polygon (e.g. the Toronto-coord seed nuclei) go to the
 * "Removed From Clustering" cluster.
 *
 * Idempotent: looks up clusters by name, so re-running updates centers/zoom
 * in place without creating duplicates.
 *
 * Preserves the TEST_IDS test fixtures used by e2e/global-setup.ts so
 * Playwright tests keep working.
 *
 * Run from the repo root:
 *   npx tsx scripts/seed-alberta-clusters.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { TEST_IDS } from './seed';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const GEOJSON_PATH = path.resolve(process.cwd(), 'public/data/alberta-clusters.geojson');
const FALLBACK_CLUSTER_NAME = 'Removed From Clustering';

type LngLat = [number, number];

type GeoFeature = {
  type: 'Feature';
  properties: { name: string;[k: string]: any };
  geometry:
    | { type: 'Polygon'; coordinates: LngLat[][] }
    | { type: 'MultiPolygon'; coordinates: LngLat[][][] };
};

function pointInRing(point: LngLat, ring: LngLat[]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: LngLat, rings: LngLat[][]): boolean {
  // Even-odd rule with holes: must be in outer ring AND not in any inner ring.
  if (!pointInRing(point, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(point, rings[i])) return false;
  }
  return true;
}

function pointInFeature(point: LngLat, feature: GeoFeature): boolean {
  if (feature.geometry.type === 'Polygon') {
    return pointInPolygon(point, feature.geometry.coordinates);
  }
  return feature.geometry.coordinates.some((rings) => pointInPolygon(point, rings));
}

function flattenRings(feature: GeoFeature): LngLat[] {
  if (feature.geometry.type === 'Polygon') return feature.geometry.coordinates[0];
  return feature.geometry.coordinates.flatMap((rings) => rings[0]);
}

function centerAndZoom(feature: GeoFeature): { lat: number; lng: number; zoom: number } {
  const points = flattenRings(feature);
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  let sumLng = 0, sumLat = 0;
  for (const [lng, lat] of points) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    sumLng += lng;
    sumLat += lat;
  }
  const lng = sumLng / points.length;
  const lat = sumLat / points.length;
  // Zoom: pick a level that fits the bbox in roughly two tiles.
  const span = Math.max(maxLng - minLng, maxLat - minLat);
  const rawZoom = Math.log2(720 / Math.max(span, 0.05));
  const zoom = Math.max(6, Math.min(12, Math.round(rawZoom)));
  return { lat, lng, zoom };
}

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const fc = JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf8'));
  const features = fc.features as GeoFeature[];
  console.log(`Loaded ${features.length} cluster polygons from ${GEOJSON_PATH}`);

  const newClusters = features.map((f) => {
    const { lat, lng, zoom } = centerAndZoom(f);
    return { name: f.properties.name, lat, lng, zoom, feature: f };
  });
  const newClusterNames = new Set(newClusters.map((c) => c.name));

  const { data: existingClusters, error: existingErr } = await supabase
    .from('clusters')
    .select('id, name, deleted_at');
  if (existingErr) throw new Error(`Fetch clusters: ${existingErr.message}`);

  const protectedIds = new Set([TEST_IDS.clusterId, TEST_IDS.cluster2Id]);
  const toSoftDelete = (existingClusters ?? []).filter(
    (c) => !c.deleted_at && !newClusterNames.has(c.name) && !protectedIds.has(c.id),
  );
  for (const c of toSoftDelete) {
    const { error } = await supabase
      .from('clusters')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', c.id);
    if (error) throw new Error(`Soft-delete cluster ${c.id}: ${error.message}`);
  }
  console.log(`Soft-deleted ${toSoftDelete.length} placeholder cluster(s).`);

  const clusterIdsByName: Record<string, string> = {};
  let inserted = 0, updated = 0;
  for (const c of newClusters) {
    const { data: match, error: lookupErr } = await supabase
      .from('clusters')
      .select('id')
      .eq('name', c.name)
      .is('deleted_at', null)
      .maybeSingle();
    if (lookupErr) throw new Error(`Lookup cluster ${c.name}: ${lookupErr.message}`);

    if (match) {
      const { error } = await supabase
        .from('clusters')
        .update({ center_lat: c.lat, center_lng: c.lng, zoom: c.zoom })
        .eq('id', match.id);
      if (error) throw new Error(`Update cluster ${c.name}: ${error.message}`);
      clusterIdsByName[c.name] = match.id;
      updated += 1;
    } else {
      const { data, error } = await supabase
        .from('clusters')
        .insert({ name: c.name, center_lat: c.lat, center_lng: c.lng, zoom: c.zoom })
        .select('id')
        .single();
      if (error || !data) throw new Error(`Insert cluster ${c.name}: ${error?.message}`);
      clusterIdsByName[c.name] = data.id;
      inserted += 1;
    }
  }
  console.log(`Clusters: inserted ${inserted}, updated ${updated}.`);

  const fallbackId = clusterIdsByName[FALLBACK_CLUSTER_NAME];
  if (!fallbackId) throw new Error(`Fallback cluster "${FALLBACK_CLUSTER_NAME}" missing.`);

  const protectedNucleusIds = new Set([TEST_IDS.nucleusId, TEST_IDS.nucleus2Id]);
  const { data: nuclei, error: nucleiErr } = await supabase
    .from('nuclei')
    .select('id, name, lat, lng, cluster_id, deleted_at')
    .is('deleted_at', null);
  if (nucleiErr) throw new Error(`Fetch nuclei: ${nucleiErr.message}`);

  let reassigned = 0, fallback = 0, unchanged = 0, skipped = 0;
  for (const n of nuclei ?? []) {
    if (protectedNucleusIds.has(n.id)) {
      skipped += 1;
      continue;
    }
    const point: LngLat = [n.lng, n.lat];
    const matched = newClusters.find((c) => pointInFeature(point, c.feature));
    const targetId = matched ? clusterIdsByName[matched.name] : fallbackId;
    if (!matched) fallback += 1;
    if (targetId === n.cluster_id) {
      unchanged += 1;
      continue;
    }
    const { error } = await supabase
      .from('nuclei')
      .update({ cluster_id: targetId })
      .eq('id', n.id);
    if (error) throw new Error(`Reassign nucleus ${n.id}: ${error.message}`);
    reassigned += 1;
    console.log(
      `  ${n.name} (${n.lat.toFixed(3)}, ${n.lng.toFixed(3)}) → ${matched?.name ?? FALLBACK_CLUSTER_NAME}`,
    );
  }
  console.log(
    `Nuclei: reassigned ${reassigned}, unchanged ${unchanged}, fallback-to-removed ${fallback}, test-fixtures-skipped ${skipped}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
