// ============================================================
// geocode-households — server-side OSM Nominatim proxy.
//
// LSAs need to turn a list of address strings into lat/lng pairs
// without hitting an external geocoder from the browser (CORS,
// rate-limit attribution, and exposing call patterns to a third
// party are all undesirable). This function runs the lookups
// server-side, paces them at Nominatim's required 1 req/sec, and
// hands the caller back a coordinate-bearing row per input.
//
// Two modes:
//   * { mode: 'single', address: string } — for interactive
//     "type an address, drop a pin" UX. Returns at most one match.
//   * { mode: 'batch',  addresses: string[] } — for CSV/XLSX
//     import. Returns one result per input, in input order.
//
// AUTH: the caller must have a current Supabase session AND
// either be a Super Admin or hold an lsa_member grant. We do not
// otherwise vet the addresses — they're going to a public API.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
// Nominatim's usage policy requires a meaningful User-Agent that
// identifies the application + a contact route. Override via env
// (NOMINATIM_USER_AGENT) if you fork or deploy a separate brand.
const USER_AGENT =
  Deno.env.get('NOMINATIM_USER_AGENT')
  ?? 'NucleusReportingTool-LSA/1.0 (https://github.com/mahtabsabet/NucleusReportingTool)';
const MIN_INTERVAL_MS = 1100;     // Nominatim: <= 1 req/sec.

interface GeocodeHit {
  lat: number;
  lng: number;
  displayName: string;
}

async function geocodeOne(address: string): Promise<GeocodeHit | null> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('q', address);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '0');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
  });
  if (!res.ok) return null;
  const arr = await res.json();
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const hit = arr[0];
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, displayName: String(hit.display_name ?? address) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user: caller }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !caller) return json({ error: 'Unauthorized' }, 401);

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_super_admin')
      .eq('id', caller.id)
      .single();
    const isSuper = (profile as any)?.is_super_admin === true;

    let isLsa = false;
    if (!isSuper) {
      const { data: perms } = await supabaseAdmin
        .from('user_permissions')
        .select('id')
        .eq('user_id', caller.id)
        .eq('role', 'lsa_member')
        .limit(1);
      isLsa = !!(perms && perms.length > 0);
    }
    if (!isSuper && !isLsa) return json({ error: 'LSA access required' }, 403);

    const body = await req.json().catch(() => ({}));
    const { mode } = body ?? {};

    if (mode === 'single') {
      const address = String(body.address ?? '').trim();
      if (!address) return json({ error: 'address required' }, 400);
      const hit = await geocodeOne(address);
      return json({ result: hit });
    }

    if (mode === 'batch') {
      const raw = body.addresses;
      if (!Array.isArray(raw)) return json({ error: 'addresses must be an array' }, 400);
      if (raw.length > 100) return json({ error: 'Batch limited to 100 addresses' }, 400);
      const addresses = raw.map((a: unknown) => String(a ?? '').trim());

      const results: Array<GeocodeHit | null> = [];
      let last = 0;
      for (const a of addresses) {
        if (!a) { results.push(null); continue; }
        const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - last));
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        last = Date.now();
        try {
          results.push(await geocodeOne(a));
        } catch {
          results.push(null);
        }
      }
      return json({ results });
    }

    return json({ error: "mode must be 'single' or 'batch'" }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
