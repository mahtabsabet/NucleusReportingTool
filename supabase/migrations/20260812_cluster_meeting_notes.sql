-- ============================================================
-- Cluster meeting notes
--
-- Cluster coordinators have been using a cluster theme ("Object
-- of Learning") as a place to park general cluster-agency /
-- inter-institutional meeting notes that aren't really learning
-- themes. This adds a dedicated home for that: a standalone
-- `cluster_meeting_notes` table, surfaced as a full-width section
-- above the Hub's three columns. Unlike journal_entries (which is
-- shaped around activity/nucleus/cluster-theme provenance), these
-- notes are simple: a title, a date, and a body, scoped only to
-- the cluster.
--
-- Permission model mirrors cluster_themes: any user with cluster
-- access can read; only cluster coordinators (on that cluster) and
-- admins can write/edit/delete.
-- ============================================================

create table cluster_meeting_notes (
  id           uuid primary key default gen_random_uuid(),
  cluster_id   uuid not null references clusters(id) on delete cascade,
  title        text not null,
  body         text not null,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  author_id    uuid references profiles(id) on delete set null,
  edited_at    timestamptz,
  edited_by    uuid references profiles(id) on delete set null
);

create index on cluster_meeting_notes (cluster_id, occurred_at desc);

alter table cluster_meeting_notes enable row level security;

create policy "Read cluster meeting notes" on cluster_meeting_notes
  for select using (is_admin() or user_has_cluster_access(cluster_id));

create policy "Cluster coordinators manage meeting notes" on cluster_meeting_notes
  for all using (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role = 'cluster_coordinator'
        and up.cluster_id = cluster_meeting_notes.cluster_id
    )
  ) with check (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role = 'cluster_coordinator'
        and up.cluster_id = cluster_meeting_notes.cluster_id
    )
  );
