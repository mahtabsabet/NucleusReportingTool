-- ============================================================
-- LSA layer — RLS performance optimization.
--
-- The initial LSA migration (20260516) added a set of read
-- policies that join through nuclei (and in some cases through
-- activities) to check cluster membership per row. For an LSA
-- caller navigating into a nucleus dashboard, the resulting
-- per-row joins on persons / nucleus_enrollments / activities /
-- activity_participants / sessions / session_attendance /
-- timeline_events compound into visibly slow page loads.
--
-- This migration introduces two cached lookups —
-- nuclei_in_lsa_clusters() and activities_in_lsa_clusters() —
-- modeled on the existing nuclei_in_coordinator_clusters() /
-- activities_in_coordinator_clusters() helpers. The LSA read
-- policies are rewritten to reference these cheap setof-uuid
-- lookups, collapsing the per-row joins into single membership
-- checks.
--
-- Behaviour is identical (same rows visible to the same
-- callers); only the query plan changes.
-- ============================================================


-- ─── 1. Helper functions ─────────────────────────────────────
-- Both are security definer + stable so the planner can cache
-- their result for the duration of the enclosing query. Bypassing
-- RLS internally also avoids the nuclei ↔ user_permissions
-- recursion problem the existing CC/NC helpers already solved.

create or replace function nuclei_in_lsa_clusters()
returns setof uuid language sql security definer stable as $$
  select n.id from nuclei n
  where n.cluster_id = any(
    select cluster_id from user_permissions
    where user_id = auth.uid()
      and role = 'lsa_member'
      and cluster_id is not null
  )
$$;

create or replace function activities_in_lsa_clusters()
returns setof uuid language sql security definer stable as $$
  select a.id from activities a
  join nuclei n on n.id = a.nucleus_id
  where n.cluster_id = any(
    select cluster_id from user_permissions
    where user_id = auth.uid()
      and role = 'lsa_member'
      and cluster_id is not null
  )
$$;


-- ─── 2. Drop the slow policies ───────────────────────────────
-- These are the ones doing per-row joins in 20260516.

drop policy if exists "LSA members read persons in own cluster"               on persons;
drop policy if exists "LSA members read nucleus enrollments in own cluster"   on nucleus_enrollments;
drop policy if exists "LSA members read activities in own cluster"            on activities;
drop policy if exists "LSA members read activity participants in own cluster" on activity_participants;
drop policy if exists "LSA members read sessions in own cluster"              on sessions;
drop policy if exists "LSA members read session attendance in own cluster"    on session_attendance;
drop policy if exists "LSA members read timeline events in own cluster"       on timeline_events;


-- ─── 3. Recreate them against the cached helpers ─────────────

-- Persons: visible if they have a (non-deleted) enrollment in a
-- nucleus the LSA covers, OR a participation in an activity the
-- LSA covers. Same semantics as before, but each EXISTS is now
-- a single lookup against a cached set instead of a join.
create policy "LSA members read persons in own cluster" on persons
  for select using (
    deleted_at is null and (
      exists (
        select 1 from nucleus_enrollments ne
        where ne.person_id = persons.id
          and ne.deleted_at is null
          and ne.nucleus_id = any(select nuclei_in_lsa_clusters())
      )
      or exists (
        select 1 from activity_participants ap
        where ap.person_id = persons.id
          and ap.activity_id = any(select activities_in_lsa_clusters())
      )
    )
  );

create policy "LSA members read nucleus enrollments in own cluster" on nucleus_enrollments
  for select using (
    deleted_at is null
    and nucleus_id = any(select nuclei_in_lsa_clusters())
  );

create policy "LSA members read activities in own cluster" on activities
  for select using (
    deleted_at is null
    and nucleus_id = any(select nuclei_in_lsa_clusters())
  );

create policy "LSA members read activity participants in own cluster" on activity_participants
  for select using (
    activity_id = any(select activities_in_lsa_clusters())
  );

create policy "LSA members read sessions in own cluster" on sessions
  for select using (
    activity_id = any(select activities_in_lsa_clusters())
  );

create policy "LSA members read session attendance in own cluster" on session_attendance
  for select using (
    exists (
      select 1 from sessions s
      where s.id = session_attendance.session_id
        and s.activity_id = any(select activities_in_lsa_clusters())
    )
  );

create policy "LSA members read timeline events in own cluster" on timeline_events
  for select using (
    cluster_id = any(select lsa_member_cluster_ids())
    or nucleus_id = any(select nuclei_in_lsa_clusters())
  );
