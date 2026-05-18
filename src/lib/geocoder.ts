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

// Address fallbacks for Nominatim lookups that miss on the first
// pass. Both kinds of unit reference confuse Nominatim's address
// parser to varying degrees; stripping either off the *query* (never
// the stored address — we just send a simpler string to the
// geocoder) usually recovers the building. The original
// address_line in the database is left intact.
//
// Prefix:  "1602-1025 5 Ave SW"            → "1025 5 Ave SW"
//          "M403-1919 University Dr NW"    → "1919 University Dr NW"
//          "a-606 25 Ave NE"               → "606 25 Ave NE"
//          "116a-3730 50 St NW"            → "3730 50 St NW"
// Suffix:  "80 Galbraith Dr SW Ste 36"     → "80 Galbraith Dr SW"
//          "20 14 St NW Unit B"            → "20 14 St NW"
//          "123 Main St #5"                → "123 Main St"
const UNIT_PREFIX = /^[A-Za-z0-9]+\s*[-/]\s*(?=\d)/;
const UNIT_SUFFIX = /\s+(?:ste|suite|unit|apt|#)\s*[A-Za-z0-9]+\s*$/i;

// Exported for unit testing. Returns query variants to try when
// the original address misses on the first geocoder pass.
export function _buildGeocoderFallbacks(address: string): string[] {
  const out: string[] = [];
  const noPrefix = address.replace(UNIT_PREFIX, '');
  if (noPrefix !== address) out.push(noPrefix);
  const noSuffix = address.replace(UNIT_SUFFIX, '');
  if (noSuffix !== address) out.push(noSuffix);
  if (noPrefix !== address && noSuffix !== address) {
    const noBoth = noPrefix.replace(UNIT_SUFFIX, '');
    if (noBoth !== noPrefix && noBoth !== noSuffix) out.push(noBoth);
  }
  return out;
}

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
  for (const fallback of _buildGeocoderFallbacks(trimmed)) {
    const hit = await geocodeAddress(fallback + ctx);
    if (hit) return hit;
  }
  return null;
}

export async function geocodeAddressBatchForCluster(
  addresses: string[],
  clusterName: string,
): Promise<Array<GeocodeHit | null>> {
  if (addresses.length === 0) return [];
  const ctx = contextSuffix(clusterName);
  const trimmed = addresses.map(a => a.trim());
  const first = await geocodeAddressBatch(trimmed.map(a => a + ctx));

  const out = [...first];
  // Gather one row per (missing address, fallback variant). We send
  // all the fallbacks in one batch — the edge function paces them
  // — and take the first hit for each missing slot.
  const retries: Array<{ idx: number; query: string }> = [];
  for (let i = 0; i < trimmed.length; i++) {
    if (out[i]) continue;
    for (const fallback of _buildGeocoderFallbacks(trimmed[i])) {
      retries.push({ idx: i, query: fallback + ctx });
    }
  }
  if (retries.length === 0) return out;

  const retryHits = await geocodeAddressBatch(retries.map(r => r.query));
  for (let k = 0; k < retries.length; k++) {
    const { idx } = retries[k];
    if (out[idx]) continue;
    if (retryHits[k]) out[idx] = retryHits[k];
  }
  return out;
}
