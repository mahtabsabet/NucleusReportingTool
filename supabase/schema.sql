-- ============================================================
-- Nucleus Reporting Tool — Supabase Schema
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query)
-- ============================================================


-- ============================================================
-- Enums
-- ============================================================

create type engagement_level_enum as enum (
  'aware', 'participating', 'supporting', 'coordinating'
);

create type activity_type_enum as enum (
  'children_class', 'junior_youth', 'study_circle',
  'devotional', 'fireside', 'other'
);

create type participant_role_enum as enum (
  'teacher', 'animator', 'tutor', 'child', 'junior_youth',
  'parent', 'host', 'attendee', 'participant', 'other'
);

create type permission_role_enum as enum (
  'cluster_coordinator', 'nucleus_collaborator',
  'activity_lead', 'viewer'
);

create type course_status_enum as enum (
  'in_progress', 'completed'
);

create type event_log_type_enum as enum (
  'activity_created', 'participant_added', 'participant_removed',
  'circle_movement', 'course_completed', 'course_started',
  'person_created', 'person_deleted', 'nucleus_created', 'nucleus_deleted', 'activity_deleted', 'session_logged', 'profile_updated'
);


-- ============================================================
-- Tables
-- ============================================================

-- profiles extends auth.users (auto-created on signup via trigger below)
create table profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  name        text not null,
  is_admin    boolean not null default false,
  person_id   uuid,  -- FK to persons added after persons table is created
  created_at  timestamptz not null default now()
);

create table clusters (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  center_lat  float not null,
  center_lng  float not null,
  zoom        int not null default 11,
  deleted_at  timestamptz
);

create table nuclei (
  id                uuid primary key default gen_random_uuid(),
  cluster_id        uuid not null references clusters(id),
  name              text not null,
  lat               float not null,
  lng               float not null,
  notes             text,
  banner_image_url  text,
  deleted_at        timestamptz
);

-- first name only; email/phone must not be set when is_minor = true (enforced in app)
create table persons (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  email               text,
  phone               text,
  is_minor            boolean not null default false,
  capacities          text[] not null default '{}',
  notes               text,
  profile_image_url   text,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

alter table profiles add constraint profiles_person_id_fkey
  foreign key (person_id) references persons(id) on delete set null;

create table nucleus_enrollments (
  id                  uuid primary key default gen_random_uuid(),
  person_id           uuid not null references persons(id),
  nucleus_id          uuid not null references nuclei(id),
  engagement_level    engagement_level_enum,
  primary_contact_id  uuid references persons(id),
  deleted_at          timestamptz,
  unique (person_id, nucleus_id)
);

create table courses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  short_name  text not null,
  description text,
  "order"     int not null default 0,
  is_active   boolean not null default true
);

create table course_enrollments (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references persons(id),
  course_id    uuid not null references courses(id),
  status       course_status_enum not null default 'in_progress',
  started_at   date,
  completed_at date,
  nucleus_id   uuid references nuclei(id),
  unique (person_id, course_id)
);

create table activities (
  id                      uuid primary key default gen_random_uuid(),
  nucleus_id              uuid not null references nuclei(id),
  name                    text not null,
  type                    activity_type_enum not null,
  schedule_day_of_week    int check (schedule_day_of_week between 0 and 6),
  schedule_time           time,
  schedule_interval_weeks int,
  schedule_notes          text,
  location                text,
  current_course_id       uuid references courses(id),
  is_active               boolean not null default true,
  notes                   text,
  deleted_at              timestamptz
);

-- standing roster — who regularly participates and in what role
create table activity_participants (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references activities(id),
  person_id    uuid not null references persons(id),
  role         participant_role_enum not null,
  role_notes   text,
  deleted_at   timestamptz,
  unique (activity_id, person_id)
);

-- one row per occurrence of the activity
create table sessions (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references activities(id),
  date         date not null,
  notes        text,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table session_attendance (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  person_id  uuid not null references persons(id),
  attended   boolean not null default true,
  notes      text,
  unique (session_id, person_id)
);

-- exactly one of cluster_id / nucleus_id / activity_id must be set
create table user_permissions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  role        permission_role_enum not null,
  cluster_id  uuid references clusters(id),
  nucleus_id  uuid references nuclei(id),
  activity_id uuid references activities(id),
  constraint one_scope_required check (
    (cluster_id  is not null)::int +
    (nucleus_id  is not null)::int +
    (activity_id is not null)::int = 1
  )
);

create table timeline_cycles (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  start_date  date not null,
  end_date    date not null,
  cluster_id  uuid references clusters(id)  -- null = applies to all clusters
);

create table timeline_events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_date  date not null,
  end_date    date,
  cluster_id  uuid references clusters(id),
  nucleus_id  uuid references nuclei(id),
  location    text
);

-- append-only audit trail; never update or delete rows
create table event_log (
  id          uuid primary key default gen_random_uuid(),
  timestamp   timestamptz not null default now(),
  type        event_log_type_enum not null,
  cluster_id  uuid references clusters(id),
  nucleus_id  uuid references nuclei(id),
  activity_id uuid references activities(id),
  person_id   uuid references persons(id),
  user_id     uuid references profiles(id) on delete set null,
  description text not null,
  details     jsonb
);


-- ============================================================
-- Indexes
-- ============================================================

create index on nuclei (cluster_id);
create index on nucleus_enrollments (person_id);
create index on nucleus_enrollments (nucleus_id);
create index on activities (nucleus_id);
create index on activity_participants (activity_id);
create index on activity_participants (person_id);
create index on sessions (activity_id);
create index on sessions (date);
create index on session_attendance (session_id);
create index on course_enrollments (person_id);
create index on user_permissions (user_id);
create index on event_log (nucleus_id);
create index on event_log (person_id);
create index on event_log (timestamp);


-- ============================================================
-- Trigger: auto-create profile on signup
-- ============================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();


-- ============================================================
-- Row Level Security — enable on all tables
-- ============================================================

alter table profiles           enable row level security;
alter table clusters           enable row level security;
alter table nuclei             enable row level security;
alter table persons            enable row level security;
alter table nucleus_enrollments enable row level security;
alter table courses            enable row level security;
alter table course_enrollments enable row level security;
alter table activities         enable row level security;
alter table activity_participants enable row level security;
alter table sessions           enable row level security;
alter table session_attendance enable row level security;
alter table user_permissions   enable row level security;
alter table timeline_cycles    enable row level security;
alter table timeline_events    enable row level security;
alter table event_log          enable row level security;


-- ============================================================
-- RLS Helper Functions
-- ============================================================

create or replace function is_admin()
returns boolean as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$ language sql security definer stable;

create or replace function user_has_cluster_access(cid uuid)
returns boolean as $$
  select exists (
    select 1 from user_permissions up
    where up.user_id = auth.uid() and (
      up.cluster_id = cid
      or up.nucleus_id in (select id from nuclei where cluster_id = cid)
      or up.activity_id in (
        select a.id from activities a
        join nuclei n on n.id = a.nucleus_id
        where n.cluster_id = cid
      )
    )
  );
$$ language sql security definer stable;

create or replace function user_has_nucleus_access(nid uuid)
returns boolean as $$
  select exists (
    select 1 from user_permissions up
    where up.user_id = auth.uid() and (
      up.nucleus_id = nid
      or up.cluster_id = (select cluster_id from nuclei where id = nid)
      or up.activity_id in (select id from activities where nucleus_id = nid)
    )
  );
$$ language sql security definer stable;

create or replace function user_has_activity_access(aid uuid)
returns boolean as $$
  select exists (
    select 1 from user_permissions up
    where up.user_id = auth.uid() and (
      up.activity_id = aid
      or up.nucleus_id = (select nucleus_id from activities where id = aid)
      or up.cluster_id = (
        select n.cluster_id from activities a
        join nuclei n on n.id = a.nucleus_id
        where a.id = aid
      )
    )
  );
$$ language sql security definer stable;


-- ============================================================
-- RLS Policies
-- ============================================================

-- profiles
create policy "Read own profile or admin" on profiles
  for select using (id = auth.uid() or is_admin());

create policy "Update own profile" on profiles
  for update using (id = auth.uid() or is_admin());

-- clusters
create policy "Read accessible clusters" on clusters
  for select using (deleted_at is null and (is_admin() or user_has_cluster_access(id)));

create policy "Admins manage clusters" on clusters
  for all using (is_admin());

-- nuclei
create policy "Read accessible nuclei" on nuclei
  for select using (deleted_at is null and (is_admin() or user_has_nucleus_access(id)));

create policy "Cluster coordinators manage nuclei" on nuclei
  for all using (
    is_admin() or exists (
      select 1 from user_permissions
      where user_id = auth.uid()
        and role = 'cluster_coordinator'
        and cluster_id = nuclei.cluster_id
    )
  );

create policy "Nucleus collaborators rename their nucleus" on nuclei
  for update using (
    exists (
      select 1 from user_permissions
      where user_id = auth.uid()
        and role = 'nucleus_collaborator'
        and nucleus_id = nuclei.id
    )
  );

-- persons
create policy "Read persons in scope" on persons
  for select using (
    deleted_at is null and (
      is_admin()
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

create policy "Activity leads and above create persons" on persons
  for insert with check (
    is_admin() or exists (
      select 1 from user_permissions
      where user_id = auth.uid()
        and role in ('cluster_coordinator', 'nucleus_collaborator', 'activity_lead')
    )
  );

create policy "Update persons in scope" on persons
  for update using (
    is_admin()
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

-- nucleus_enrollments
create policy "Read enrollments in accessible nuclei" on nucleus_enrollments
  for select using (is_admin() or user_has_nucleus_access(nucleus_id));

create policy "Nucleus collaborators manage enrollments" on nucleus_enrollments
  for all using (
    is_admin() or exists (
      select 1 from user_permissions
      where user_id = auth.uid()
        and role in ('cluster_coordinator', 'nucleus_collaborator')
        and (
          nucleus_id = nucleus_enrollments.nucleus_id
          or cluster_id = (select cluster_id from nuclei where id = nucleus_enrollments.nucleus_id)
        )
    )
  );

-- courses
create policy "Authenticated users read active courses" on courses
  for select using (auth.uid() is not null and is_active = true);

create policy "Admins manage courses" on courses
  for all using (is_admin());

-- course_enrollments
create policy "Read course enrollments in scope" on course_enrollments
  for select using (
    is_admin()
    or exists (
      select 1 from nucleus_enrollments ne
      where ne.person_id = course_enrollments.person_id
        and ne.deleted_at is null
        and user_has_nucleus_access(ne.nucleus_id)
    )
    or exists (
      select 1 from activity_participants ap
      where ap.person_id = course_enrollments.person_id
        and ap.deleted_at is null
        and user_has_activity_access(ap.activity_id)
    )
  );

create policy "Activity leads and above manage course enrollments" on course_enrollments
  for all using (
    is_admin() or exists (
      select 1 from user_permissions
      where user_id = auth.uid()
        and role in ('cluster_coordinator', 'nucleus_collaborator', 'activity_lead')
    )
  );

-- activities
create policy "Read activities in accessible nuclei" on activities
  for select using (deleted_at is null and (is_admin() or user_has_nucleus_access(nucleus_id)));

create policy "Nucleus collaborators manage activities" on activities
  for all using (
    is_admin() or exists (
      select 1 from user_permissions
      where user_id = auth.uid()
        and role in ('cluster_coordinator', 'nucleus_collaborator')
        and (
          nucleus_id = activities.nucleus_id
          or cluster_id = (select cluster_id from nuclei where id = activities.nucleus_id)
        )
    )
  );

-- activity_participants
create policy "Read participants in accessible activities" on activity_participants
  for select using (deleted_at is null and (is_admin() or user_has_activity_access(activity_id)));

create policy "Activity leads and above manage participants" on activity_participants
  for all using (is_admin() or user_has_activity_access(activity_id));

-- sessions
create policy "Read sessions in accessible activities" on sessions
  for select using (is_admin() or user_has_activity_access(activity_id));

create policy "Activity leads and above manage sessions" on sessions
  for all using (is_admin() or user_has_activity_access(activity_id));

-- session_attendance
create policy "Read attendance in accessible sessions" on session_attendance
  for select using (
    is_admin() or exists (
      select 1 from sessions s
      where s.id = session_attendance.session_id
        and user_has_activity_access(s.activity_id)
    )
  );

create policy "Activity leads and above manage attendance" on session_attendance
  for all using (
    is_admin() or exists (
      select 1 from sessions s
      where s.id = session_attendance.session_id
        and user_has_activity_access(s.activity_id)
    )
  );

-- user_permissions
create policy "Read own permissions" on user_permissions
  for select using (user_id = auth.uid() or is_admin());

create policy "Admins manage all permissions" on user_permissions
  for all using (is_admin());

create policy "Cluster coordinators assign nucleus collaborators" on user_permissions
  for insert with check (
    is_admin() or (
      role = 'nucleus_collaborator'
      and exists (
        select 1 from user_permissions up
        where up.user_id = auth.uid()
          and up.role = 'cluster_coordinator'
          and up.cluster_id = (select cluster_id from nuclei where id = user_permissions.nucleus_id)
      )
    )
  );

create policy "Nucleus collaborators assign activity leads" on user_permissions
  for insert with check (
    is_admin() or (
      role = 'activity_lead'
      and exists (
        select 1 from user_permissions up
        where up.user_id = auth.uid()
          and up.role in ('cluster_coordinator', 'nucleus_collaborator')
          and (
            up.nucleus_id = (select nucleus_id from activities where id = user_permissions.activity_id)
            or up.cluster_id = (
              select n.cluster_id from activities a
              join nuclei n on n.id = a.nucleus_id
              where a.id = user_permissions.activity_id
            )
          )
      )
    )
  );

-- timeline_cycles
create policy "Authenticated users read timeline cycles in scope" on timeline_cycles
  for select using (
    auth.uid() is not null
    and (cluster_id is null or is_admin() or user_has_cluster_access(cluster_id))
  );

create policy "Admins manage timeline cycles" on timeline_cycles
  for all using (is_admin());

-- timeline_events
create policy "Authenticated users read timeline events in scope" on timeline_events
  for select using (
    auth.uid() is not null
    and (cluster_id is null or is_admin() or user_has_cluster_access(cluster_id))
  );

create policy "Cluster coordinators manage timeline events" on timeline_events
  for all using (
    is_admin() or (
      cluster_id is not null
      and exists (
        select 1 from user_permissions
        where user_id = auth.uid()
          and role = 'cluster_coordinator'
          and cluster_id = timeline_events.cluster_id
      )
    )
  );

-- event_log
create policy "Read event log in scope" on event_log
  for select using (
    is_admin()
    or (nucleus_id is not null and user_has_nucleus_access(nucleus_id))
    or (cluster_id is not null and user_has_cluster_access(cluster_id))
  );

create policy "Authenticated users append to event log" on event_log
  for insert with check (auth.uid() is not null);


-- ============================================================
-- User Management: Extended RLS for Coordinators
-- ============================================================

-- All helpers are security definer so their internal queries bypass RLS,
-- preventing recursive policy evaluation between nuclei ↔ user_permissions.

create or replace function coordinator_cluster_ids()
returns setof uuid language sql security definer stable as $$
  select cluster_id from user_permissions
  where user_id = auth.uid() and role = 'cluster_coordinator' and cluster_id is not null
$$;

create or replace function nucleus_collaborator_nucleus_ids()
returns setof uuid language sql security definer stable as $$
  select nucleus_id from user_permissions
  where user_id = auth.uid() and role = 'nucleus_collaborator' and nucleus_id is not null
$$;

-- Nucleus IDs that fall inside the caller's coordinated clusters.
-- Must be security definer so the nuclei query inside bypasses nuclei RLS.
create or replace function nuclei_in_coordinator_clusters()
returns setof uuid language sql security definer stable as $$
  select n.id from nuclei n
  where n.cluster_id = any(
    select cluster_id from user_permissions
    where user_id = auth.uid() and role = 'cluster_coordinator' and cluster_id is not null
  )
$$;

-- Activity IDs that fall inside the caller's coordinated clusters.
create or replace function activities_in_coordinator_clusters()
returns setof uuid language sql security definer stable as $$
  select a.id from activities a
  join nuclei n on n.id = a.nucleus_id
  where n.cluster_id = any(
    select cluster_id from user_permissions
    where user_id = auth.uid() and role = 'cluster_coordinator' and cluster_id is not null
  )
$$;

-- Activity IDs that fall inside the caller's collaborating nuclei.
create or replace function activities_in_collaborator_nuclei()
returns setof uuid language sql security definer stable as $$
  select a.id from activities a
  where a.nucleus_id = any(
    select nucleus_id from user_permissions
    where user_id = auth.uid() and role = 'nucleus_collaborator' and nucleus_id is not null
  )
$$;

-- Cluster coordinators and nucleus collaborators can see profiles of users they manage.
-- Queries user_permissions directly (safe: user_permissions policies don't query profiles).
create policy "Coordinators see managed user profiles" on profiles
  for select using (
    exists (
      select 1 from user_permissions up
      where up.user_id = profiles.id
        and (
          up.cluster_id = any(select coordinator_cluster_ids())
          or up.nucleus_id = any(select nuclei_in_coordinator_clusters())
          or up.activity_id = any(select activities_in_coordinator_clusters())
          or (up.role = 'activity_lead'
              and up.activity_id = any(select activities_in_collaborator_nuclei()))
        )
    )
  );

-- Cluster coordinators and nucleus collaborators can see permissions they manage.
-- Uses only security-definer functions — no direct nuclei/activities subqueries —
-- which breaks the nuclei ↔ user_permissions recursion cycle.
create policy "Coordinators see managed user permissions" on user_permissions
  for select using (
    cluster_id = any(select coordinator_cluster_ids())
    or nucleus_id = any(select nuclei_in_coordinator_clusters())
    or activity_id = any(select activities_in_coordinator_clusters())
    or (role = 'activity_lead'
        and activity_id = any(select activities_in_collaborator_nuclei()))
  );


-- ============================================================
-- Seed: Courses catalog
-- ============================================================

insert into courses (name, short_name, "order", is_active) values
  ('Book 1: Reflections on the Life of the Spirit',    'Book 1', 1, true),
  ('Book 2: Arising to Serve',                          'Book 2', 2, true),
  ('Book 3: Teaching Children''s Classes Grade 1',     'Book 3', 3, true),
  ('Book 4: The Twin Manifestations',                   'Book 4', 4, true),
  ('Book 5: Releasing the Powers of Junior Youth',      'Book 5', 5, true),
  ('Book 6: Teaching the Cause',                        'Book 6', 6, true),
  ('Book 7: Walking Together on a Path of Service',     'Book 7', 7, true);
