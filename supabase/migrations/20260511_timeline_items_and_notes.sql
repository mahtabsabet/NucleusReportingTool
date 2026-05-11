-- ============================================================
-- Timeline Phase 1: item types (events + meetings) and a separate
-- notes / documents / links table attached to timeline items.
--
-- This migration is additive — existing rows in timeline_events stay
-- as `event` items (the new item_type column defaults to 'event'),
-- and all existing client queries against the `name`/`start_date`/
-- `end_date`/`cluster_id`/`location` columns keep working.
--
-- The notes table is structured so future phases can attach
-- multiple contributors, AI-generated summaries, action-item
-- extraction, semantic search embeddings, and document parsing —
-- without restructuring the data. None of that machinery is
-- exercised in Phase 1; the relevant columns simply stay null.
-- ============================================================


-- ─── 1. Item type enum ───────────────────────────────────────
-- Naming the enum `timeline_item_type_enum` (vs. e.g.
-- `timeline_event_type_enum`) because we intend `timeline_events`
-- to hold both events and meetings — the table name is a legacy
-- of the events-only Phase 0 timeline.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'timeline_item_type_enum') then
    create type timeline_item_type_enum as enum ('event', 'meeting');
  end if;
end$$;


-- ─── 2. Extend timeline_events to support meetings ───────────
-- New columns are all optional / defaulted so existing inserts
-- from older client code keep working.
alter table timeline_events
  add column if not exists item_type    timeline_item_type_enum not null default 'event',
  add column if not exists start_time   time,
  add column if not exists meeting_type text,
  add column if not exists attendees    text[] not null default '{}',
  add column if not exists created_by   uuid references profiles(id) on delete set null,
  add column if not exists created_at   timestamptz not null default now();

create index if not exists timeline_events_item_type_idx on timeline_events(item_type);
create index if not exists timeline_events_cluster_id_idx on timeline_events(cluster_id);


-- ─── 3. Notes / documents / links table ──────────────────────
-- Each row is one attachment on a timeline item. `kind` discriminates
-- the body shape: pasted text vs. uploaded document vs. external link.
-- A timeline item may have many notes; each note records its own
-- contributor and timestamp, which is the seed we need for
-- multi-contributor history in later phases.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'timeline_item_note_kind_enum') then
    create type timeline_item_note_kind_enum as enum ('text', 'document', 'link');
  end if;
end$$;

create table if not exists timeline_item_notes (
  id                uuid primary key default gen_random_uuid(),
  timeline_item_id  uuid not null references timeline_events(id) on delete cascade,
  kind              timeline_item_note_kind_enum not null,
  title             text,
  -- One-of, depending on `kind`. The check constraint below enforces
  -- that the matching body column is populated.
  body_text         text,
  file_path         text,
  file_name         text,
  file_mime         text,
  file_size_bytes   bigint,
  link_url          text,
  link_label        text,
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  -- ── Phase 2+ columns (kept null in Phase 1). Schema lives here so
  --    later AI processing can be added without another migration on
  --    historical data — every existing note already has a slot.
  ai_summary        text,
  ai_action_items   jsonb,
  ai_processed_at   timestamptz,
  embedding_vector_id text,  -- handle to an external vector store; we
                             -- don't enable pgvector here.
  constraint timeline_item_notes_shape_check check (
    (kind = 'text'     and body_text is not null) or
    (kind = 'document' and file_path is not null) or
    (kind = 'link'     and link_url  is not null)
  )
);

create index if not exists timeline_item_notes_item_id_idx
  on timeline_item_notes(timeline_item_id);
create index if not exists timeline_item_notes_created_by_idx
  on timeline_item_notes(created_by);


-- ─── 4. RLS — notes inherit their parent item's cluster scope ──
alter table timeline_item_notes enable row level security;

-- Helper: cluster id of a timeline item. SECURITY DEFINER so the
-- inner SELECT bypasses timeline_events RLS (notes policies call this
-- from within their own USING clauses — without DEFINER we could
-- recurse through timeline_events policies).
create or replace function timeline_item_cluster_id(item_id uuid)
returns uuid as $$
  select cluster_id from timeline_events where id = item_id;
$$ language sql security definer stable;

-- Read: any authenticated user who can see the parent item's
-- cluster (or all clusters, when the parent has no cluster set).
create policy "Read notes for accessible timeline items" on timeline_item_notes
  for select using (
    auth.uid() is not null and (
      is_admin()
      or timeline_item_cluster_id(timeline_item_id) is null
      or user_has_cluster_access(timeline_item_cluster_id(timeline_item_id))
    )
  );

-- Write: same rule as managing the parent timeline event — admins,
-- super admins, and the cluster's coordinators. This matches the
-- "Cluster Coordinators and higher can create/edit meetings" rule
-- and preserves the existing events-write rule.
create policy "Cluster coordinators and admins manage notes" on timeline_item_notes
  for all using (
    is_admin() or (
      timeline_item_cluster_id(timeline_item_id) is not null
      and exists (
        select 1 from user_permissions up
        where up.user_id = auth.uid()
          and up.role = 'cluster_coordinator'
          and up.cluster_id = timeline_item_cluster_id(timeline_item_notes.timeline_item_id)
      )
    )
  );


-- ─── 5. Storage bucket for uploaded documents ────────────────
-- Documents (PDF/docx) are uploaded to a dedicated bucket. The
-- bucket is private — clients fetch signed URLs from the app,
-- never raw public URLs. Storage paths are namespaced by the
-- parent timeline item id, so a single policy can authorize
-- uploads/reads by inspecting the first path segment.
insert into storage.buckets (id, name, public)
values ('timeline-attachments', 'timeline-attachments', false)
on conflict (id) do nothing;

-- Read: any authenticated user who can see the parent timeline
-- item's cluster.
create policy "Read timeline attachments for accessible items"
  on storage.objects
  for select
  using (
    bucket_id = 'timeline-attachments'
    and auth.uid() is not null
    and (
      is_admin()
      -- (storage.foldername(name))[1] = the first path segment, which
      -- the app uses as the timeline_item_id.
      or (
        (storage.foldername(name))[1] is not null
        and (
          timeline_item_cluster_id((storage.foldername(name))[1]::uuid) is null
          or user_has_cluster_access(
            timeline_item_cluster_id((storage.foldername(name))[1]::uuid)
          )
        )
      )
    )
  );

-- Write / delete: cluster coordinators and admins on the parent
-- item's cluster (same rule as the timeline_item_notes table).
create policy "Cluster coordinators upload timeline attachments"
  on storage.objects
  for insert
  with check (
    bucket_id = 'timeline-attachments'
    and (
      is_admin() or exists (
        select 1 from user_permissions up
        where up.user_id = auth.uid()
          and up.role = 'cluster_coordinator'
          and up.cluster_id = timeline_item_cluster_id(
            (storage.foldername(name))[1]::uuid
          )
      )
    )
  );

create policy "Cluster coordinators delete timeline attachments"
  on storage.objects
  for delete
  using (
    bucket_id = 'timeline-attachments'
    and (
      is_admin() or exists (
        select 1 from user_permissions up
        where up.user_id = auth.uid()
          and up.role = 'cluster_coordinator'
          and up.cluster_id = timeline_item_cluster_id(
            (storage.foldername(name))[1]::uuid
          )
      )
    )
  );
