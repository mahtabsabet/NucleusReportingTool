-- ============================================================
-- Cluster-scoped capacity catalog
--
-- Capacities used to be free-text strings stored per person in
-- persons.capacities (text[]). Identical wording was the only way
-- two people "shared" a capacity, so spelling drift and different
-- phrasings ("teaches children's classes" vs "can teach a
-- children's class") fragmented the stats.
--
-- This introduces a relational catalog, scoped per cluster:
--   cluster_capacities  — the canonical list for one cluster
--   person_capacities   — which person holds which catalog entry
--
-- Each cluster maintains its own independent list. A person who
-- belongs to nuclei in more than one cluster can hold a capacity
-- in each of those clusters (the entries are separate rows).
--
-- The legacy persons.capacities column is intentionally LEFT IN
-- PLACE — the backfill below copies data out of it but does not
-- drop it, so nothing is lost if a person had capacities but no
-- cluster to attach them to.
-- ============================================================


-- ─── Tables ──────────────────────────────────────────────────

create table if not exists cluster_capacities (
  id          uuid primary key default gen_random_uuid(),
  cluster_id  uuid not null references clusters(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- One canonical entry per (cluster, name), case-insensitively — this
-- is what stops "Teaches" and "teaches" becoming two rows. Merges and
-- renames are enforced against it via ON CONFLICT.
create unique index if not exists cluster_capacities_cluster_lower_name_key
  on cluster_capacities (cluster_id, lower(name));

create table if not exists person_capacities (
  person_id   uuid not null references persons(id) on delete cascade,
  capacity_id uuid not null references cluster_capacities(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (person_id, capacity_id)
);

create index if not exists person_capacities_capacity_id_idx
  on person_capacities (capacity_id);


-- ─── Backfill: seed the catalog from existing strings ────────
-- For every person, map their existing capacity strings into the
-- catalog of each cluster they belong to (via nucleus enrollments),
-- deduping case-insensitively. distinct on picks a single canonical
-- casing per (cluster, lower(name)).

insert into cluster_capacities (cluster_id, name)
select distinct on (n.cluster_id, lower(btrim(cap.value)))
       n.cluster_id, btrim(cap.value)
from persons p
join nucleus_enrollments ne on ne.person_id = p.id and ne.deleted_at is null
join nuclei n on n.id = ne.nucleus_id
cross join lateral unnest(p.capacities) as cap(value)
where p.deleted_at is null and btrim(cap.value) <> ''
order by n.cluster_id, lower(btrim(cap.value)), btrim(cap.value)
on conflict (cluster_id, lower(name)) do nothing;

-- Link each person to the catalog entry that matches one of their
-- strings, for each cluster they belong to.
insert into person_capacities (person_id, capacity_id)
select distinct p.id, cc.id
from persons p
join nucleus_enrollments ne on ne.person_id = p.id and ne.deleted_at is null
join nuclei n on n.id = ne.nucleus_id
cross join lateral unnest(p.capacities) as cap(value)
join cluster_capacities cc
  on cc.cluster_id = n.cluster_id
 and lower(cc.name) = lower(btrim(cap.value))
where p.deleted_at is null and btrim(cap.value) <> ''
on conflict do nothing;


-- ─── RLS ─────────────────────────────────────────────────────

alter table cluster_capacities enable row level security;
alter table person_capacities  enable row level security;

-- cluster_capacities --------------------------------------------------

-- Anyone who can see the cluster can see its capacity list (admins,
-- regional viewers, and users scoped anywhere inside the cluster).
create policy "Read capacities in accessible clusters" on cluster_capacities
  for select using (
    is_admin() or is_regional_viewer() or user_has_cluster_access(cluster_id)
  );

-- Creating a NEW catalog entry (the "new capacity" path on a profile)
-- is allowed for anyone who can edit within the cluster — cluster
-- coordinators, nucleus collaborators, activity leads. Regional viewers
-- (read-only, not in user_permissions) cannot.
create policy "Add capacities in accessible clusters" on cluster_capacities
  for insert with check (
    is_admin() or user_has_cluster_access(cluster_id)
  );

-- Renaming and merging are stronger, cluster-stewardship actions:
-- only admins / super admins and the cluster's own coordinators.
-- Neither can act across clusters because every row carries a single
-- cluster_id and these policies pin the action to it.
create policy "Rename capacities in own cluster" on cluster_capacities
  for update using (
    is_admin() or cluster_id = any(select coordinator_cluster_ids())
  ) with check (
    is_admin() or cluster_id = any(select coordinator_cluster_ids())
  );

create policy "Delete capacities in own cluster" on cluster_capacities
  for delete using (
    is_admin() or cluster_id = any(select coordinator_cluster_ids())
  );

-- person_capacities ---------------------------------------------------
-- Read/write follows access to the owning capacity's cluster. The UI
-- only ever offers a person's own clusters, but the gate is the
-- cluster of the capacity being attached.

create policy "Read person capacities in accessible clusters" on person_capacities
  for select using (
    is_admin() or is_regional_viewer() or exists (
      select 1 from cluster_capacities cc
      where cc.id = person_capacities.capacity_id
        and user_has_cluster_access(cc.cluster_id)
    )
  );

create policy "Attach person capacities in accessible clusters" on person_capacities
  for insert with check (
    is_admin() or exists (
      select 1 from cluster_capacities cc
      where cc.id = person_capacities.capacity_id
        and user_has_cluster_access(cc.cluster_id)
    )
  );

create policy "Detach person capacities in accessible clusters" on person_capacities
  for delete using (
    is_admin() or exists (
      select 1 from cluster_capacities cc
      where cc.id = person_capacities.capacity_id
        and user_has_cluster_access(cc.cluster_id)
    )
  );
