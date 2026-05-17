-- ============================================================
-- LSA Household Stewardship Layer
--
-- A second, parallel data domain for Local Spiritual Assembly
-- household stewardship. Intentionally separated from the
-- community-building tables (nuclei, activities, enrollments):
--
--   * Households / household_members live in their own schema
--     space, joined to clusters only via lsa_jurisdictions.
--   * The only shared point with the community-building side is
--     an OPTIONAL household_members.linked_person_id pointing
--     into persons. Linkage is manual and one-way visible only
--     from the LSA layer.
--   * RLS bars every non-LSA role from reading household tables
--     entirely. Super Admins retain access for system maintenance;
--     plain Admins do NOT, by design (see the layered privacy
--     boundary in CLAUDE.md / the original LSA brief).
--
-- New role token: `lsa_member`, scoped to a cluster via
-- user_permissions.cluster_id. v1 ships one LSA jurisdiction per
-- cluster; the lsa_jurisdictions table is structured to allow
-- multiple sub-jurisdictions per cluster later without a schema
-- rewrite.
-- ============================================================


-- ─── 1. New scoped role ──────────────────────────────────────
-- user_permissions.role is the permission_role_enum (defined in
-- schema.sql). Postgres requires a new enum value to be added in
-- its own transaction before any later statement can reference
-- it as a literal — hence the COMMIT below. This file is split
-- into two transactional chunks for that reason; running it via
-- `supabase db push` handles both halves automatically, and the
-- Supabase SQL Editor needs two separate runs (the ALTER first,
-- then everything after the COMMIT).

alter type permission_role_enum add value if not exists 'lsa_member';

commit;


-- ─── 2. lsa_jurisdictions ────────────────────────────────────
-- One row per LSA jurisdiction. v1 = one per cluster; future
-- multi-LSA / sub-jurisdiction support uses additional rows
-- sharing a cluster_id.

create table if not exists lsa_jurisdictions (
  id           uuid primary key default gen_random_uuid(),
  cluster_id   uuid not null references clusters(id) on delete cascade,
  name         text not null,
  notes        text,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);

create index if not exists idx_lsa_jurisdictions_cluster
  on lsa_jurisdictions(cluster_id)
  where archived_at is null;


-- ─── 3. households ───────────────────────────────────────────
-- A single household pinned to a geographic location. The
-- address is stored once; lat/lng are populated after geocoding
-- and used directly thereafter (no re-geocoding on render).

create table if not exists households (
  id              uuid primary key default gen_random_uuid(),
  jurisdiction_id uuid not null references lsa_jurisdictions(id) on delete cascade,
  display_name    text not null,
  address_line    text,
  lat             double precision,
  lng             double precision,
  notes           text,
  archived_at     timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_households_jurisdiction
  on households(jurisdiction_id)
  where archived_at is null;

-- Touch updated_at whenever a household row is modified.
create or replace function households_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists households_touch_updated_at on households;
create trigger households_touch_updated_at
  before update on households
  for each row execute function households_touch_updated_at();


-- ─── 4. household_members ────────────────────────────────────
-- A reference to a person living in a household. Either:
--   * linked_person_id is set (the LSA has manually confirmed
--     a match to an existing community-building person profile)
--   * display_name is set (an LSA-only reference)
--
-- A row may carry both — display_name acts as a label even
-- once linked, so the LSA doesn't lose the in-household label.

create table if not exists household_members (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references households(id) on delete cascade,
  linked_person_id  uuid references persons(id) on delete set null,
  display_name      text,
  relationship      text,         -- 'head', 'spouse', 'child', etc. — free-text v1
  age_group         text,         -- mirrors persons.age_group enum values; nullable
  notes             text,
  created_at        timestamptz not null default now(),
  constraint household_members_has_identity
    check (linked_person_id is not null or coalesce(btrim(display_name), '') <> '')
);

create index if not exists idx_household_members_household
  on household_members(household_id);

create index if not exists idx_household_members_linked_person
  on household_members(linked_person_id)
  where linked_person_id is not null;


-- ─── 5. Helper functions ─────────────────────────────────────
-- All security definer so policy checks don't recurse through
-- user_permissions ↔ households.

create or replace function lsa_member_cluster_ids()
returns setof uuid language sql security definer stable as $$
  select cluster_id from user_permissions
   where user_id = auth.uid()
     and role = 'lsa_member'
     and cluster_id is not null
$$;

-- True when the caller has an lsa_member grant on the cluster
-- that owns the given jurisdiction. Bypasses RLS internally so
-- the jurisdiction lookup itself doesn't need a separate read
-- policy granted to the caller.
create or replace function caller_in_lsa_jurisdiction(jid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from lsa_jurisdictions j
     where j.id = jid
       and j.cluster_id = any(select lsa_member_cluster_ids())
  )
$$;


-- ─── 6. RLS — the privacy wall ───────────────────────────────
-- Super Admin: full read/write (system maintenance escape hatch).
-- LSA Member on jurisdiction's cluster: full read/write within
--   that jurisdiction.
-- Everyone else (Admin, Regional Viewer, CC, NC, AL): NO access.
--   Plain Admins are deliberately excluded — the LSA layer is
--   privacy-sensitive household data, not ordinary community-
--   building data.

alter table lsa_jurisdictions enable row level security;
alter table households        enable row level security;
alter table household_members enable row level security;

-- lsa_jurisdictions
create policy "Super admins read jurisdictions" on lsa_jurisdictions
  for select using (is_super_admin());

create policy "LSA members read own jurisdictions" on lsa_jurisdictions
  for select using (cluster_id = any(select lsa_member_cluster_ids()));

create policy "Super admins manage jurisdictions" on lsa_jurisdictions
  for all using (is_super_admin()) with check (is_super_admin());

-- LSA members may update notes on their own jurisdiction but not
-- create new ones or move them between clusters — that is a
-- Super-Admin operation (one LSA per cluster today; future
-- multi-jurisdiction setup will get its own admin flow).
create policy "LSA members update own jurisdiction notes" on lsa_jurisdictions
  for update
  using (cluster_id = any(select lsa_member_cluster_ids()))
  with check (cluster_id = any(select lsa_member_cluster_ids()));

-- households
create policy "Super admins read households" on households
  for select using (is_super_admin());

create policy "LSA members read households" on households
  for select using (caller_in_lsa_jurisdiction(jurisdiction_id));

create policy "Super admins manage households" on households
  for all using (is_super_admin()) with check (is_super_admin());

create policy "LSA members manage households" on households
  for all
  using (caller_in_lsa_jurisdiction(jurisdiction_id))
  with check (caller_in_lsa_jurisdiction(jurisdiction_id));

-- household_members — visibility piggybacks on the parent
-- household. We don't have a direct cluster_id on the member
-- row; the parent join keeps the privacy wall watertight even
-- if a row is somehow inserted with a dangling household_id.
create policy "Super admins read household members" on household_members
  for select using (is_super_admin());

create policy "LSA members read household members" on household_members
  for select using (
    exists (
      select 1 from households h
      where h.id = household_members.household_id
        and caller_in_lsa_jurisdiction(h.jurisdiction_id)
    )
  );

create policy "Super admins manage household members" on household_members
  for all using (is_super_admin()) with check (is_super_admin());

create policy "LSA members manage household members" on household_members
  for all
  using (
    exists (
      select 1 from households h
      where h.id = household_members.household_id
        and caller_in_lsa_jurisdiction(h.jurisdiction_id)
    )
  )
  with check (
    exists (
      select 1 from households h
      where h.id = household_members.household_id
        and caller_in_lsa_jurisdiction(h.jurisdiction_id)
    )
  );


-- ─── 7. LSA members read ordinary cluster data (read-only) ───
-- Per the brief: an LSA member needs cluster read-only access on
-- the community-building side so they can search and link an
-- existing person profile to a household member. We layer
-- permissive SELECT policies that grant the same blanket read
-- as a Regional Viewer, but scoped to the LSA's home cluster.
-- These do NOT grant any write capability.

-- Clusters: LSA can read their cluster.
create policy "LSA members read own cluster" on clusters
  for select using (
    deleted_at is null and id = any(select lsa_member_cluster_ids())
  );

-- Nuclei in own cluster.
create policy "LSA members read nuclei in own cluster" on nuclei
  for select using (
    deleted_at is null and cluster_id = any(select lsa_member_cluster_ids())
  );

-- Persons reachable through nucleus_enrollments / activity_participants
-- in the LSA's cluster. Mirrors the pattern in 20260515_scoped_user_person_management.sql.
create policy "LSA members read persons in own cluster" on persons
  for select using (
    deleted_at is null and (
      exists (
        select 1 from nucleus_enrollments ne
        join nuclei n on n.id = ne.nucleus_id
        where ne.person_id = persons.id
          and ne.deleted_at is null
          and n.cluster_id = any(select lsa_member_cluster_ids())
      )
      or exists (
        select 1 from activity_participants ap
        join activities a on a.id = ap.activity_id
        join nuclei n on n.id = a.nucleus_id
        where ap.person_id = persons.id
          and a.deleted_at is null
          and n.cluster_id = any(select lsa_member_cluster_ids())
      )
    )
  );

-- Nucleus enrollments / activities / participants / sessions —
-- read access mirrors the "Regional viewers read everything" pattern
-- from 20260507_permissions_super_admin_and_requests.sql but scoped
-- to the LSA's cluster. LSAs do NOT see other clusters' data.
create policy "LSA members read nucleus enrollments in own cluster" on nucleus_enrollments
  for select using (
    deleted_at is null and exists (
      select 1 from nuclei n
      where n.id = nucleus_enrollments.nucleus_id
        and n.cluster_id = any(select lsa_member_cluster_ids())
    )
  );

create policy "LSA members read activities in own cluster" on activities
  for select using (
    deleted_at is null and exists (
      select 1 from nuclei n
      where n.id = activities.nucleus_id
        and n.cluster_id = any(select lsa_member_cluster_ids())
    )
  );

create policy "LSA members read activity participants in own cluster" on activity_participants
  for select using (
    exists (
      select 1 from activities a
      join nuclei n on n.id = a.nucleus_id
      where a.id = activity_participants.activity_id
        and n.cluster_id = any(select lsa_member_cluster_ids())
    )
  );

create policy "LSA members read sessions in own cluster" on sessions
  for select using (
    exists (
      select 1 from activities a
      join nuclei n on n.id = a.nucleus_id
      where a.id = sessions.activity_id
        and n.cluster_id = any(select lsa_member_cluster_ids())
    )
  );

create policy "LSA members read session attendance in own cluster" on session_attendance
  for select using (
    exists (
      select 1 from sessions s
      join activities a on a.id = s.activity_id
      join nuclei n on n.id = a.nucleus_id
      where s.id = session_attendance.session_id
        and n.cluster_id = any(select lsa_member_cluster_ids())
    )
  );

-- Timeline events in own cluster.
create policy "LSA members read timeline events in own cluster" on timeline_events
  for select using (
    cluster_id = any(select lsa_member_cluster_ids())
    or exists (
      select 1 from nuclei n
      where n.id = timeline_events.nucleus_id
        and n.cluster_id = any(select lsa_member_cluster_ids())
    )
  );


-- ─── 8. Auto-create a default jurisdiction for each cluster ──
-- v1 ships one jurisdiction per cluster. To keep the LSA-grant
-- flow simple (a Super Admin assigns lsa_member with cluster_id;
-- the system already has a jurisdiction to attach to), seed one
-- jurisdiction per existing cluster, and add a trigger that
-- mirrors the behavior for clusters created later.

insert into lsa_jurisdictions (cluster_id, name)
select c.id, c.name
  from clusters c
 where c.deleted_at is null
   and not exists (
     select 1 from lsa_jurisdictions j where j.cluster_id = c.id
   );

create or replace function ensure_default_lsa_jurisdiction()
returns trigger language plpgsql security definer as $$
begin
  insert into lsa_jurisdictions (cluster_id, name)
  values (new.id, new.name)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists clusters_seed_lsa_jurisdiction on clusters;
create trigger clusters_seed_lsa_jurisdiction
  after insert on clusters
  for each row execute function ensure_default_lsa_jurisdiction();
