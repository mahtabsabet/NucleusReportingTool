-- ============================================================
-- Activity lifecycle states + scheduling modes, and a
-- nucleus-scoped timeline view.
--
-- Adds:
--   • activities.lifecycle_state ('planned' | 'active' | 'completed' | 'cancelled')
--   • activities.scheduling_mode ('structured_recurring' | 'sporadic_ongoing' | 'short_duration')
--   • activities.start_date / end_date / completed_at
--   • activities.schedule_days_of_week (int[]) — multi-day support
--     for structured recurring activities, complementing the
--     existing single-column schedule_day_of_week field.
--   • timeline_events.activity_id — links a derived timeline
--     entry back to the activity that generated it, so syncing
--     edits / deletions stays one-to-one without a separate join
--     table.
--   • RLS updates so nucleus collaborators can manage their
--     nucleus-scoped timeline_events (existing cluster-coordinator
--     reach extends to nucleus rows within their cluster).
--
-- All columns and policy changes are additive; existing rows
-- default to lifecycle_state = 'active' and scheduling_mode =
-- 'sporadic_ongoing', which preserves the prior "free-text
-- schedule" behavior. Older clients that don't know about the
-- new columns continue to work.
-- ============================================================


-- ─── 1. Enums ────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'activity_lifecycle_enum') then
    create type activity_lifecycle_enum as enum (
      'planned', 'active', 'completed', 'cancelled'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'activity_scheduling_mode_enum') then
    create type activity_scheduling_mode_enum as enum (
      'structured_recurring', 'sporadic_ongoing', 'short_duration'
    );
  end if;
end$$;


-- ─── 2. Activity columns ─────────────────────────────────────
alter table activities
  add column if not exists lifecycle_state   activity_lifecycle_enum         not null default 'active',
  add column if not exists scheduling_mode   activity_scheduling_mode_enum   not null default 'sporadic_ongoing',
  add column if not exists schedule_days_of_week int[]   not null default '{}',
  add column if not exists start_date        date,
  add column if not exists end_date          date,
  add column if not exists completed_at      timestamptz;

create index if not exists activities_lifecycle_state_idx on activities(lifecycle_state);
create index if not exists activities_scheduling_mode_idx on activities(scheduling_mode);


-- ─── 3. timeline_events.activity_id ──────────────────────────
-- Optional link from a derived timeline entry to its source
-- activity. ON DELETE SET NULL so a hard-deleted activity
-- (rare; we soft-delete via deleted_at) leaves the timeline
-- row in place rather than vanishing history.
alter table timeline_events
  add column if not exists activity_id uuid references activities(id) on delete set null;

create index if not exists timeline_events_activity_id_idx on timeline_events(activity_id);
create index if not exists timeline_events_nucleus_id_idx on timeline_events(nucleus_id);


-- ─── 4. RLS — extend timeline_events to nucleus scope ────────

-- Read policy must accept rows scoped only by nucleus_id (e.g.
-- a derived activity entry on a nucleus timeline). Drop and
-- recreate the existing policy so the conditions are explicit.
drop policy if exists "Authenticated users read timeline events in scope" on timeline_events;
create policy "Authenticated users read timeline events in scope" on timeline_events
  for select using (
    auth.uid() is not null
    and (
      is_admin()
      or (cluster_id is null and nucleus_id is null)
      or (cluster_id is not null and user_has_cluster_access(cluster_id))
      or (nucleus_id is not null and user_has_nucleus_access(nucleus_id))
    )
  );

-- Write policy: cluster coordinators continue to manage any
-- timeline row in their cluster (including rows scoped to a
-- nucleus inside that cluster). Nucleus collaborators may
-- manage rows scoped to their nucleus.
drop policy if exists "Cluster coordinators manage timeline events" on timeline_events;
create policy "Cluster coordinators manage timeline events" on timeline_events
  for all using (
    is_admin()
    or (
      cluster_id is not null and exists (
        select 1 from user_permissions
        where user_id = auth.uid()
          and role = 'cluster_coordinator'
          and cluster_id = timeline_events.cluster_id
      )
    )
    or (
      -- CCs of the parent cluster also manage nucleus-scoped rows
      nucleus_id is not null and exists (
        select 1 from user_permissions up
        join nuclei n on n.id = timeline_events.nucleus_id
        where up.user_id = auth.uid()
          and up.role = 'cluster_coordinator'
          and up.cluster_id = n.cluster_id
      )
    )
  );

create policy "Nucleus collaborators manage nucleus timeline events" on timeline_events
  for all using (
    nucleus_id is not null and exists (
      select 1 from user_permissions
      where user_id = auth.uid()
        and role = 'nucleus_collaborator'
        and nucleus_id = timeline_events.nucleus_id
    )
  );


-- ─── 5. Notes attachments — recognize nucleus scope ──────────
-- The existing timeline_item_notes "manage" policy gates on the
-- parent item's cluster_id only. Augment it so notes attached
-- to a nucleus-scoped item are manageable by the nucleus's
-- collaborators (and, transitively, the cluster's coordinators).
do $$
begin
  if exists (select 1 from pg_policies
             where schemaname = 'public'
               and tablename = 'timeline_item_notes'
               and policyname = 'Cluster coordinators and admins manage notes') then
    drop policy "Cluster coordinators and admins manage notes" on timeline_item_notes;
  end if;
end$$;

create or replace function timeline_item_nucleus_id(item_id uuid)
returns uuid as $$
  select nucleus_id from timeline_events where id = item_id;
$$ language sql security definer stable;

create policy "Coordinators and collaborators manage notes" on timeline_item_notes
  for all using (
    is_admin()
    or (
      timeline_item_cluster_id(timeline_item_id) is not null
      and exists (
        select 1 from user_permissions up
        where up.user_id = auth.uid()
          and up.role = 'cluster_coordinator'
          and up.cluster_id = timeline_item_cluster_id(timeline_item_notes.timeline_item_id)
      )
    )
    or (
      timeline_item_nucleus_id(timeline_item_id) is not null
      and exists (
        select 1 from user_permissions up
        where up.user_id = auth.uid()
          and up.role = 'nucleus_collaborator'
          and up.nucleus_id = timeline_item_nucleus_id(timeline_item_notes.timeline_item_id)
      )
    )
  );
