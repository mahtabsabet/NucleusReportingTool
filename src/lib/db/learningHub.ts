// Data layer for the Cluster Learning Hub. The Hub presents
// cluster-wide learning themes ("Objects of Learning") by
// aggregating across the nuclei that have contributed to them.
// See migration 20260520_cluster_learning_hub.sql for the schema.

import { supabase } from '../supabase';
import type {
  ClusterTheme,
  JournalEntry,
  NucleusContribution,
} from '../../types';
import { THEME_COLORS } from './journal';

function mapClusterTheme(row: any): ClusterTheme {
  return {
    id: row.id,
    clusterId: row.cluster_id,
    name: row.name,
    description: row.description ?? undefined,
    color: row.color ?? 'amber',
    consolidationLevel: row.consolidation_level ?? 0,
    createdAt: new Date(row.created_at),
    archivedAt: row.archived_at ? new Date(row.archived_at) : undefined,
    mergedIntoId: row.merged_into_id ?? undefined,
  };
}

// All non-archived themes for a cluster, with per-theme nucleus
// and entry counts. The counts are computed by joining through
// learning_themes → journal_entry_themes → journal_entries; we do
// it with two follow-up queries instead of a single complex one
// because PostgREST's aggregate-relation support is fiddly and
// the cardinalities here are tiny.
export async function listClusterThemes(
  clusterId: string,
  opts: { archived?: boolean } = {},
): Promise<ClusterTheme[]> {
  let q = supabase
    .from('cluster_themes')
    .select('*')
    .eq('cluster_id', clusterId);
  // Merged-away themes are never shown in either list.
  q = q.is('merged_into_id', null);
  q = opts.archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
  const { data: themes, error } = await q
    .order('consolidation_level', { ascending: false })
    .order('name', { ascending: true });
  if (error) throw error;
  const list = (themes ?? []).map(mapClusterTheme);
  if (list.length === 0) return list;

  // Counts per cluster theme: number of nuclei that have a
  // matching learning_theme, and number of journal entries
  // (across all sources) tagged with any of those learning_themes.
  const themeIds = list.map(t => t.id);

  const { data: links } = await supabase
    .from('learning_themes')
    .select('id, nucleus_id, cluster_theme_id')
    .in('cluster_theme_id', themeIds);

  // map cluster_theme_id → set of nucleus_id
  const nucleiByTheme = new Map<string, Set<string>>();
  // map learning_theme_id → cluster_theme_id
  const ltToCt = new Map<string, string>();
  for (const l of links ?? []) {
    const r = l as any;
    if (!r.cluster_theme_id) continue;
    if (!nucleiByTheme.has(r.cluster_theme_id)) nucleiByTheme.set(r.cluster_theme_id, new Set());
    nucleiByTheme.get(r.cluster_theme_id)!.add(r.nucleus_id);
    ltToCt.set(r.id, r.cluster_theme_id);
  }

  const ltIds = (links ?? []).map((l: any) => l.id);
  const entryCountByCt = new Map<string, number>();
  const lastEntryByCt = new Map<string, Date>();
  if (ltIds.length > 0) {
    const { data: tagRows } = await supabase
      .from('journal_entry_themes')
      .select('theme_id, journal_entries ( occurred_at )')
      .in('theme_id', ltIds);
    for (const tr of tagRows ?? []) {
      const r = tr as any;
      const ctId = ltToCt.get(r.theme_id);
      if (!ctId) continue;
      entryCountByCt.set(ctId, (entryCountByCt.get(ctId) ?? 0) + 1);
      const t = r.journal_entries?.occurred_at ? new Date(r.journal_entries.occurred_at) : null;
      if (t) {
        const cur = lastEntryByCt.get(ctId);
        if (!cur || t > cur) lastEntryByCt.set(ctId, t);
      }
    }
  }

  for (const t of list) {
    t.nucleusCount = nucleiByTheme.get(t.id)?.size ?? 0;
    t.entryCount = entryCountByCt.get(t.id) ?? 0;
    t.lastEntryAt = lastEntryByCt.get(t.id);
  }
  return list;
}

// Per-nucleus aggregation for the center column when a theme is
// selected: which nuclei have contributed entries tagged with any
// learning_theme that links to this cluster_theme, and how many.
export async function listNucleiForClusterTheme(
  clusterThemeId: string,
): Promise<NucleusContribution[]> {
  const { data: links } = await supabase
    .from('learning_themes')
    .select('id, nucleus_id, nuclei ( id, name )')
    .eq('cluster_theme_id', clusterThemeId);
  if (!links || links.length === 0) return [];

  const ltIds = (links as any[]).map(l => l.id);
  const { data: tagRows } = await supabase
    .from('journal_entry_themes')
    .select('theme_id, journal_entries ( occurred_at, nucleus_id, cluster_id )')
    .in('theme_id', ltIds);

  // Map nucleus_id → theme name + counts. We aggregate across the
  // possibly-multiple learning_themes in this nucleus that all
  // link to the same cluster theme.
  const nucleiByName = new Map<string, NucleusContribution>();
  for (const link of links as any[]) {
    if (!link.nucleus_id) continue;
    if (!nucleiByName.has(link.nucleus_id)) {
      nucleiByName.set(link.nucleus_id, {
        nucleusId: link.nucleus_id,
        nucleusName: link.nuclei?.name ?? 'Unknown',
        entryCount: 0,
      });
    }
  }
  const ltToNucleus = new Map<string, string>();
  for (const link of links as any[]) {
    ltToNucleus.set(link.id, link.nucleus_id);
  }
  for (const tr of tagRows ?? []) {
    const r = tr as any;
    const nucleusId = ltToNucleus.get(r.theme_id);
    if (!nucleusId) continue;
    const entry = nucleiByName.get(nucleusId);
    if (!entry) continue;
    entry.entryCount += 1;
    const t = r.journal_entries?.occurred_at ? new Date(r.journal_entries.occurred_at) : null;
    if (t && (!entry.lastEntryAt || t > entry.lastEntryAt)) entry.lastEntryAt = t;
  }
  // List EVERY nucleus that carries the theme, even those with no
  // tagged entries yet, so the count in the left column always
  // matches the list here. Sort by entry count desc, then name.
  return Array.from(nucleiByName.values())
    .sort((a, b) => b.entryCount - a.entryCount || a.nucleusName.localeCompare(b.nucleusName));
}

// Representative entries (most recent first, capped) for the
// center column under each selected theme. Includes both
// activity-source and nucleus-source entries.
export async function listRepresentativeEntries(
  clusterThemeId: string,
  limit = 12,
): Promise<JournalEntry[]> {
  // Find all learning_themes linked to this cluster_theme, then
  // find all journal_entries tagged with any of them.
  const { data: links } = await supabase
    .from('learning_themes')
    .select('id')
    .eq('cluster_theme_id', clusterThemeId);
  const ltIds = (links ?? []).map((l: any) => l.id);
  if (ltIds.length === 0) return [];

  const { data: tags } = await supabase
    .from('journal_entry_themes')
    .select('entry_id')
    .in('theme_id', ltIds);
  const entryIds = Array.from(new Set((tags ?? []).map((t: any) => t.entry_id)));
  if (entryIds.length === 0) return [];

  const { data: entries, error } = await supabase
    .from('journal_entries')
    .select(`
      id, nucleus_id, source, activity_id, cluster_id, author_id, occurred_at, created_at,
      what_happened, learning, encouraging_signs, challenges, people_emerging, follow_up, body,
      activities ( name ),
      nuclei ( name )
    `)
    .in('id', entryIds)
    .neq('source', 'cluster')
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (entries ?? []).map((row: any) => ({
    id: row.id,
    nucleusId: row.nucleus_id ?? undefined,
    nucleusName: row.nuclei?.name ?? undefined,
    source: row.source,
    activityId: row.activity_id ?? undefined,
    activityName: row.activities?.name ?? undefined,
    clusterId: row.cluster_id ?? undefined,
    authorId: row.author_id ?? undefined,
    occurredAt: new Date(row.occurred_at),
    createdAt: new Date(row.created_at),
    whatHappened: row.what_happened ?? undefined,
    learning: row.learning ?? undefined,
    encouragingSigns: row.encouraging_signs ?? undefined,
    challenges: row.challenges ?? undefined,
    peopleEmerging: row.people_emerging ?? undefined,
    followUp: row.follow_up ?? undefined,
    body: row.body ?? undefined,
    themes: [],
    attendees: [],
  }));
}

// Cluster-level synthesis entries (source='cluster') against a
// given cluster theme. These are the right-column entries.
export async function listSynthesisEntries(
  clusterThemeId: string,
): Promise<JournalEntry[]> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select(`
      id, cluster_id, cluster_theme_id, source, author_id, occurred_at, created_at,
      edited_at, edited_by, body,
      author:profiles!journal_entries_author_id_fkey ( name ),
      editor:profiles!journal_entries_edited_by_fkey ( name )
    `)
    .eq('cluster_theme_id', clusterThemeId)
    .eq('source', 'cluster')
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    source: 'cluster' as const,
    clusterId: row.cluster_id,
    clusterThemeId: row.cluster_theme_id ?? undefined,
    authorId: row.author_id ?? undefined,
    authorName: row.author?.name ?? undefined,
    occurredAt: new Date(row.occurred_at),
    createdAt: new Date(row.created_at),
    editedAt: row.edited_at ? new Date(row.edited_at) : undefined,
    editedByName: row.editor?.name ?? undefined,
    body: row.body ?? undefined,
    themes: [],
    attendees: [],
  }));
}

export async function createClusterTheme(
  clusterId: string,
  params: { name: string; color: string; description?: string },
): Promise<ClusterTheme> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('cluster_themes')
    .insert({
      cluster_id: clusterId,
      name: params.name.trim(),
      color: params.color,
      description: params.description?.trim() || null,
      created_by: user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapClusterTheme(data);
}

export async function updateConsolidationLevel(
  themeId: string,
  level: number,
): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(level)));
  const { error } = await supabase
    .from('cluster_themes')
    .update({ consolidation_level: clamped })
    .eq('id', themeId);
  if (error) throw error;
}

// Archive a cluster theme. When `notifyNuclei` is true, post a
// short journal entry into every nucleus that carries the theme,
// tagged with that nucleus's local copy, explaining that the
// cluster is no longer tracking it. The nucleus-level themes are
// intentionally left in place — the nuclei keep their own learning.
export async function archiveClusterTheme(
  theme: ClusterTheme,
  opts: { notifyNuclei?: boolean } = {},
): Promise<void> {
  const { error } = await supabase
    .from('cluster_themes')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', theme.id);
  if (error) throw error;

  if (!opts.notifyNuclei) return;

  const { data: links } = await supabase
    .from('learning_themes')
    .select('id, nucleus_id')
    .eq('cluster_theme_id', theme.id);
  if (!links || links.length === 0) return;

  const { data: { user } } = await supabase.auth.getUser();
  const body =
    `This Object of Learning ("${theme.name}") is no longer being tracked at the cluster level. ` +
    `If you think it should be, please let a member of the cluster agencies know.`;
  const entryRows = (links as any[]).map(l => ({
    nucleus_id: l.nucleus_id,
    source: 'nucleus',
    author_id: user?.id ?? null,
    body,
    cluster_archive_notice_for: theme.id,
  }));
  const { data: entries, error: entryErr } = await supabase
    .from('journal_entries')
    .insert(entryRows)
    .select('id, nucleus_id');
  if (entryErr) throw entryErr;

  const tagRows: { entry_id: string; theme_id: string }[] = [];
  for (const e of (entries as any[]) ?? []) {
    const lt = (links as any[]).find(l => l.nucleus_id === e.nucleus_id);
    if (lt) tagRows.push({ entry_id: e.id, theme_id: lt.id });
  }
  if (tagRows.length > 0) {
    const { error: tagErr } = await supabase.from('journal_entry_themes').insert(tagRows);
    if (tagErr) throw tagErr;
  }
}

export async function unarchiveClusterTheme(themeId: string): Promise<void> {
  const { error } = await supabase
    .from('cluster_themes')
    .update({ archived_at: null })
    .eq('id', themeId);
  if (error) throw error;
  // Withdraw any "no longer tracked at the cluster level" notes that
  // were posted to nuclei when the theme was archived. Their tag rows
  // cascade away with the entry.
  const { error: delErr } = await supabase
    .from('journal_entries')
    .delete()
    .eq('cluster_archive_notice_for', themeId);
  if (delErr) throw delErr;
}

// Nucleus ids (and names) that currently carry a local copy of a
// cluster theme — used to grey out already-having nuclei in the
// "share theme" dialog and to populate "send this note to…".
export async function listNucleiWithTheme(
  clusterThemeId: string,
): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase
    .from('learning_themes')
    .select('nucleus_id, nuclei ( name )')
    .eq('cluster_theme_id', clusterThemeId);
  const seen = new Map<string, string>();
  for (const r of (data ?? []) as any[]) {
    if (r.nucleus_id && !seen.has(r.nucleus_id)) {
      seen.set(r.nucleus_id, r.nuclei?.name ?? 'Unknown');
    }
  }
  return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Send a single note (a representative entry or a cluster-synthesis
// reflection) into a nucleus that already carries the theme. Creates
// a nucleus journal entry quoting the note and tags it with the
// nucleus's local copy of the theme. Throws if the nucleus doesn't
// already have the theme (the caller should only offer eligible
// nuclei, but we guard server-side too).
export async function sendNoteToNucleus(
  clusterThemeId: string,
  nucleusId: string,
  noteBody: string,
  attribution: string,
): Promise<void> {
  const { data: lt } = await supabase
    .from('learning_themes')
    .select('id')
    .eq('cluster_theme_id', clusterThemeId)
    .eq('nucleus_id', nucleusId)
    .limit(1)
    .maybeSingle();
  if (!lt) throw new Error('That nucleus does not carry this Object of Learning yet.');

  const { data: { user } } = await supabase.auth.getUser();
  const body = `Shared from the cluster Learning Hub (${attribution}):\n\n${noteBody.trim()}`;
  const { data: entry, error } = await supabase
    .from('journal_entries')
    .insert({ nucleus_id: nucleusId, source: 'nucleus', author_id: user?.id ?? null, body })
    .select('id')
    .single();
  if (error) throw error;
  const { error: tagErr } = await supabase
    .from('journal_entry_themes')
    .insert({ entry_id: (entry as any).id, theme_id: (lt as any).id });
  if (tagErr) throw tagErr;
}

// Merge `sourceId` into `targetId`, unifying the name everywhere.
//   • Every nucleus learning_theme linked to source is re-pointed
//     to target and renamed to `finalName`. Where a nucleus already
//     has a learning_theme under target, the source copy's entry
//     tags are moved onto the target copy and the source copy is
//     deleted (avoids the unique(nucleus_id, name) collision).
//   • Cluster synthesis entries on source move to target.
//   • The target cluster_theme is renamed to finalName; source is
//     archived and marked merged_into target.
export async function mergeClusterThemes(
  sourceId: string,
  targetId: string,
  finalName: string,
): Promise<void> {
  if (sourceId === targetId) return;
  const name = finalName.trim();

  // Local copies of each cluster theme, keyed by nucleus.
  const { data: srcLts } = await supabase
    .from('learning_themes')
    .select('id, nucleus_id')
    .eq('cluster_theme_id', sourceId);
  const { data: tgtLts } = await supabase
    .from('learning_themes')
    .select('id, nucleus_id')
    .eq('cluster_theme_id', targetId);
  const tgtByNucleus = new Map<string, string>();
  for (const r of (tgtLts ?? []) as any[]) tgtByNucleus.set(r.nucleus_id, r.id);

  for (const src of (srcLts ?? []) as any[]) {
    const existingTgt = tgtByNucleus.get(src.nucleus_id);
    if (existingTgt) {
      // Move this source copy's entry tags onto the target copy,
      // skipping pairs that already exist, then delete the source.
      const { data: srcTags } = await supabase
        .from('journal_entry_themes')
        .select('entry_id')
        .eq('theme_id', src.id);
      const { data: tgtTags } = await supabase
        .from('journal_entry_themes')
        .select('entry_id')
        .eq('theme_id', existingTgt);
      const already = new Set((tgtTags ?? []).map((t: any) => t.entry_id));
      const moves = (srcTags ?? [])
        .map((t: any) => t.entry_id)
        .filter((eid: string) => !already.has(eid))
        .map((entry_id: string) => ({ entry_id, theme_id: existingTgt }));
      if (moves.length > 0) {
        await supabase.from('journal_entry_themes').insert(moves);
      }
      await supabase.from('journal_entry_themes').delete().eq('theme_id', src.id);
      await supabase.from('learning_themes').delete().eq('id', src.id);
    } else {
      // No collision: just re-point + rename the source local copy.
      await supabase
        .from('learning_themes')
        .update({ cluster_theme_id: targetId, name })
        .eq('id', src.id);
    }
  }

  // Rename any remaining target local copies to the unified name.
  await supabase
    .from('learning_themes')
    .update({ name })
    .eq('cluster_theme_id', targetId);

  // Cluster synthesis entries move from source to target.
  await supabase
    .from('journal_entries')
    .update({ cluster_theme_id: targetId })
    .eq('cluster_theme_id', sourceId)
    .eq('source', 'cluster');

  // Rename the surviving cluster theme; archive + flag the source.
  await supabase.from('cluster_themes').update({ name }).eq('id', targetId);
  await supabase
    .from('cluster_themes')
    .update({ merged_into_id: targetId, archived_at: new Date().toISOString() })
    .eq('id', sourceId);
}

// Cluster coordinator writes a new synthesis note against a
// specific theme. Always source='cluster'.
export async function createSynthesisEntry(
  clusterId: string,
  clusterThemeId: string,
  body: string,
): Promise<JournalEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('journal_entries')
    .insert({
      source: 'cluster',
      cluster_id: clusterId,
      cluster_theme_id: clusterThemeId,
      author_id: user?.id ?? null,
      body: body.trim(),
    })
    .select('id')
    .single();
  if (error) throw error;
  const out = (await listSynthesisEntries(clusterThemeId)).find(e => e.id === (data as any).id);
  if (!out) throw new Error('Entry inserted but not returned');
  return out;
}

// Edit an existing synthesis reflection. Stamps edited_at/edited_by.
export async function updateSynthesisEntry(
  entryId: string,
  body: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('journal_entries')
    .update({
      body: body.trim(),
      edited_at: new Date().toISOString(),
      edited_by: user?.id ?? null,
    })
    .eq('id', entryId);
  if (error) throw error;
}

// Delete a synthesis reflection outright. Gated by the "Delete own
// entries or as curator" RLS policy's cluster branch.
export async function deleteSynthesisEntry(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('journal_entries')
    .delete()
    .eq('id', entryId);
  if (error) throw error;
}

// Push a cluster theme down to selected nuclei. For each nucleus
// that does NOT yet have a learning_theme linked to this cluster
// theme, we create one (status='established') and — when the
// optional `note` is supplied — seed a nucleus journal entry that
// quotes the note and is auto-tagged with that new theme.
//
// Returns the count of nuclei that received the theme (some may
// be skipped if they already carry it).
export async function pushThemeToNuclei(
  clusterTheme: ClusterTheme,
  nucleusIds: string[],
  note: string | undefined,
): Promise<{ pushed: number; skipped: number }> {
  if (nucleusIds.length === 0) return { pushed: 0, skipped: 0 };
  const { data: { user } } = await supabase.auth.getUser();

  // Which of the requested nuclei already have a learning_theme
  // linked to this cluster theme? Skip those — re-pushing would
  // create duplicate journal entries.
  const { data: existing } = await supabase
    .from('learning_themes')
    .select('nucleus_id')
    .eq('cluster_theme_id', clusterTheme.id)
    .in('nucleus_id', nucleusIds);
  const haveIt = new Set((existing ?? []).map((r: any) => r.nucleus_id));
  const targets = nucleusIds.filter(id => !haveIt.has(id));
  if (targets.length === 0) return { pushed: 0, skipped: nucleusIds.length };

  // Create one learning_theme per target. The auto-link trigger
  // will reuse the existing cluster_theme_id when name matches.
  const ltRows = targets.map(nucleus_id => ({
    nucleus_id,
    cluster_theme_id: clusterTheme.id,
    name: clusterTheme.name,
    color: clusterTheme.color,
    description: clusterTheme.description ?? null,
    status: 'established',
    pushed_from_cluster: true,
    proposed_by: user?.id ?? null,
    promoted_at: new Date().toISOString(),
  }));
  const { data: insertedThemes, error: ltErr } = await supabase
    .from('learning_themes')
    .insert(ltRows)
    .select('id, nucleus_id');
  if (ltErr) throw ltErr;

  // Seed nucleus-journal entries if a note was supplied. The body
  // is prefixed so it's clear where the entry came from.
  if (note && note.trim().length > 0 && insertedThemes && insertedThemes.length > 0) {
    const intro = `From the cluster Learning Hub:\n\n${note.trim()}`;
    const entryRows = (insertedThemes as any[]).map(t => ({
      nucleus_id: t.nucleus_id,
      source: 'nucleus',
      author_id: user?.id ?? null,
      body: intro,
    }));
    const { data: entries, error: entryErr } = await supabase
      .from('journal_entries')
      .insert(entryRows)
      .select('id, nucleus_id');
    if (entryErr) throw entryErr;

    // Tag each entry with the nucleus's freshly created learning_theme.
    const tagRows: { entry_id: string; theme_id: string }[] = [];
    for (const e of (entries as any[]) ?? []) {
      const lt = (insertedThemes as any[]).find(t => t.nucleus_id === e.nucleus_id);
      if (lt) tagRows.push({ entry_id: e.id, theme_id: lt.id });
    }
    if (tagRows.length > 0) {
      const { error: tagErr } = await supabase
        .from('journal_entry_themes')
        .insert(tagRows);
      if (tagErr) throw tagErr;
    }
  }

  return { pushed: targets.length, skipped: nucleusIds.length - targets.length };
}

export async function listNucleiInCluster(
  clusterId: string,
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('nuclei')
    .select('id, name')
    .eq('cluster_id', clusterId)
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ id: r.id, name: r.name }));
}

export { THEME_COLORS };
