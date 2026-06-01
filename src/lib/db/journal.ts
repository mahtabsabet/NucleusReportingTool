import { supabase } from '../supabase';
import type {
  JournalEntry,
  JournalEntrySource,
  LearningTheme,
  LearningThemeStatus,
} from '../../types';

// Highlighter palette — see ThemeTag.tsx for the actual color
// stops. The DB allows free-form values; this list is what the UI
// presents in the "propose new theme" picker.
export const THEME_COLORS = [
  'amber',
  'green',
  'red',
  'blue',
  'purple',
  'pink',
] as const;
export type ThemeColor = (typeof THEME_COLORS)[number];


// ─── Row mappers ─────────────────────────────────────────────

function mapTheme(row: any): LearningTheme {
  return {
    id: row.id,
    nucleusId: row.nucleus_id,
    clusterThemeId: row.cluster_theme_id ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    color: row.color ?? 'amber',
    status: row.status as LearningThemeStatus,
    proposedBy: row.proposed_by ?? undefined,
    proposedAt: new Date(row.proposed_at),
    promotedAt: row.promoted_at ? new Date(row.promoted_at) : undefined,
    mergedIntoId: row.merged_into_id ?? undefined,
    pushedFromCluster: row.pushed_from_cluster ?? false,
  };
}

function mapEntry(row: any): JournalEntry {
  const themes: LearningTheme[] = Array.isArray(row.journal_entry_themes)
    ? row.journal_entry_themes
        .map((j: any) => (j.learning_themes ? mapTheme(j.learning_themes) : null))
        .filter((t: LearningTheme | null): t is LearningTheme => t !== null)
    : [];
  const attendees: { id: string; name: string }[] = Array.isArray(row.journal_entry_attendance)
    ? row.journal_entry_attendance
        .map((a: any) =>
          a.persons ? { id: a.persons.id, name: a.persons.name } : null,
        )
        .filter((p: { id: string; name: string } | null): p is { id: string; name: string } => p !== null)
        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))
    : [];
  return {
    id: row.id,
    nucleusId: row.nucleus_id ?? undefined,
    nucleusName: row.nuclei?.name ?? undefined,
    source: row.source as JournalEntrySource,
    activityId: row.activity_id ?? undefined,
    activityName: row.activities?.name ?? undefined,
    clusterId: row.cluster_id ?? undefined,
    clusterThemeId: row.cluster_theme_id ?? undefined,
    authorId: row.author_id ?? undefined,
    authorName: row.author?.name ?? undefined,
    occurredAt: new Date(row.occurred_at),
    createdAt: new Date(row.created_at),
    editedAt: row.edited_at ? new Date(row.edited_at) : undefined,
    editedByName: row.editor?.name ?? undefined,
    whatHappened: row.what_happened ?? undefined,
    learning: row.learning ?? undefined,
    encouragingSigns: row.encouraging_signs ?? undefined,
    challenges: row.challenges ?? undefined,
    peopleEmerging: row.people_emerging ?? undefined,
    followUp: row.follow_up ?? undefined,
    body: row.body ?? undefined,
    themes,
    attendees,
  };
}

// Two aliased joins on profiles so we can render both "written by"
// and "last edited by" without a second round-trip.
const ENTRY_SELECT = `
  id, nucleus_id, source, activity_id, cluster_id, cluster_theme_id,
  author_id, occurred_at, created_at, edited_at, edited_by,
  what_happened, learning, encouraging_signs, challenges, people_emerging, follow_up, body,
  activities ( name ),
  nuclei ( name ),
  author:profiles!journal_entries_author_id_fkey ( name ),
  editor:profiles!journal_entries_edited_by_fkey ( name ),
  journal_entry_themes (
    learning_themes ( id, nucleus_id, cluster_theme_id, name, description, color, status, proposed_by, proposed_at, promoted_at, merged_into_id, pushed_from_cluster )
  ),
  journal_entry_attendance (
    persons ( id, name )
  )
`;


// ─── Themes ──────────────────────────────────────────────────

export async function listThemesForNucleus(
  nucleusId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<LearningTheme[]> {
  let q = supabase
    .from('learning_themes')
    .select('*, journal_entry_themes(count)')
    .eq('nucleus_id', nucleusId)
    .order('status', { ascending: true })
    .order('name', { ascending: true });
  if (!opts.includeArchived) q = q.neq('status', 'archived');
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const theme = mapTheme(row);
    const count = Array.isArray(row.journal_entry_themes) && row.journal_entry_themes.length > 0
      ? Number(row.journal_entry_themes[0]?.count ?? 0)
      : 0;
    theme.entryCount = count;
    return theme;
  });
}

// Cluster themes that sibling nuclei in the same cluster are
// already learning about, EXCLUDING the ones this nucleus already
// carries. Used to nudge a nucleus toward an existing Object of
// Learning before it invents a near-duplicate.
export async function listSiblingClusterThemeSuggestions(
  nucleusId: string,
): Promise<{ id: string; name: string; description?: string; color: string }[]> {
  const { data: nucleus } = await supabase
    .from('nuclei')
    .select('cluster_id')
    .eq('id', nucleusId)
    .single();
  const clusterId = (nucleus as any)?.cluster_id;
  if (!clusterId) return [];

  const { data: themes } = await supabase
    .from('cluster_themes')
    .select('id, name, description, color')
    .eq('cluster_id', clusterId)
    .is('archived_at', null)
    .order('name');

  // Drop any cluster theme this nucleus already has a local copy of.
  const { data: mine } = await supabase
    .from('learning_themes')
    .select('cluster_theme_id')
    .eq('nucleus_id', nucleusId);
  const have = new Set((mine ?? []).map((r: any) => r.cluster_theme_id).filter(Boolean));

  return (themes ?? [])
    .filter((t: any) => !have.has(t.id))
    .map((t: any) => ({ id: t.id, name: t.name, description: t.description ?? undefined, color: t.color }));
}

export async function proposeTheme(
  nucleusId: string,
  params: { name: string; color: string; description?: string },
): Promise<LearningTheme> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('learning_themes')
    .insert({
      nucleus_id: nucleusId,
      name: params.name.trim(),
      color: params.color,
      description: params.description?.trim() || null,
      status: 'emerging',
      proposed_by: user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapTheme(data);
}

export async function createEstablishedTheme(
  nucleusId: string,
  params: { name: string; color: string; description?: string },
): Promise<LearningTheme> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('learning_themes')
    .insert({
      nucleus_id: nucleusId,
      name: params.name.trim(),
      color: params.color,
      description: params.description?.trim() || null,
      status: 'established',
      proposed_by: user?.id ?? null,
      promoted_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapTheme(data);
}

export async function promoteTheme(themeId: string): Promise<void> {
  const { error } = await supabase
    .from('learning_themes')
    .update({ status: 'established', promoted_at: new Date().toISOString() })
    .eq('id', themeId);
  if (error) throw error;
}

export async function renameTheme(themeId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('learning_themes')
    .update({ name: name.trim() })
    .eq('id', themeId);
  if (error) throw error;
}

export async function archiveTheme(themeId: string): Promise<void> {
  const { error } = await supabase
    .from('learning_themes')
    .update({ status: 'archived' })
    .eq('id', themeId);
  if (error) throw error;
}

// Restore an archived nucleus theme back to established.
export async function unarchiveTheme(themeId: string): Promise<void> {
  const { error } = await supabase
    .from('learning_themes')
    .update({ status: 'established' })
    .eq('id', themeId);
  if (error) throw error;
}

// Re-point every entry tagged with `sourceId` onto `targetId`, then
// mark the source archived with merged_into_id set. Tag pairs that
// would collide (entry already tagged with target) are dropped.
export async function mergeThemes(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) return;

  const { data: sourceTags, error: tagErr } = await supabase
    .from('journal_entry_themes')
    .select('entry_id')
    .eq('theme_id', sourceId);
  if (tagErr) throw tagErr;

  const { data: targetTags, error: targetErr } = await supabase
    .from('journal_entry_themes')
    .select('entry_id')
    .eq('theme_id', targetId);
  if (targetErr) throw targetErr;
  const alreadyTagged = new Set((targetTags ?? []).map((t: any) => t.entry_id));

  const toInsert = (sourceTags ?? [])
    .map((t: any) => t.entry_id)
    .filter((id: string) => !alreadyTagged.has(id))
    .map((entry_id: string) => ({ entry_id, theme_id: targetId }));

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase
      .from('journal_entry_themes')
      .insert(toInsert);
    if (insErr) throw insErr;
  }

  const { error: delErr } = await supabase
    .from('journal_entry_themes')
    .delete()
    .eq('theme_id', sourceId);
  if (delErr) throw delErr;

  const { error: archErr } = await supabase
    .from('learning_themes')
    .update({ status: 'archived', merged_into_id: targetId })
    .eq('id', sourceId);
  if (archErr) throw archErr;
}


// ─── Entries ─────────────────────────────────────────────────

export interface NewActivityEntry {
  whatHappened?: string;
  learning?: string;
  themeIds: string[];
  // Person IDs checked as attending this occurrence.
  attendeeIds: string[];
}

export interface NewNucleusEntry {
  body: string;
  themeIds: string[];
}

export async function listEntriesForActivity(activityId: string): Promise<JournalEntry[]> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select(ENTRY_SELECT)
    .eq('activity_id', activityId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapEntry);
}

// Default Nucleus Journal feed: nucleus-level entries only,
// chronological. The two-page layout shows activity entries only
// when filtered by a theme via listEntriesByTheme.
export async function listNucleusJournalEntries(nucleusId: string): Promise<JournalEntry[]> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select(ENTRY_SELECT)
    .eq('nucleus_id', nucleusId)
    .eq('source', 'nucleus')
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapEntry);
}

// Theme-filtered feed across both activity and nucleus entries in
// this nucleus. Used when a user clicks a theme on the journal's
// right page.
export async function listEntriesByTheme(
  nucleusId: string,
  themeId: string,
): Promise<JournalEntry[]> {
  const { data, error } = await supabase
    .from('journal_entry_themes')
    .select(`entry_id, journal_entries!inner ( ${ENTRY_SELECT} )`)
    .eq('theme_id', themeId)
    .eq('journal_entries.nucleus_id', nucleusId)
    .order('journal_entries(occurred_at)', { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .map((row: any) => row.journal_entries)
    .filter(Boolean)
    .map(mapEntry);
}

export async function createActivityEntry(
  nucleusId: string,
  activityId: string,
  entry: NewActivityEntry,
): Promise<JournalEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('journal_entries')
    .insert({
      nucleus_id: nucleusId,
      source: 'activity',
      activity_id: activityId,
      author_id: user?.id ?? null,
      what_happened: entry.whatHappened?.trim() || null,
      learning: entry.learning?.trim() || null,
    })
    .select(ENTRY_SELECT)
    .single();
  if (error) throw error;

  if (entry.themeIds.length > 0) {
    const { error: tagErr } = await supabase
      .from('journal_entry_themes')
      .insert(entry.themeIds.map(theme_id => ({ entry_id: (data as any).id, theme_id })));
    if (tagErr) throw tagErr;
  }

  if (entry.attendeeIds.length > 0) {
    const { error: attErr } = await supabase
      .from('journal_entry_attendance')
      .insert(entry.attendeeIds.map(person_id => ({ entry_id: (data as any).id, person_id })));
    if (attErr) throw attErr;
  }

  // Re-fetch so the returned entry carries the attendance join we
  // just wrote (the insert above happens after the select).
  if (entry.attendeeIds.length > 0) {
    const { data: refetched } = await supabase
      .from('journal_entries')
      .select(ENTRY_SELECT)
      .eq('id', (data as any).id)
      .single();
    if (refetched) return mapEntry(refetched);
  }

  return mapEntry(data);
}

// Edit an existing activity entry. All prompt fields are optional;
// only the keys supplied are written. Stamps edited_at/edited_by.
export async function updateActivityEntry(
  entryId: string,
  patch: Partial<NewActivityEntry>,
): Promise<JournalEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  const update: Record<string, any> = {
    edited_at: new Date().toISOString(),
    edited_by: user?.id ?? null,
  };
  if (patch.whatHappened !== undefined) update.what_happened = patch.whatHappened?.trim() || null;
  if (patch.learning !== undefined)     update.learning      = patch.learning?.trim() || null;

  const { data, error } = await supabase
    .from('journal_entries')
    .update(update)
    .eq('id', entryId)
    .select(ENTRY_SELECT)
    .single();
  if (error) throw error;

  // Replace the attendance set when the edit supplied one. Delete-
  // then-insert keeps the join in sync with the checkboxes the user
  // left ticked, including clearing it to empty.
  if (patch.attendeeIds !== undefined) {
    const { error: delErr } = await supabase
      .from('journal_entry_attendance')
      .delete()
      .eq('entry_id', entryId);
    if (delErr) throw delErr;
    if (patch.attendeeIds.length > 0) {
      const { error: insErr } = await supabase
        .from('journal_entry_attendance')
        .insert(patch.attendeeIds.map(person_id => ({ entry_id: entryId, person_id })));
      if (insErr) throw insErr;
    }
    const { data: refetched } = await supabase
      .from('journal_entries')
      .select(ENTRY_SELECT)
      .eq('id', entryId)
      .single();
    if (refetched) return mapEntry(refetched);
  }

  return mapEntry(data);
}

export async function updateNucleusEntry(
  entryId: string,
  body: string,
): Promise<JournalEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('journal_entries')
    .update({
      body: body.trim(),
      edited_at: new Date().toISOString(),
      edited_by: user?.id ?? null,
    })
    .eq('id', entryId)
    .select(ENTRY_SELECT)
    .single();
  if (error) throw error;
  return mapEntry(data);
}

// Idempotent: silently skips any theme already tagged.
export async function addThemesToEntry(entryId: string, themeIds: string[]): Promise<void> {
  if (themeIds.length === 0) return;
  const { error } = await supabase
    .from('journal_entry_themes')
    .upsert(
      themeIds.map(theme_id => ({ entry_id: entryId, theme_id })),
      { onConflict: 'entry_id,theme_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function removeThemeFromEntry(entryId: string, themeId: string): Promise<void> {
  const { error } = await supabase
    .from('journal_entry_themes')
    .delete()
    .eq('entry_id', entryId)
    .eq('theme_id', themeId);
  if (error) throw error;
}

export async function createNucleusEntry(
  nucleusId: string,
  entry: NewNucleusEntry,
): Promise<JournalEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('journal_entries')
    .insert({
      nucleus_id: nucleusId,
      source: 'nucleus',
      author_id: user?.id ?? null,
      body: entry.body.trim(),
    })
    .select(ENTRY_SELECT)
    .single();
  if (error) throw error;

  if (entry.themeIds.length > 0) {
    const { error: tagErr } = await supabase
      .from('journal_entry_themes')
      .insert(entry.themeIds.map(theme_id => ({ entry_id: (data as any).id, theme_id })));
    if (tagErr) throw tagErr;
  }

  return mapEntry(data);
}
