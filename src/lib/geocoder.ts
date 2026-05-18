// ============================================================
// Client wrapper around the geocode-households edge function.
// Used by the interactive "type an address, drop a pin" UX and
// by the CSV/XLSX import flow. No direct calls to Nominatim
// happen from the browser — the edge function paces requests
// and carries the required User-Agent header.
// ============================================================

import { supabase } from './supabase';

export interface GeocodeHit {
  lat: number;
  lng: number;
  displayName: string;
}

async function invoke<T>(body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke('geocode-households', { body });
  if (error) throw new Error(error.message ?? 'Geocoder failed');
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export async function geocodeAddress(address: string): Promise<GeocodeHit | null> {
  const data = await invoke<{ result: GeocodeHit | null }>({ mode: 'single', address });
  return data.result ?? null;
}

export async function geocodeAddressBatch(
  addresses: string[],
): Promise<Array<GeocodeHit | null>> {
  if (addresses.length === 0) return [];
  const data = await invoke<{ results: Array<GeocodeHit | null> }>({
    mode: 'batch',
    addresses,
  });
  return data.results ?? [];
}


// ─── Cluster-context geocoding ────────────────────────────────
// Calgary's source spreadsheet (and most LSA address lists) gives
// us bare street addresses with no city / province / country. Sent
// as-is to Nominatim those resolve unevenly — directional suffixes
// like "SW" are Calgary-distinctive enough to land, but the
// ambiguous-sounding ones get dropped. Both of the helpers below
// take a cluster name (typically the LSA's home cluster), append
// "<cluster>, Alberta, Canada", and — if the first lookup misses
// on an address that starts with a "<unit>-<building>" prefix —
// retry once with that prefix stripped, since Nominatim handles
// those formats inconsistently. Two API calls maximum per address;
// both go through the rate-limited edge function.

const UNIT_PREFIX = /^[A-Za-z]?\d+\s*[-/]\s*/;

function contextSuffix(clusterName: string): string {
  return `, ${clusterName}, Alberta, Canada`;
}

export async function geocodeAddressForCluster(
  address: string,
  clusterName: string,
): Promise<GeocodeHit | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;
  const ctx = contextSuffix(clusterName);
  const first = await geocodeAddress(trimmed + ctx);
  if (first) return first;
  const stripped = trimmed.replace(UNIT_PREFIX, '');
  if (stripped === trimmed) return null;
  return geocodeAddress(stripped + ctx);
}

export async function geocodeAddressBatchForCluster(
  addresses: string[],
  clusterName: string,
): Promise<Array<GeocodeHit | null>> {
  if (addresses.length === 0) return [];
  const ctx = contextSuffix(clusterName);
  const trimmed = addresses.map(a => a.trim());
  const first = await geocodeAddressBatch(trimmed.map(a => a + ctx));

  const retryIdx: number[] = [];
  const retryQueries: string[] = [];
  for (let i = 0; i < trimmed.length; i++) {
    if (first[i]) continue;
    const stripped = trimmed[i].replace(UNIT_PREFIX, '');
    if (stripped === trimmed[i]) continue;
    retryIdx.push(i);
    retryQueries.push(stripped + ctx);
  }
  if (retryQueries.length === 0) return first;

  const second = await geocodeAddressBatch(retryQueries);
  const out = [...first];
  for (let j = 0; j < retryIdx.length; j++) {
    if (second[j]) out[retryIdx[j]] = second[j];
  }
  return out;
}
