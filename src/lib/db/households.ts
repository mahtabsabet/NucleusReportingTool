// ============================================================
// LSA household stewardship — data layer.
//
// Reads and writes for the privacy-walled household tables
// introduced in supabase/migrations/20260516_lsa_household_layer.sql.
// RLS is the authoritative enforcement: every non-LSA caller is
// blocked at the database, so these helpers can stay relatively
// thin. The TS-side checks in callers are about UX, not security.
// ============================================================

import { supabase } from '../supabase';
import { searchPersonsByName } from './persons';

export interface LsaJurisdiction {
  id: string;
  clusterId: string;
  name: string;
  notes: string | null;
  archivedAt: string | null;
}

export interface Household {
  id: string;
  jurisdictionId: string;
  displayName: string;
  addressLine: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HouseholdMember {
  id: string;
  householdId: string;
  linkedPersonId: string | null;
  displayName: string | null;
  relationship: string | null;
  ageGroup: string | null;
  // LSA-side contact info — distinct from any contact details on
  // the linked community-building person profile. Columns added
  // in migration 20260517_lsa_household_contact_fields.sql.
  email: string | null;
  phone: string | null;
  mobile: string | null;
  notes: string | null;
  createdAt: string;
}

export interface HouseholdWithMembers extends Household {
  members: HouseholdMember[];
}

function mapJurisdiction(row: any): LsaJurisdiction {
  return {
    id: row.id,
    clusterId: row.cluster_id,
    name: row.name,
    notes: row.notes ?? null,
    archivedAt: row.archived_at ?? null,
  };
}

function mapHousehold(row: any): Household {
  return {
    id: row.id,
    jurisdictionId: row.jurisdiction_id,
    displayName: row.display_name,
    addressLine: row.address_line ?? null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    notes: row.notes ?? null,
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMember(row: any): HouseholdMember {
  return {
    id: row.id,
    householdId: row.household_id,
    linkedPersonId: row.linked_person_id ?? null,
    displayName: row.display_name ?? null,
    relationship: row.relationship ?? null,
    ageGroup: row.age_group ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    mobile: row.mobile ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
  };
}

export async function fetchJurisdictions(
  clusterId?: string | null,
): Promise<LsaJurisdiction[]> {
  let q = supabase
    .from('lsa_jurisdictions')
    .select('id, cluster_id, name, notes, archived_at')
    .is('archived_at', null)
    .order('name');
  if (clusterId) q = q.eq('cluster_id', clusterId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapJurisdiction);
}

export async function fetchHouseholds(
  jurisdictionId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<Household[]> {
  let q = supabase
    .from('households')
    .select('*')
    .eq('jurisdiction_id', jurisdictionId);
  if (!opts.includeArchived) q = q.is('archived_at', null);
  const { data, error } = await q.order('display_name');
  if (error) throw error;
  return (data ?? []).map(mapHousehold);
}

export async function fetchHouseholdWithMembers(
  householdId: string,
): Promise<HouseholdWithMembers | null> {
  const { data: hh, error: hErr } = await supabase
    .from('households')
    .select('*')
    .eq('id', householdId)
    .maybeSingle();
  if (hErr) throw hErr;
  if (!hh) return null;

  const { data: members, error: mErr } = await supabase
    .from('household_members')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at');
  if (mErr) throw mErr;

  return { ...mapHousehold(hh), members: (members ?? []).map(mapMember) };
}

export interface CreateHouseholdParams {
  jurisdictionId: string;
  displayName: string;
  addressLine?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
}

export async function createHousehold(
  params: CreateHouseholdParams,
): Promise<Household> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('households')
    .insert({
      jurisdiction_id: params.jurisdictionId,
      display_name: params.displayName,
      address_line: params.addressLine ?? null,
      lat: params.lat ?? null,
      lng: params.lng ?? null,
      notes: params.notes ?? null,
      created_by: user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapHousehold(data);
}

export interface UpdateHouseholdParams {
  displayName?: string;
  addressLine?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
  archivedAt?: string | null;
}

export async function updateHousehold(
  householdId: string,
  params: UpdateHouseholdParams,
): Promise<Household> {
  const update: Record<string, unknown> = {};
  if (params.displayName !== undefined) update.display_name = params.displayName;
  if (params.addressLine !== undefined) update.address_line = params.addressLine;
  if (params.lat !== undefined) update.lat = params.lat;
  if (params.lng !== undefined) update.lng = params.lng;
  if (params.notes !== undefined) update.notes = params.notes;
  if (params.archivedAt !== undefined) update.archived_at = params.archivedAt;

  const { data, error } = await supabase
    .from('households')
    .update(update)
    .eq('id', householdId)
    .select('*')
    .single();
  if (error) throw error;
  return mapHousehold(data);
}

export async function archiveHousehold(householdId: string): Promise<void> {
  await updateHousehold(householdId, { archivedAt: new Date().toISOString() });
}

export async function unarchiveHousehold(householdId: string): Promise<void> {
  await updateHousehold(householdId, { archivedAt: null });
}

export interface CreateHouseholdMemberParams {
  householdId: string;
  displayName?: string | null;
  linkedPersonId?: string | null;
  relationship?: string | null;
  ageGroup?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  notes?: string | null;
}

export async function createHouseholdMember(
  params: CreateHouseholdMemberParams,
): Promise<HouseholdMember> {
  if (!params.linkedPersonId && !(params.displayName ?? '').trim()) {
    throw new Error('A household member needs either a display name or a linked profile.');
  }
  const { data, error } = await supabase
    .from('household_members')
    .insert({
      household_id: params.householdId,
      linked_person_id: params.linkedPersonId ?? null,
      display_name: params.displayName ?? null,
      relationship: params.relationship ?? null,
      age_group: params.ageGroup ?? null,
      email: params.email ?? null,
      phone: params.phone ?? null,
      mobile: params.mobile ?? null,
      notes: params.notes ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapMember(data);
}

export interface UpdateHouseholdMemberParams {
  displayName?: string | null;
  linkedPersonId?: string | null;
  relationship?: string | null;
  ageGroup?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  notes?: string | null;
}

export async function updateHouseholdMember(
  memberId: string,
  params: UpdateHouseholdMemberParams,
): Promise<HouseholdMember> {
  const update: Record<string, unknown> = {};
  if (params.displayName !== undefined) update.display_name = params.displayName;
  if (params.linkedPersonId !== undefined) update.linked_person_id = params.linkedPersonId;
  if (params.relationship !== undefined) update.relationship = params.relationship;
  if (params.ageGroup !== undefined) update.age_group = params.ageGroup;
  if (params.email !== undefined) update.email = params.email;
  if (params.phone !== undefined) update.phone = params.phone;
  if (params.mobile !== undefined) update.mobile = params.mobile;
  if (params.notes !== undefined) update.notes = params.notes;
  const { data, error } = await supabase
    .from('household_members')
    .update(update)
    .eq('id', memberId)
    .select('*')
    .single();
  if (error) throw error;
  return mapMember(data);
}

export async function deleteHouseholdMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('household_members')
    .delete()
    .eq('id', memberId);
  if (error) throw error;
}


// ─── Match suggestions ─────────────────────────────────────
// When an LSA types a display name for an unlinked household
// member, surface possible matches from the community-building
// person profiles in the same cluster. Suggestion only — the
// LSA must click "Link" to actually associate.

export interface PersonMatchSuggestion {
  personId: string;
  name: string;
  ageGroup: string | null;
  nuclei: string[];          // names of nuclei this person is enrolled in
  matchedOn: 'exact' | 'prefix' | 'substring';
}

// Normalize a display name for matching: case-fold and collapse
// internal whitespace. Diacritic-insensitive matching is left for
// later — Postgres can do it with `unaccent` but it requires the
// extension which we haven't enabled yet.
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function suggestPersonMatches(
  rawName: string,
  _jurisdictionId: string,
  opts: { limit?: number } = {},
): Promise<PersonMatchSuggestion[]> {
  const name = normalize(rawName);
  if (name.length < 2) return [];
  const limit = opts.limit ?? 8;

  // Reuse the canonical person-search helper. It already does the
  // right thing: flat ilike with wildcard escaping, separate
  // enrollment / activity fetches (no nested-select-under-RLS
  // pitfalls), and returns enriched display data we can render in
  // the suggestion list without extra queries.
  //
  // Cluster scoping is handled by RLS: the LSA's "read persons in
  // own cluster" policy already restricts visible rows to people
  // enrolled in their cluster's nuclei or in its activities.
  const matches = await searchPersonsByName(rawName, { limit: limit * 3 });

  const rank = (m: PersonMatchSuggestion['matchedOn']) =>
    m === 'exact' ? 0 : m === 'prefix' ? 1 : 2;

  return matches
    .map<PersonMatchSuggestion>(m => {
      const candidate = normalize(m.name ?? '');
      const matchedOn: PersonMatchSuggestion['matchedOn'] =
        candidate === name ? 'exact'
          : candidate.startsWith(name) ? 'prefix'
          : 'substring';
      return {
        personId: m.id,
        name: m.name,
        ageGroup: m.ageGroup ?? null,
        nuclei: m.nucleusNames,
        matchedOn,
      };
    })
    .sort((a, b) => rank(a.matchedOn) - rank(b.matchedOn) || a.name.localeCompare(b.name))
    .slice(0, limit);
}


// ─── Bulk import (CSV/XLSX) ────────────────────────────────
// Insert many households at once. Geocoding is the caller's
// responsibility (geocode-households edge function); the import
// flow shows a preview, calls the geocoder, then hands the
// coordinate-bearing rows to this function in one shot.

export interface BulkHouseholdInput {
  displayName: string;
  addressLine?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
  memberNames?: string[];     // semicolon-split, etc., by caller
}

export interface BulkImportResult {
  inserted: number;
  households: Household[];
}

export async function bulkCreateHouseholds(
  jurisdictionId: string,
  rows: BulkHouseholdInput[],
): Promise<BulkImportResult> {
  if (rows.length === 0) return { inserted: 0, households: [] };

  const { data: { user } } = await supabase.auth.getUser();
  const payload = rows.map(r => ({
    jurisdiction_id: jurisdictionId,
    display_name: r.displayName,
    address_line: r.addressLine ?? null,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    notes: r.notes ?? null,
    created_by: user?.id ?? null,
  }));

  const { data, error } = await supabase
    .from('households')
    .insert(payload)
    .select('*');
  if (error) throw error;

  const households = (data ?? []).map(mapHousehold);

  // Insert unlinked members in batches, matched back to households
  // by index — the insert above returns rows in input order.
  const memberPayload: Record<string, unknown>[] = [];
  households.forEach((h, idx) => {
    const names = (rows[idx]?.memberNames ?? [])
      .map(n => n.trim())
      .filter(Boolean);
    for (const n of names) {
      memberPayload.push({
        household_id: h.id,
        display_name: n,
      });
    }
  });
  if (memberPayload.length > 0) {
    const { error: mErr } = await supabase
      .from('household_members')
      .insert(memberPayload);
    if (mErr) throw mErr;
  }

  return { inserted: households.length, households };
}
