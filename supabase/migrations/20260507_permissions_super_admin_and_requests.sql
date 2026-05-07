-- ============================================================
-- Permissions overhaul: Super Admin + Regional (View-Only)
-- + lightweight permission_requests table.
--
-- This migration is additive and reversible at the column level.
-- It does NOT rename `nucleus_collaborator` (kept by design).
-- ============================================================


-- ─── 1. New profile flags ────────────────────────────────────

alter table profiles
  add column if not exists is_super_admin    boolean not null default false,
  add column if not exists is_regional_viewer boolean not null default false;

-- A Super Admin is implicitly an Admin too. Keep is_admin in lockstep
-- so existing RLS based on is_admin keeps working without changes.
update profiles set is_admin = true where is_super_admin = true;


-- ─── 2. Bootstrap initial Super Admin ────────────────────────
-- The initial Super Admin is michael.sabet@gmail.com.
-- Done via a one-shot upsert keyed on the auth.users row, if it exists.

do $$
declare
  init_id uuid;
begin
  select id into init_id from auth.users
   where lower(email) = 'michael.sabet@gmail.com'
   limit 1;
  if init_id is not null then
    update profiles
       set is_super_admin = true,
           is_admin = true
     where id = init_id;
  end if;
end$$;


-- ─── 3. Auto-promote on signup if email matches ──────────────

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  is_initial_super boolean := false;
begin
  if lower(new.email) = 'michael.sabet@gmail.com' then
    is_initial_super := true;
  end if;
  insert into public.profiles (id, name, is_admin, is_super_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    is_initial_super,
    is_initial_super
  );
  return new;
end;
$$;


-- ─── 4. Helper functions ─────────────────────────────────────

create or replace function is_super_admin()
returns boolean as $$
  select coalesce((select is_super_admin from profiles where id = auth.uid()), false);
$$ language sql security definer stable;

create or replace function is_regional_viewer()
returns boolean as $$
  select coalesce((select is_regional_viewer from profiles where id = auth.uid()), false);
$$ language sql security definer stable;


-- ─── 5. RLS: Regional viewers can read everything ────────────
-- Regional viewers get blanket read access. Edits remain blocked because
-- existing UPDATE/INSERT/DELETE policies do not include is_regional_viewer().

create policy "Regional viewers read clusters" on clusters
  for select using (deleted_at is null and is_regional_viewer());
create policy "Regional viewers read nuclei" on nuclei
  for select using (deleted_at is null and is_regional_viewer());
create policy "Regional viewers read persons" on persons
  for select using (deleted_at is null and is_regional_viewer());
create policy "Regional viewers read enrollments" on nucleus_enrollments
  for select using (is_regional_viewer());
create policy "Regional viewers read activities" on activities
  for select using (deleted_at is null and is_regional_viewer());
create policy "Regional viewers read participants" on activity_participants
  for select using (deleted_at is null and is_regional_viewer());
create policy "Regional viewers read sessions" on sessions
  for select using (is_regional_viewer());
create policy "Regional viewers read attendance" on session_attendance
  for select using (is_regional_viewer());
create policy "Regional viewers read course enrollments" on course_enrollments
  for select using (is_regional_viewer());
create policy "Regional viewers read event log" on event_log
  for select using (is_regional_viewer());


-- ─── 6. permission_requests table ────────────────────────────
-- Lightweight placeholder. Will integrate with the future
-- "Data Review / Hygiene" interface; structure deliberately generic.

create type permission_request_status_enum as enum (
  'pending', 'approved', 'rejected', 'cancelled'
);

create table permission_requests (
  id              uuid primary key default gen_random_uuid(),
  target_type     text not null,        -- e.g. 'person', 'activity', 'nucleus', 'user', 'user_permission'
  target_id       uuid,                 -- target row id; nullable if not yet known
  action          text not null,        -- e.g. 'delete', 'change_role', 'demote'
  payload         jsonb,                -- extra context: { newRole, scopeId, ... }
  note            text,                 -- requester's optional explanation
  -- denormalised scope hints make routing-to-reviewer cheap and
  -- make it easy to apply scoped RLS without joining back to the entity.
  cluster_id      uuid references clusters(id) on delete set null,
  nucleus_id      uuid references nuclei(id)   on delete set null,
  activity_id     uuid references activities(id) on delete set null,
  requested_by    uuid references profiles(id) on delete set null,
  requested_at    timestamptz not null default now(),
  status          permission_request_status_enum not null default 'pending',
  resolved_by     uuid references profiles(id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text
);

create index on permission_requests (status);
create index on permission_requests (cluster_id);
create index on permission_requests (nucleus_id);
create index on permission_requests (requested_by);

alter table permission_requests enable row level security;

-- Anyone authenticated can submit a request (must be the requester).
create policy "Authenticated users submit requests" on permission_requests
  for insert with check (
    auth.uid() is not null and requested_by = auth.uid()
  );

-- Requesters always see their own requests.
create policy "Requesters read own requests" on permission_requests
  for select using (requested_by = auth.uid());

-- Requesters can cancel their own pending requests.
create policy "Requesters cancel own pending" on permission_requests
  for update using (
    requested_by = auth.uid() and status = 'pending'
  ) with check (
    requested_by = auth.uid() and status in ('pending', 'cancelled')
  );

-- Reviewers (Admin / Super Admin) see and resolve everything.
create policy "Admins read all requests" on permission_requests
  for select using (is_admin() or is_super_admin());
create policy "Admins resolve requests" on permission_requests
  for update using (is_admin() or is_super_admin());

-- Cluster Coordinators see/resolve requests within their cluster scope
-- (used for delete/permission requests originating from NCs/ALs in their cluster).
create policy "Cluster coordinators read scoped requests" on permission_requests
  for select using (
    cluster_id is not null
    and cluster_id = any(select coordinator_cluster_ids())
  );
create policy "Cluster coordinators resolve scoped requests" on permission_requests
  for update using (
    cluster_id is not null
    and cluster_id = any(select coordinator_cluster_ids())
  );


-- ─── 7. event_log: add a couple of new types ─────────────────

alter type event_log_type_enum add value if not exists 'permission_request_submitted';
alter type event_log_type_enum add value if not exists 'permission_request_resolved';
alter type event_log_type_enum add value if not exists 'user_role_changed';
alter type event_log_type_enum add value if not exists 'user_deleted';
