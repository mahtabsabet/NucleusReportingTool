import { supabase } from '../supabase';
import type {
  TimelineCycle,
  TimelineEvent,
  TimelineItemNote,
  TimelineItemNoteKind,
  TimelineItemType,
} from '../../types';

// Date columns in this module are Postgres `date` (calendar date, no time
// zone). We MUST NOT round-trip them through the Date object's UTC view —
// `new Date('2026-05-02')` parses ISO date-only strings as UTC midnight,
// which renders as the previous day in any negative-UTC zone, and
// `Date.toISOString()` shifts a local-midnight Date the other way for
// positive zones. The helpers below treat the wire format as a local
// calendar date in both directions, which is what callers (and the user)
// actually mean when they pick a date.

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// The columns we select for every timeline item. Listed in one constant
// so insert/update/select queries stay in sync as new fields are added.
const TIMELINE_ITEM_COLUMNS =
  'id, name, start_date, end_date, cluster_id, nucleus_id, location, ' +
  'item_type, start_time, meeting_type, attendees, created_by, created_at';

function mapTimelineItem(row: any): TimelineEvent {
  return {
    id: row.id,
    itemType: (row.item_type as TimelineItemType) ?? 'event',
    name: row.name,
    startDate: parseLocalDate(row.start_date),
    endDate: row.end_date ? parseLocalDate(row.end_date) : undefined,
    startTime: row.start_time ?? undefined,
    clusterId: row.cluster_id ?? undefined,
    nucleusId: row.nucleus_id ?? undefined,
    location: row.location ?? undefined,
    meetingType: row.meeting_type ?? undefined,
    attendees: (row.attendees as string[] | null) ?? [],
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
  };
}

// Returns DB-backed cycle overrides for the given cluster. The schema treats
// rows with cluster_id IS NULL as "applies to all clusters", so those are
// always included as a fallback. Callers merge this with the computed
// schedule via buildCycleSchedule (see lib/timeline/cycles.ts) — empty DB
// state must NOT block the timeline from rendering.
export async function fetchTimelineCycles(params: { clusterId?: string } = {}): Promise<TimelineCycle[]> {
  let query = supabase
    .from('timeline_cycles')
    .select('id, label, start_date, end_date, cluster_id')
    .order('start_date');
  if (params.clusterId) {
    query = query.or(`cluster_id.eq.${params.clusterId},cluster_id.is.null`);
  } else {
    query = query.is('cluster_id', null);
  }
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as any[]).map(c => ({
    id: c.id,
    label: c.label,
    startDate: parseLocalDate(c.start_date),
    endDate: parseLocalDate(c.end_date),
  }));
}

export async function fetchTimelineEvents(params: { clusterId?: string }): Promise<TimelineEvent[]> {
  let query = supabase
    .from('timeline_events')
    .select(TIMELINE_ITEM_COLUMNS)
    .order('start_date');
  if (params.clusterId) query = query.eq('cluster_id', params.clusterId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as any[]).map(mapTimelineItem);
}

export async function updateCycleBoundary(
  cycleId: string,
  startDate: Date | undefined,
  endDate: Date | undefined
): Promise<void> {
  const update: Record<string, string> = {};
  if (startDate) update.start_date = formatLocalDate(startDate);
  if (endDate) update.end_date = formatLocalDate(endDate);
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase.from('timeline_cycles').update(update).eq('id', cycleId);
  if (error) throw error;
}

// Creates a cluster-scoped override row for a cycle that has only ever
// existed as a computed default. Used the first time an admin edits a
// boundary — subsequent edits go through updateCycleBoundary by id.
export async function insertCycleOverride(params: {
  label: string;
  startDate: Date;
  endDate: Date;
  clusterId?: string | null;
}): Promise<TimelineCycle> {
  const { data, error } = await supabase
    .from('timeline_cycles')
    .insert({
      label: params.label,
      start_date: formatLocalDate(params.startDate),
      end_date: formatLocalDate(params.endDate),
      cluster_id: params.clusterId ?? null,
    })
    .select('id, label, start_date, end_date, cluster_id')
    .single();
  if (error) throw error;
  const c = data as any;
  return {
    id: c.id,
    label: c.label,
    startDate: parseLocalDate(c.start_date),
    endDate: parseLocalDate(c.end_date),
  };
}

export interface AddTimelineItemParams {
  itemType?: TimelineItemType;
  name: string;
  startDate: Date;
  endDate?: Date;
  startTime?: string;
  clusterId?: string;
  location?: string;
  meetingType?: string;
  attendees?: string[];
}

export async function addTimelineEvent(params: AddTimelineItemParams): Promise<TimelineEvent> {
  // Default to legacy "event" type so older callers that don't pass
  // itemType continue inserting events.
  const itemType: TimelineItemType = params.itemType ?? 'event';
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('timeline_events')
    .insert({
      name: params.name,
      item_type: itemType,
      start_date: formatLocalDate(params.startDate),
      end_date: params.endDate ? formatLocalDate(params.endDate) : null,
      start_time: params.startTime ?? null,
      cluster_id: params.clusterId ?? null,
      location: params.location ?? null,
      meeting_type: itemType === 'meeting' ? params.meetingType ?? null : null,
      attendees: params.attendees ?? [],
      created_by: user?.id ?? null,
    })
    .select(TIMELINE_ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return mapTimelineItem(data);
}

export interface UpdateTimelineItemParams {
  name: string;
  itemType?: TimelineItemType;
  startDate: Date;
  endDate: Date | null;
  startTime?: string | null;
  location: string | null;
  meetingType?: string | null;
  attendees?: string[];
}

export async function updateTimelineEvent(
  id: string,
  params: UpdateTimelineItemParams,
): Promise<TimelineEvent> {
  const update: Record<string, any> = {
    name: params.name,
    start_date: formatLocalDate(params.startDate),
    end_date: params.endDate ? formatLocalDate(params.endDate) : null,
    location: params.location,
  };
  if (params.itemType !== undefined) update.item_type = params.itemType;
  if (params.startTime !== undefined) update.start_time = params.startTime;
  if (params.meetingType !== undefined) update.meeting_type = params.meetingType;
  if (params.attendees !== undefined) update.attendees = params.attendees;

  const { data, error } = await supabase
    .from('timeline_events')
    .update(update)
    .eq('id', id)
    .select(TIMELINE_ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return mapTimelineItem(data);
}

export async function deleteTimelineEvent(id: string): Promise<void> {
  const { error } = await supabase.from('timeline_events').delete().eq('id', id);
  if (error) throw error;
}


// ============================================================
// Notes / documents / links attached to timeline items
// ============================================================

const NOTE_COLUMNS =
  'id, timeline_item_id, kind, title, body_text, file_path, file_name, ' +
  'file_mime, file_size_bytes, link_url, link_label, created_by, created_at';

function mapTimelineNote(row: any): TimelineItemNote {
  // Supabase returns the joined profile as either an object or an array
  // depending on how the foreign-key relationship resolved; tolerate both.
  const creator = Array.isArray(row.created_by_profile)
    ? row.created_by_profile[0]
    : row.created_by_profile;
  return {
    id: row.id,
    timelineItemId: row.timeline_item_id,
    kind: row.kind as TimelineItemNoteKind,
    title: row.title ?? undefined,
    bodyText: row.body_text ?? undefined,
    filePath: row.file_path ?? undefined,
    fileName: row.file_name ?? undefined,
    fileMime: row.file_mime ?? undefined,
    fileSizeBytes: row.file_size_bytes ?? undefined,
    linkUrl: row.link_url ?? undefined,
    linkLabel: row.link_label ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdByName: creator?.name ?? undefined,
    createdAt: new Date(row.created_at),
  };
}

export async function fetchTimelineItemNotes(itemId: string): Promise<TimelineItemNote[]> {
  // Inline-joins the creator's profile.name so the UI can show contributor
  // attribution without a follow-up round-trip. Aliased so the mapper can
  // pick it up regardless of how Supabase returns nested rows.
  const { data, error } = await supabase
    .from('timeline_item_notes')
    .select(`${NOTE_COLUMNS}, created_by_profile:profiles!created_by(name)`)
    .eq('timeline_item_id', itemId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map(mapTimelineNote);
}

export interface AddTextNoteParams {
  timelineItemId: string;
  title?: string;
  bodyText: string;
}

export async function addTextNote(params: AddTextNoteParams): Promise<TimelineItemNote> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('timeline_item_notes')
    .insert({
      timeline_item_id: params.timelineItemId,
      kind: 'text',
      title: params.title ?? null,
      body_text: params.bodyText,
      created_by: user?.id ?? null,
    })
    .select(`${NOTE_COLUMNS}, created_by_profile:profiles!created_by(name)`)
    .single();
  if (error) throw error;
  return mapTimelineNote(data);
}

export interface AddLinkNoteParams {
  timelineItemId: string;
  title?: string;
  linkUrl: string;
  linkLabel?: string;
}

export async function addLinkNote(params: AddLinkNoteParams): Promise<TimelineItemNote> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('timeline_item_notes')
    .insert({
      timeline_item_id: params.timelineItemId,
      kind: 'link',
      title: params.title ?? null,
      link_url: params.linkUrl,
      link_label: params.linkLabel ?? null,
      created_by: user?.id ?? null,
    })
    .select(`${NOTE_COLUMNS}, created_by_profile:profiles!created_by(name)`)
    .single();
  if (error) throw error;
  return mapTimelineNote(data);
}

// Uploads a document to the `timeline-attachments` bucket and inserts a
// corresponding note row. Storage path is namespaced by item id and a
// fresh UUID-style suffix so two uploads of the same filename don't
// collide and the file is easy to delete on note removal.
export interface AddDocumentNoteParams {
  timelineItemId: string;
  title?: string;
  file: File;
}

export async function addDocumentNote(
  params: AddDocumentNoteParams,
): Promise<TimelineItemNote> {
  const { data: { user } } = await supabase.auth.getUser();
  // Strip directory separators from the original filename so path
  // composition can't be tricked into traversing.
  const safeName = params.file.name.replace(/[\\/]/g, '_');
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${params.timelineItemId}/${stamp}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('timeline-attachments')
    .upload(path, params.file, {
      cacheControl: '3600',
      upsert: false,
      contentType: params.file.type || undefined,
    });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('timeline_item_notes')
    .insert({
      timeline_item_id: params.timelineItemId,
      kind: 'document',
      title: params.title ?? null,
      file_path: path,
      file_name: params.file.name,
      file_mime: params.file.type || null,
      file_size_bytes: params.file.size,
      created_by: user?.id ?? null,
    })
    .select(`${NOTE_COLUMNS}, created_by_profile:profiles!created_by(name)`)
    .single();
  if (error) {
    // Best-effort cleanup so a failed insert doesn't leave an orphan
    // object in storage. We swallow the inner error — the outer throw
    // is the one the caller cares about.
    try { await supabase.storage.from('timeline-attachments').remove([path]); } catch { /* noop */ }
    throw error;
  }
  return mapTimelineNote(data);
}

// Generates a short-lived signed URL for downloading a document
// attachment. The bucket is private, so the UI can't link directly.
export async function getDocumentDownloadUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('timeline-attachments')
    .createSignedUrl(filePath, 60 * 5);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteTimelineItemNote(note: TimelineItemNote): Promise<void> {
  if (note.kind === 'document' && note.filePath) {
    // Remove the storage object first so deleting the row doesn't strand
    // it. If the storage delete fails we still try the DB delete — the
    // user wants the note gone, and the orphan can be reaped later.
    try {
      await supabase.storage.from('timeline-attachments').remove([note.filePath]);
    } catch {
      /* noop */
    }
  }
  const { error } = await supabase
    .from('timeline_item_notes')
    .delete()
    .eq('id', note.id);
  if (error) throw error;
}
