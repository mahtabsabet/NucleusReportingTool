// Data layer for cluster meeting notes — general cluster-agency /
// inter-institutional meeting notes, kept separate from the
// learning-theme system. See migration 20260812_cluster_meeting_notes.sql.

import { supabase } from '../supabase';
import type { ClusterMeetingNote } from '../../types';

function mapMeetingNote(row: any): ClusterMeetingNote {
  return {
    id: row.id,
    clusterId: row.cluster_id,
    title: row.title,
    body: row.body,
    occurredAt: new Date(row.occurred_at),
    createdAt: new Date(row.created_at),
    authorId: row.author_id ?? undefined,
    authorName: row.author?.name ?? undefined,
    editedAt: row.edited_at ? new Date(row.edited_at) : undefined,
    editedByName: row.editor?.name ?? undefined,
  };
}

const MEETING_NOTE_SELECT = `
  id, cluster_id, title, body, occurred_at, created_at, edited_at,
  author:profiles!cluster_meeting_notes_author_id_fkey ( name ),
  editor:profiles!cluster_meeting_notes_edited_by_fkey ( name )
`;

export async function listClusterMeetingNotes(clusterId: string): Promise<ClusterMeetingNote[]> {
  const { data, error } = await supabase
    .from('cluster_meeting_notes')
    .select(MEETING_NOTE_SELECT)
    .eq('cluster_id', clusterId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapMeetingNote);
}

export async function createClusterMeetingNote(
  clusterId: string,
  params: { title: string; body: string; occurredAt: Date },
): Promise<ClusterMeetingNote> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('cluster_meeting_notes')
    .insert({
      cluster_id: clusterId,
      title: params.title.trim(),
      body: params.body.trim(),
      occurred_at: params.occurredAt.toISOString(),
      author_id: user?.id ?? null,
    })
    .select(MEETING_NOTE_SELECT)
    .single();
  if (error) throw error;
  return mapMeetingNote(data);
}

export async function updateClusterMeetingNote(
  noteId: string,
  params: { title: string; body: string; occurredAt: Date },
): Promise<ClusterMeetingNote> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('cluster_meeting_notes')
    .update({
      title: params.title.trim(),
      body: params.body.trim(),
      occurred_at: params.occurredAt.toISOString(),
      edited_at: new Date().toISOString(),
      edited_by: user?.id ?? null,
    })
    .eq('id', noteId)
    .select(MEETING_NOTE_SELECT)
    .single();
  if (error) throw error;
  return mapMeetingNote(data);
}

export async function deleteClusterMeetingNote(noteId: string): Promise<void> {
  const { error } = await supabase
    .from('cluster_meeting_notes')
    .delete()
    .eq('id', noteId);
  if (error) throw error;
}
