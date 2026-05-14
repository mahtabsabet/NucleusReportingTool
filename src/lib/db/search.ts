import { supabase } from '../supabase';
import { searchPersonsByName } from './persons';

export interface SearchPersonResult {
  id: string;
  name: string;
  /** Short labels picked to distinguish same-name matches. */
  disambiguators: string[];
}

export interface SearchNucleusResult {
  id: string;
  name: string;
}

export interface SearchActivityResult {
  id: string;
  name: string;
  nucleusId: string;
  nucleusName: string | null;
}

export interface GlobalSearchResults {
  people: SearchPersonResult[];
  nuclei: SearchNucleusResult[];
  activities: SearchActivityResult[];
}

const PER_GROUP_LIMIT = 6;

// Escape PostgREST `ilike` wildcards so a stray % or _ in user input
// doesn't broaden the match unexpectedly.
function escapeIlike(input: string): string {
  return input.replace(/[\\%_]/g, m => `\\${m}`);
}

/**
 * Search persons, nuclei, and activities by name.
 *
 * Permission filtering is delegated to Supabase RLS — these queries return only
 * rows the current user is allowed to read, so callers don't need to (and can't)
 * see entities outside their VIEW scope.
 */
export async function globalSearch(rawQuery: string): Promise<GlobalSearchResults> {
  const query = rawQuery.trim();
  if (query.length === 0) {
    return { people: [], nuclei: [], activities: [] };
  }

  const pattern = `%${escapeIlike(query)}%`;

  // Persons use the shared `searchPersonsByName` helper so global search and
  // the activity-add combobox apply identical disambiguator rules.
  const [peopleMatches, nucleiRes, activitiesRes] = await Promise.all([
    searchPersonsByName(query, { limit: PER_GROUP_LIMIT }),
    supabase
      .from('nuclei')
      .select('id, name')
      .ilike('name', pattern)
      .is('deleted_at', null)
      .order('name')
      .limit(PER_GROUP_LIMIT),
    supabase
      .from('activities')
      .select('id, name, nucleus_id, nuclei(name)')
      .ilike('name', pattern)
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('name')
      .limit(PER_GROUP_LIMIT),
  ]);

  const people: SearchPersonResult[] = peopleMatches.map(p => ({
    id: p.id,
    name: p.name,
    disambiguators: p.disambiguators,
  }));

  const nuclei: SearchNucleusResult[] = ((nucleiRes.data ?? []) as any[]).map(n => ({
    id: n.id,
    name: n.name,
  }));

  const activities: SearchActivityResult[] = ((activitiesRes.data ?? []) as any[]).map(a => ({
    id: a.id,
    name: a.name,
    nucleusId: a.nucleus_id,
    nucleusName: a.nuclei?.name ?? null,
  }));

  return { people, nuclei, activities };
}
