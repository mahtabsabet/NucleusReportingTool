-- ============================================================
-- Cluster-level people foundation
--
-- Two columns on `persons` plus the RLS to manage them, laying the
-- groundwork for an accurate Cluster Growth Profile.
--
--   1. religious_status (bahai | friend | unknown) — the Bahá'í vs.
--      friend-of-the-faith distinction the CGP needs but we've never
--      captured. Defaults to 'unknown' so un-reviewed records never
--      inflate the "friends of the faith" counts.
--
--   2. cluster_id — a canonical cluster affiliation so a person can be
--      counted toward a cluster's growth (especially cumulative book
--      completions) even when they aren't currently in any nucleus or
--      activity. Backfilled from existing nucleus enrollments; kept in
--      sync by the app whenever someone is added to an activity.
--
--   3. RLS: a cluster-scoped branch on the persons read/update policies
--      so cluster agencies (and admins) can build out and edit profiles
--      directly, without first routing a person through an activity.
-- ============================================================

-- ── 1. Belief status ─────────────────────────────────────────
create type person_religious_status_enum as enum ('bahai', 'friend', 'unknown');

alter table persons
  add column religious_status person_religious_status_enum not null default 'unknown';

-- ── 2. Canonical cluster affiliation ─────────────────────────
alter table persons
  add column cluster_id uuid references clusters(id);

create index on persons (cluster_id);

-- Backfill from existing nucleus enrollments. If a person is enrolled
-- across nuclei in different clusters, take the cluster they're most
-- enrolled in (ties broken by cluster id for determinism).
with ranked as (
  select ne.person_id,
         n.cluster_id,
         row_number() over (
           partition by ne.person_id
           order by count(*) desc, n.cluster_id
         ) as rn
  from nucleus_enrollments ne
  join nuclei n on n.id = ne.nucleus_id
  where ne.deleted_at is null
  group by ne.person_id, n.cluster_id
)
update persons p
   set cluster_id = ranked.cluster_id
  from ranked
 where ranked.person_id = p.id
   and ranked.rn = 1
   and p.cluster_id is null;

-- ── 3. Cluster-scoped RLS ────────────────────────────────────
-- Recreated with an added cluster_id branch. (Base definitions mirror
-- the live policies from the 2026-05-16 created_by migration and the
-- original update policy.)

drop policy if exists "Read persons in scope" on persons;
create policy "Read persons in scope" on persons
  for select using (
    deleted_at is null and (
      is_admin()
      or created_by = auth.uid()
      or (cluster_id is not null and user_has_cluster_access(cluster_id))
      or exists (
        select 1 from nucleus_enrollments ne
        where ne.person_id = persons.id
          and ne.deleted_at is null
          and user_has_nucleus_access(ne.nucleus_id)
      )
      or exists (
        select 1 from activity_participants ap
        where ap.person_id = persons.id
          and ap.deleted_at is null
          and user_has_activity_access(ap.activity_id)
      )
    )
  );

drop policy if exists "Update persons in scope" on persons;
create policy "Update persons in scope" on persons
  for update using (
    is_admin()
    or (cluster_id is not null and user_has_cluster_access(cluster_id))
    or exists (
      select 1 from nucleus_enrollments ne
      where ne.person_id = persons.id
        and ne.deleted_at is null
        and user_has_nucleus_access(ne.nucleus_id)
    )
    or exists (
      select 1 from activity_participants ap
      where ap.person_id = persons.id
        and ap.deleted_at is null
        and user_has_activity_access(ap.activity_id)
    )
  );
