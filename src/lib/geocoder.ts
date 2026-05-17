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
