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

-- 'viewer' is a legacy enum value from an earlier permissions model and
-- is unused by current code (see ROLE_BADGE_CLASSES in src/lib/permissions.ts
-- where it's tagged "legacy"). It is kept here because Postgres doesn't
-- support dropping enum values in place — the canonical scoped roles are
-- cluster_coordinator, nucleus_collaborator, activity_lead. Global roles
-- (admin, super_admin, regional_viewer) live as boolean flags on profiles,
-- not in this enum.
create type permission_role_enum as enum (
  'cluster_coordinator', 'nucleus_collaborator',
  'activity_lead', 'viewer'
);

-- 3-state completion, shared by course-level and unit-level enrollments.
create type completion_status_enum as enum (
  'in_progress', 'partially_completed', 'completed'
);

create type event_log_type_enum as enum (
  'activity_created', 'participant_added', 'participant_removed',
  'circle_movement', 'course_completed', 'course_started',
  'person_created', 'person_deleted', 'person_merged', 'nucleus_created', 'nucleus_deleted', 'activity_deleted', 'session_logged', 'profile_updated'
);


-- ============================================================
-- Tables
-- ============================================================

-- profiles extends auth.users (auto-created on signup via trigger below)
create table profiles (
  id                    uuid references auth.users(id) on delete cascade primary key,
  name                  text not null,
  is_admin              boolean not null default false,
  person_id             uuid,  -- FK to persons added after persons table is created
  profile_image_url     text,
  must_change_password  boolean not null default false,
  privacy_acknowledged_at              timestamptz,
  privacy_policy_version_acknowledged  text,
  created_at            timestamptz not null default now()
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

-- Identity is `id` — names are NOT unique. The UI disambiguates
-- by context (nucleus / activity / age group / ...).
--
-- age_group       : program cohort the person fits into.
-- profile_status  : 'provisional' for half-known people, 'confirmed' otherwise.
-- is_minor        : derived from age_group for child / junior_youth (always true)
--                   and adult (always false); user-settable for youth / unknown.
--
-- Privacy: when is_minor = true the app must not collect email/phone.
create table persons (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  email               text,
  phone               text,
  is_minor            boolean not null default false,
  age_group           text not null default 'unknown'
                      check (age_group in ('child', 'junior_youth', 'youth', 'adult', 'unknown')),
  profile_status      text not null default 'provisional'
                      check (profile_status in ('provisional', 'confirmed')),
  capacities          text[] not null default '{}',
  notes               text,
  profile_image_url   text,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  merged_into_id      uuid references persons(id),
  constraint persons_age_minor_invariant check (
    (age_group in ('child', 'junior_youth') and is_minor = true)
    or (age_group = 'adult' and is_minor = false)
    or age_group in ('youth', 'unknown')
  )
);

alter table profiles add constraint profiles_person_id_fkey
  foreign key (person_id) references persons(id) on delete set null;

create table nucleus_enrollments (
  id                  uuid primary key default gen_random_uuid(),
  person_id           uuid not null references persons(id) on delete cascade,
  nucleus_id          uuid not null references nuclei(id),
  engagement_level    engagement_level_enum,
  primary_contact_id  uuid references persons(id) on delete set null,
  deleted_at          timestamptz,
  unique (person_id, nucleus_id)
);

-- The curriculum catalog. A course belongs to one of three streams:
--   ruhi_main : the 14-book main sequence
--   branch    : a branch course nested under a main-sequence book
--               (parent_course_id points at Book 3 / Book 5)
--   jysep     : a Junior Youth Spiritual Empowerment Program text
--
-- allows_whole_completion is false for books whose unit set is not
-- yet finalized (Books 12-14 carry a placeholder Unit 3) — those
-- can only ever be marked partially complete, never whole.
create table courses (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  short_name              text not null,
  description             text,
  "order"                 int not null default 0,
  stream                  text not null default 'ruhi_main'
                          check (stream in ('ruhi_main', 'branch', 'jysep')),
  parent_course_id        uuid references courses(id),
  allows_whole_completion boolean not null default true,
  is_active               boolean not null default true
);

-- Units of a Ruhi book. The count is NOT assumed to be 3 — Book 3
-- has 2, Books 12-14 carry a placeholder. JY texts and branch
-- courses have no units (tracked whole/partial at the course level).
-- A placeholder unit reserves a slot for unreleased content and can
-- be displayed but never marked complete.
create table course_units (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references courses(id),
  name           text not null,
  "order"        int not null default 0,
  is_placeholder boolean not null default false,
  unique (course_id, "order")
);

create table course_enrollments (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references persons(id) on delete cascade,
  course_id    uuid not null references courses(id),
  status       completion_status_enum not null default 'in_progress',
  started_at   date,
  completed_at date,
  nucleus_id   uuid references nuclei(id),
  unique (person_id, course_id)
);

-- Per-person unit-level completion for Ruhi books. A book's course-
-- level enrollment is kept as a rollup of its unit enrollments by
-- the application layer (see syncCurriculumProgress).
create table course_unit_enrollments (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid not null references persons(id) on delete cascade,
  course_unit_id uuid not null references course_units(id),
  status         completion_status_enum not null default 'in_progress',
  started_at     date,
  completed_at   date,
  nucleus_id     uuid references nuclei(id),
  unique (person_id, course_unit_id)
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
  person_id    uuid not null references persons(id) on delete cascade,
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
  person_id  uuid not null references persons(id) on delete cascade,
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
  person_id   uuid references persons(id) on delete set null,
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
create index on course_unit_enrollments (person_id);
create index on course_units (course_id);
create index on courses (parent_course_id);
create index on user_permissions (user_id);
create index on event_log (nucleus_id);
create index on event_log (person_id);
create index on event_log (timestamp);


-- ============================================================
-- Reflective Learning System
--   See migrations/20260519_reflective_learning_system.sql for
--   the full rationale. Two-layer append-only journal with a
--   shared "learning themes" vocabulary that ties activity-level
--   field notes to nucleus-level institutional memory.
-- ============================================================

create table learning_themes (
  id             uuid primary key default gen_random_uuid(),
  nucleus_id     uuid not null references nuclei(id) on delete cascade,
  name           text not null,
  description    text,
  color          text not null default 'amber',
  status         text not null default 'emerging'
                 check (status in ('emerging', 'established', 'archived')),
  proposed_by    uuid references profiles(id) on delete set null,
  proposed_at    timestamptz not null default now(),
  promoted_at    timestamptz,
  merged_into_id uuid references learning_themes(id) on delete set null,
  unique (nucleus_id, name)
);

create table journal_entries (
  id                uuid primary key default gen_random_uuid(),
  nucleus_id        uuid references nuclei(id) on delete cascade,
  source            text not null check (source in ('activity', 'nucleus', 'cluster')),
  activity_id       uuid references activities(id) on delete set null,
  cluster_id        uuid references clusters(id) on delete cascade,
  cluster_theme_id  uuid,
  author_id         uuid references profiles(id) on delete set null,
  occurred_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  edited_at         timestamptz,
  edited_by         uuid references profiles(id) on delete set null,
  what_happened     text,
  -- Single free-text reflection that replaced the four detailed
  -- prompts below in the Activity Notebook composer. The legacy
  -- columns are retained so historical entries still render.
  learning          text,
  encouraging_signs text,
  challenges        text,
  people_emerging   text,
  follow_up         text,
  body              text,
  constraint source_scope_invariant check (
    (source = 'activity' and activity_id is not null and nucleus_id is not null and cluster_id is null)
    or (source = 'nucleus' and nucleus_id is not null and activity_id is null and cluster_id is null)
    or (source = 'cluster' and cluster_id is not null and nucleus_id is null and activity_id is null)
  )
);

create table journal_entry_themes (
  entry_id   uuid not null references journal_entries(id) on delete cascade,
  theme_id   uuid not null references learning_themes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, theme_id)
);

-- Who attended the occurrence captured by an Activity Notebook
-- entry. Drawn from the activity's standing roster at write time;
-- queried by the data-freshness prompts.
create table journal_entry_attendance (
  entry_id   uuid not null references journal_entries(id) on delete cascade,
  person_id  uuid not null references persons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, person_id)
);

create index on learning_themes (nucleus_id, status);
create index on journal_entries (nucleus_id, occurred_at desc);
create index on journal_entries (activity_id, occurred_at desc)
  where activity_id is not null;
create index on journal_entry_themes (theme_id);
create index on journal_entry_attendance (person_id);

alter table learning_themes          enable row level security;
alter table journal_entries          enable row level security;
alter table journal_entry_attendance enable row level security;
alter table journal_entry_themes enable row level security;

create policy "Read themes in accessible nuclei" on learning_themes
  for select using (is_admin() or user_has_nucleus_access(nucleus_id));

create policy "Activity leads and above propose themes" on learning_themes
  for insert with check (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator', 'activity_lead')
        and (
          up.nucleus_id = learning_themes.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = learning_themes.nucleus_id)
          or up.activity_id in (select id from activities where nucleus_id = learning_themes.nucleus_id)
        )
    )
  );

create policy "Nucleus collaborators curate themes" on learning_themes
  for update using (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator')
        and (
          up.nucleus_id = learning_themes.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = learning_themes.nucleus_id)
        )
    )
  );

-- A cluster-level merge re-points each nucleus's local copy of the
-- source theme onto the survivor; where a nucleus already had both,
-- the duplicate copy must be deleted.
create policy "Nucleus collaborators delete themes" on learning_themes
  for delete using (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator')
        and (
          up.nucleus_id = learning_themes.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = learning_themes.nucleus_id)
        )
    )
  );

create policy "Read entries in accessible nuclei" on journal_entries
  for select using (is_admin() or user_has_nucleus_access(nucleus_id));

create policy "Write activity entries" on journal_entries
  for insert with check (
    source = 'activity'
    and activity_id is not null
    and (is_admin() or user_has_activity_access(activity_id))
  );

create policy "Write nucleus entries" on journal_entries
  for insert with check (
    source = 'nucleus'
    and (
      is_admin() or exists (
        select 1 from user_permissions up
        where up.user_id = auth.uid()
          and up.role in ('cluster_coordinator', 'nucleus_collaborator')
          and (
            up.nucleus_id = journal_entries.nucleus_id
            or up.cluster_id = (select cluster_id from nuclei where id = journal_entries.nucleus_id)
          )
      )
    )
  );

create policy "Read entry tags in accessible nuclei" on journal_entry_themes
  for select using (
    is_admin() or exists (
      select 1 from journal_entries e
      where e.id = journal_entry_themes.entry_id
        and user_has_nucleus_access(e.nucleus_id)
    )
  );

create policy "Tag own entries" on journal_entry_themes
  for insert with check (
    is_admin() or exists (
      select 1 from journal_entries e
      where e.id = journal_entry_themes.entry_id
        and (
          (e.source = 'activity' and e.activity_id is not null and user_has_activity_access(e.activity_id))
          or (e.source = 'nucleus' and exists (
            select 1 from user_permissions up
            where up.user_id = auth.uid()
              and up.role in ('cluster_coordinator', 'nucleus_collaborator')
              and (
                up.nucleus_id = e.nucleus_id
                or up.cluster_id = (select cluster_id from nuclei where id = e.nucleus_id)
              )
          ))
        )
    )
  );

create policy "Nucleus collaborators re-tag during merge" on journal_entry_themes
  for update using (
    is_admin() or exists (
      select 1 from journal_entries e
      join nuclei n on n.id = e.nucleus_id
      where e.id = journal_entry_themes.entry_id
        and exists (
          select 1 from user_permissions up
          where up.user_id = auth.uid()
            and up.role in ('cluster_coordinator', 'nucleus_collaborator')
            and (up.nucleus_id = e.nucleus_id or up.cluster_id = n.cluster_id)
        )
    )
  );

create policy "Edit own entries or as curator" on journal_entries
  for update using (
    is_admin()
    or author_id = auth.uid()
    or (source = 'activity' and activity_id is not null and user_has_activity_access(activity_id))
    or (source = 'nucleus' and nucleus_id is not null and exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator')
        and (
          up.nucleus_id = journal_entries.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = journal_entries.nucleus_id)
        )
    ))
    or (source = 'cluster' and cluster_id is not null and exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role = 'cluster_coordinator'
        and up.cluster_id = journal_entries.cluster_id
    ))
  );

-- Journal entries are otherwise append-only; this DELETE policy is
-- deliberately narrow — it only permits removing the cluster's own
-- archive-notice entries (so un-archiving a cluster theme withdraws
-- the "no longer tracked" note), and only by a coordinator of that
-- cluster.
create policy "Cluster coordinators withdraw archive notices" on journal_entries
  for delete using (
    cluster_archive_notice_for is not null
    and (
      is_admin() or exists (
        select 1 from user_permissions up
        where up.user_id = auth.uid()
          and up.role = 'cluster_coordinator'
          and up.cluster_id = (select cluster_id from nuclei where id = journal_entries.nucleus_id)
      )
    )
  );

-- Delete a whole activity / nucleus entry. Mirrors the edit scope:
-- author, activity-scope access, or CC/NC on the parent nucleus.
-- Combines (OR) with the cluster archive-notice policy above.
create policy "Delete own entries or as curator" on journal_entries
  for delete using (
    is_admin()
    or author_id = auth.uid()
    or (source = 'activity' and activity_id is not null and user_has_activity_access(activity_id))
    or (source = 'nucleus' and nucleus_id is not null and exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator')
        and (
          up.nucleus_id = journal_entries.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = journal_entries.nucleus_id)
        )
    ))
  );

create policy "Untag own entries" on journal_entry_themes
  for delete using (
    is_admin() or exists (
      select 1 from journal_entries e
      where e.id = journal_entry_themes.entry_id
        and (
          (e.source = 'activity' and e.activity_id is not null and user_has_activity_access(e.activity_id))
          or (e.source = 'nucleus' and exists (
            select 1 from user_permissions up
            where up.user_id = auth.uid()
              and up.role in ('cluster_coordinator', 'nucleus_collaborator')
              and (
                up.nucleus_id = e.nucleus_id
                or up.cluster_id = (select cluster_id from nuclei where id = e.nucleus_id)
              )
          ))
        )
    )
  );

-- journal_entry_attendance ------------------------------------

create policy "Read attendance in accessible entries" on journal_entry_attendance
  for select using (
    is_admin() or exists (
      select 1 from journal_entries e
      where e.id = journal_entry_attendance.entry_id
        and user_has_nucleus_access(e.nucleus_id)
    )
  );

create policy "Record attendance on own entries" on journal_entry_attendance
  for insert with check (
    is_admin() or exists (
      select 1 from journal_entries e
      where e.id = journal_entry_attendance.entry_id
        and e.source = 'activity'
        and e.activity_id is not null
        and user_has_activity_access(e.activity_id)
    )
  );

create policy "Amend attendance on own entries" on journal_entry_attendance
  for delete using (
    is_admin() or exists (
      select 1 from journal_entries e
      where e.id = journal_entry_attendance.entry_id
        and e.source = 'activity'
        and e.activity_id is not null
        and user_has_activity_access(e.activity_id)
    )
  );


-- ============================================================
-- Cluster Learning Hub
--   See migrations/20260520_cluster_learning_hub.sql.
-- ============================================================

create table cluster_themes (
  id                  uuid primary key default gen_random_uuid(),
  cluster_id          uuid not null references clusters(id) on delete cascade,
  name                text not null,
  description         text,
  color               text not null default 'amber',
  consolidation_level int not null default 25
                      check (consolidation_level between 0 and 100),
  created_at          timestamptz not null default now(),
  created_by          uuid references profiles(id) on delete set null,
  archived_at         timestamptz,
  merged_into_id      uuid references cluster_themes(id) on delete set null,
  unique (cluster_id, name)
);

alter table learning_themes
  add column cluster_theme_id uuid references cluster_themes(id) on delete set null;
alter table learning_themes
  add column pushed_from_cluster boolean not null default false;

alter table journal_entries
  add constraint journal_entries_cluster_theme_fk
  foreign key (cluster_theme_id) references cluster_themes(id) on delete set null;

-- Tags the system note posted to nuclei when a cluster theme is
-- archived, so it can be withdrawn if the theme is un-archived.
alter table journal_entries
  add column cluster_archive_notice_for uuid references cluster_themes(id) on delete set null;

create index on cluster_themes (cluster_id, archived_at);
create index on learning_themes (cluster_theme_id) where cluster_theme_id is not null;
create index on journal_entries (cluster_id, occurred_at desc) where cluster_id is not null;
create index on journal_entries (cluster_theme_id) where cluster_theme_id is not null;

create or replace function ensure_cluster_theme_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c_id  uuid;
  ct_id uuid;
begin
  if new.cluster_theme_id is not null then return new; end if;
  select cluster_id into c_id from nuclei where id = new.nucleus_id;
  if c_id is null then return new; end if;
  select id into ct_id
    from cluster_themes
    where cluster_id = c_id and lower(name) = lower(new.name)
    limit 1;
  if ct_id is null then
    insert into cluster_themes (cluster_id, name, color, description, created_by)
      values (c_id, new.name, coalesce(new.color, 'amber'), new.description, new.proposed_by)
      returning id into ct_id;
  end if;
  new.cluster_theme_id := ct_id;
  return new;
end;
$$;

create trigger ensure_cluster_theme_link_trigger
  before insert on learning_themes
  for each row execute function ensure_cluster_theme_link();

alter table cluster_themes enable row level security;

create policy "Read cluster themes" on cluster_themes
  for select using (is_admin() or user_has_cluster_access(cluster_id));

create policy "Cluster coordinators manage cluster themes" on cluster_themes
  for all using (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role = 'cluster_coordinator'
        and up.cluster_id = cluster_themes.cluster_id
    )
  );

create policy "Read cluster entries in accessible clusters" on journal_entries
  for select using (
    source = 'cluster'
    and cluster_id is not null
    and (is_admin() or user_has_cluster_access(cluster_id))
  );

create policy "Write cluster synthesis entries" on journal_entries
  for insert with check (
    source = 'cluster'
    and cluster_id is not null
    and (
      is_admin() or exists (
        select 1 from user_permissions up
        where up.user_id = auth.uid()
          and up.role = 'cluster_coordinator'
          and up.cluster_id = journal_entries.cluster_id
      )
    )
  );


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
alter table course_units       enable row level security;
alter table course_enrollments enable row level security;
alter table course_unit_enrollments enable row level security;
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

-- "Can the caller edit this person?" — mirrors the persons UPDATE policy so
-- the merge guard matches who may already edit them.
create or replace function app_can_edit_person(p_person uuid)
returns boolean as $$
  select
    is_admin()
    or exists (
      select 1 from persons pp
      where pp.id = p_person
        and pp.cluster_id is not null
        and user_has_cluster_access(pp.cluster_id)
    )
    or exists (
      select 1 from nucleus_enrollments ne
      where ne.person_id = p_person
        and ne.deleted_at is null
        and user_has_nucleus_access(ne.nucleus_id)
    )
    or exists (
      select 1 from activity_participants ap
      where ap.person_id = p_person
        and ap.deleted_at is null
        and user_has_activity_access(ap.activity_id)
    );
$$ language sql security definer stable;

-- Collapse a duplicate person (loser) into a survivor: re-point every
-- relationship, dropping rows that would collide with one the survivor already
-- has, then soft-delete + tag the loser. See migration 20260604_person_merge.sql
-- for the full rationale.
create or replace function merge_persons(p_loser uuid, p_survivor uuid)
returns void as $$
declare
  v_loser_name    text;
  v_survivor_name text;
begin
  if p_loser is null or p_survivor is null then
    raise exception 'Both the duplicate and the surviving person are required';
  end if;
  if p_loser = p_survivor then
    raise exception 'Cannot merge a person into themselves';
  end if;

  select name into v_loser_name from persons where id = p_loser and deleted_at is null;
  if v_loser_name is null then
    raise exception 'The person to merge was not found or is already archived';
  end if;
  select name into v_survivor_name from persons where id = p_survivor and deleted_at is null;
  if v_survivor_name is null then
    raise exception 'The surviving person was not found or is archived';
  end if;

  if not (app_can_edit_person(p_loser) and app_can_edit_person(p_survivor)) then
    raise exception 'You do not have permission to merge these people';
  end if;

  delete from nucleus_enrollments l
  where l.person_id = p_loser
    and exists (select 1 from nucleus_enrollments s
                where s.person_id = p_survivor and s.nucleus_id = l.nucleus_id);
  update nucleus_enrollments set person_id = p_survivor where person_id = p_loser;
  update nucleus_enrollments set primary_contact_id = p_survivor where primary_contact_id = p_loser;

  delete from course_enrollments l
  where l.person_id = p_loser
    and exists (select 1 from course_enrollments s
                where s.person_id = p_survivor and s.course_id = l.course_id);
  update course_enrollments set person_id = p_survivor where person_id = p_loser;

  delete from course_unit_enrollments l
  where l.person_id = p_loser
    and exists (select 1 from course_unit_enrollments s
                where s.person_id = p_survivor and s.course_unit_id = l.course_unit_id);
  update course_unit_enrollments set person_id = p_survivor where person_id = p_loser;

  delete from activity_participants l
  where l.person_id = p_loser
    and exists (select 1 from activity_participants s
                where s.person_id = p_survivor and s.activity_id = l.activity_id);
  update activity_participants set person_id = p_survivor where person_id = p_loser;

  delete from session_attendance l
  where l.person_id = p_loser
    and exists (select 1 from session_attendance s
                where s.person_id = p_survivor and s.session_id = l.session_id);
  update session_attendance set person_id = p_survivor where person_id = p_loser;

  delete from journal_entry_attendance l
  where l.person_id = p_loser
    and exists (select 1 from journal_entry_attendance s
                where s.person_id = p_survivor and s.entry_id = l.entry_id);
  update journal_entry_attendance set person_id = p_survivor where person_id = p_loser;

  delete from person_capacities l
  where l.person_id = p_loser
    and exists (select 1 from person_capacities s
                where s.person_id = p_survivor and s.capacity_id = l.capacity_id);
  update person_capacities set person_id = p_survivor where person_id = p_loser;

  update household_members set linked_person_id = p_survivor where linked_person_id = p_loser;
  update profiles          set person_id        = p_survivor where person_id        = p_loser;
  update event_log         set person_id        = p_survivor where person_id        = p_loser;

  update persons s set
    email             = coalesce(s.email, l.email),
    phone             = coalesce(s.phone, l.phone),
    profile_image_url = coalesce(s.profile_image_url, l.profile_image_url),
    cluster_id        = coalesce(s.cluster_id, l.cluster_id)
  from persons l
  where s.id = p_survivor and l.id = p_loser;

  update persons set deleted_at = now(), merged_into_id = p_survivor where id = p_loser;

  insert into event_log (type, person_id, user_id, description, details)
  values (
    'person_merged', p_survivor, auth.uid(),
    format('Merged "%s" into "%s"', v_loser_name, v_survivor_name),
    jsonb_build_object('loserId', p_loser, 'loserName', v_loser_name,
                       'survivorId', p_survivor, 'survivorName', v_survivor_name)
  );
end;
$$ language plpgsql security definer;

grant execute on function app_can_edit_person(uuid) to authenticated;
grant execute on function merge_persons(uuid, uuid) to authenticated;


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

create policy "Admins delete persons" on persons
  for delete using (is_admin());

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

-- course_units
create policy "Authenticated users read course units" on course_units
  for select using (auth.uid() is not null);

create policy "Admins manage course units" on course_units
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

-- course_unit_enrollments
create policy "Read course unit enrollments in scope" on course_unit_enrollments
  for select using (
    is_admin()
    or exists (
      select 1 from nucleus_enrollments ne
      where ne.person_id = course_unit_enrollments.person_id
        and ne.deleted_at is null
        and user_has_nucleus_access(ne.nucleus_id)
    )
    or exists (
      select 1 from activity_participants ap
      where ap.person_id = course_unit_enrollments.person_id
        and ap.deleted_at is null
        and user_has_activity_access(ap.activity_id)
    )
  );

create policy "Activity leads and above manage course unit enrollments" on course_unit_enrollments
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

create policy "Activity leads update own activity" on activities
  for update
  using (
    deleted_at is null and exists (
      select 1 from user_permissions
      where user_id = auth.uid()
        and role = 'activity_lead'
        and activity_id = activities.id
    )
  )
  with check (
    deleted_at is null and exists (
      select 1 from user_permissions
      where user_id = auth.uid()
        and role = 'activity_lead'
        and activity_id = activities.id
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
-- Cluster-scoped capacity catalog
--   cluster_capacities  — the canonical capacity list for one cluster
--   person_capacities   — which person holds which catalog entry
-- Each cluster maintains its own independent list; a person in
-- multiple clusters can hold a capacity in each (separate rows).
-- See migration 20260529_cluster_capacity_catalog.sql.
-- ============================================================

create table cluster_capacities (
  id          uuid primary key default gen_random_uuid(),
  cluster_id  uuid not null references clusters(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- One canonical entry per (cluster, name), case-insensitively.
create unique index cluster_capacities_cluster_lower_name_key
  on cluster_capacities (cluster_id, lower(name));

create table person_capacities (
  person_id   uuid not null references persons(id) on delete cascade,
  capacity_id uuid not null references cluster_capacities(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (person_id, capacity_id)
);

create index person_capacities_capacity_id_idx on person_capacities (capacity_id);

alter table cluster_capacities enable row level security;
alter table person_capacities  enable row level security;

-- Read: anyone who can see the cluster.
create policy "Read capacities in accessible clusters" on cluster_capacities
  for select using (
    is_admin() or is_regional_viewer() or user_has_cluster_access(cluster_id)
  );

-- Create a new catalog entry: anyone who can edit within the cluster.
create policy "Add capacities in accessible clusters" on cluster_capacities
  for insert with check (
    is_admin() or user_has_cluster_access(cluster_id)
  );

-- Rename / merge: only admins and the cluster's own coordinators.
-- Pinned to cluster_id, so neither can act across clusters.
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

-- person_capacities: read/write follows access to the capacity's cluster.
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


-- ============================================================
-- Seed: Curriculum catalog
--   Ruhi main sequence (Books 1-14) + their units,
--   branch courses nested under Book 3 / Book 5,
--   and the Junior Youth Spiritual Empowerment Program texts.
-- ============================================================

-- Ruhi main sequence. Books 12-14 cannot be marked whole-complete
-- (their Unit 3 is a not-yet-released placeholder).
insert into courses (name, short_name, "order", stream, allows_whole_completion, is_active) values
  ('Book 1: Reflections on the Life of the Spirit',    'Book 1',  1,  'ruhi_main', true,  true),
  ('Book 2: Arising to Serve',                         'Book 2',  2,  'ruhi_main', true,  true),
  ('Book 3: Teaching Children''s Classes, Grade 1',    'Book 3',  3,  'ruhi_main', true,  true),
  ('Book 4: The Twin Manifestations',                  'Book 4',  4,  'ruhi_main', true,  true),
  ('Book 5: Releasing the Powers of Junior Youth',     'Book 5',  5,  'ruhi_main', true,  true),
  ('Book 6: Teaching the Cause',                       'Book 6',  6,  'ruhi_main', true,  true),
  ('Book 7: Walking Together on a Path of Service',    'Book 7',  7,  'ruhi_main', true,  true),
  ('Book 8: The Covenant of Baha''u''llah',             'Book 8',  8,  'ruhi_main', true,  true),
  ('Book 9: Gaining an Historical Perspective',        'Book 9',  9,  'ruhi_main', true,  true),
  ('Book 10: Building Vibrant Communities',            'Book 10', 10, 'ruhi_main', true,  true),
  ('Book 11: Material Means',                          'Book 11', 11, 'ruhi_main', true,  true),
  ('Book 12: Family and the Community',                'Book 12', 12, 'ruhi_main', false, true),
  ('Book 13: Engaging in Social Action',               'Book 13', 13, 'ruhi_main', false, true),
  ('Book 14: Participating in Public Discourse',       'Book 14', 14, 'ruhi_main', false, true);

-- Units of the main-sequence books.
insert into course_units (course_id, "order", name, is_placeholder)
select c.id, u.ord, u.unit_name, u.is_placeholder
from (values
  ('Book 1',  1, 'Understanding the Bahá''í Writings',                       false),
  ('Book 1',  2, 'Prayer',                                                   false),
  ('Book 1',  3, 'Life and Death',                                           false),
  ('Book 2',  1, 'The Joy of Teaching',                                      false),
  ('Book 2',  2, 'Uplifting Conversations',                                  false),
  ('Book 2',  3, 'Deepening Themes',                                         false),
  ('Book 3',  1, 'Some Principles of Bahá''í Education',                     false),
  ('Book 3',  2, 'Lessons for Children''s Classes, Grade 1',                false),
  ('Book 4',  1, 'The Greatness of This Day',                                false),
  ('Book 4',  2, 'The Life of the Báb',                                      false),
  ('Book 4',  3, 'The Life of Bahá''u''lláh',                                 false),
  ('Book 5',  1, 'Life''s Springtime',                                       false),
  ('Book 5',  2, 'An Age of Promise',                                        false),
  ('Book 5',  3, 'Serving as an Animator',                                   false),
  ('Book 6',  1, 'The Spiritual Nature of Teaching',                         false),
  ('Book 6',  2, 'Qualities and Attitudes Essential for Teaching',           false),
  ('Book 6',  3, 'The Act of Teaching',                                      false),
  ('Book 7',  1, 'The Spiritual Dynamics of Advancing on a Path of Service', false),
  ('Book 7',  2, 'Serving as a Tutor of the Institute Courses',              false),
  ('Book 7',  3, 'Promoting the Arts at the Grassroots',                     false),
  ('Book 8',  1, 'The Center of the Covenant and His Will and Testament',    false),
  ('Book 8',  2, 'The Guardian of the Faith',                                false),
  ('Book 8',  3, 'The Universal House of Justice',                           false),
  ('Book 9',  1, 'The Eternal Covenant',                                     false),
  ('Book 9',  2, 'Passage to Maturity',                                      false),
  ('Book 9',  3, 'A Sacred Enterprise',                                      false),
  ('Book 10', 1, 'Accompanying One Another on the Path of Service',          false),
  ('Book 10', 2, 'Consultation',                                             false),
  ('Book 10', 3, 'Dynamics of Service on an Area Teaching Committee',         false),
  ('Book 11', 1, 'Giving: The Spiritual Basis of Prosperity',                false),
  ('Book 11', 2, 'The Institution of the Fund',                              false),
  ('Book 11', 3, 'The Law of Huqúqu''lláh',                                  false),
  ('Book 12', 1, 'The Institution of Marriage',                              false),
  ('Book 12', 2, 'An Expanding Conversation on the Education of Children',    false),
  ('Book 12', 3, 'Unit 3 (placeholder — not yet released)',                  true),
  ('Book 13', 1, 'Stirrings at the Grassroots',                              false),
  ('Book 13', 2, 'Elements of a Conceptual Framework',                       false),
  ('Book 13', 3, 'Unit 3 (placeholder — not yet released)',                  true),
  ('Book 14', 1, 'The Nature of Our Contributions',                          false),
  ('Book 14', 2, 'Dynamics of Our Participation',                            false),
  ('Book 14', 3, 'Unit 3 (placeholder — not yet released)',                  true)
) as u(short_name, ord, unit_name, is_placeholder)
join courses c on c.short_name = u.short_name and c.stream = 'ruhi_main';

-- Branch courses, nested under Book 3 and Book 5. They behave as
-- independent courses for completion purposes.
insert into courses (name, short_name, "order", stream, parent_course_id, allows_whole_completion, is_active)
select b.name, b.short_name, b.ord, 'branch', c.id, true, true
from (values
  ('Book 3', 'Teaching Children''s Classes, Grade 2', 'Grade 2',         1),
  ('Book 3', 'Teaching Children''s Classes, Grade 3', 'Grade 3',         2),
  ('Book 3', 'Teaching Children''s Classes, Grade 4', 'Grade 4',         3),
  ('Book 5', 'Initial Impulse',                       'Initial Impulse', 1),
  ('Book 5', 'Widening Circle',                       'Widening Circle', 2)
) as b(parent_short_name, name, short_name, ord)
join courses c on c.short_name = b.parent_short_name and c.stream = 'ruhi_main';

-- Junior Youth Spiritual Empowerment Program texts. Tracked
-- whole/partial only — no units.
insert into courses (name, short_name, "order", stream, allows_whole_completion, is_active) values
  ('Breezes of Confirmation',          'Breezes of Confirmation',          1,  'jysep', true, true),
  ('Wellspring of Joy',                'Wellspring of Joy',                2,  'jysep', true, true),
  ('Habits of an Orderly Mind',        'Habits of an Orderly Mind',        3,  'jysep', true, true),
  ('Glimmerings of Hope',              'Glimmerings of Hope',              4,  'jysep', true, true),
  ('Walking the Straight Path',        'Walking the Straight Path',        5,  'jysep', true, true),
  ('On Health and Well-Being',         'On Health and Well-Being',         6,  'jysep', true, true),
  ('Learning About Excellence',        'Learning About Excellence',        7,  'jysep', true, true),
  ('Drawing on the Power of the Word', 'Drawing on the Power of the Word', 8,  'jysep', true, true),
  ('Thinking About Numbers',           'Thinking About Numbers',           9,  'jysep', true, true),
  ('Observation and Insight',          'Observation and Insight',          10, 'jysep', true, true),
  ('The Human Temple',                 'The Human Temple',                 11, 'jysep', true, true),
  ('Making Sense of Data',             'Making Sense of Data',             12, 'jysep', true, true),
  ('Spirit of Faith',                  'Spirit of Faith',                  13, 'jysep', true, true),
  ('Power of the Holy Spirit',         'Power of the Holy Spirit',         14, 'jysep', true, true),
  ('Rays of Light',                    'Rays of Light',                    15, 'jysep', true, true);
