-- ============================================================
-- FULL DEMO DATASET — Cedar Hollow / Northgate
--
-- Run this in the Supabase SQL Editor against the DEV project
-- ONLY. It (1) wipes every ordinary data row in the project —
-- clusters, nuclei, people, activities, journals, capacities,
-- milestones, timeline, LSA households, everything — and then
-- (2) seeds a rich, fully-fictional two-cluster demo covering
-- every feature area of the app.
--
-- What this script does NOT touch:
--   * auth.users / profiles — no logins are created or removed.
--     Your own login and any other real accounts are untouched.
--   * courses / course_units — the shared Ruhi/JYSEP curriculum
--     catalog is reference data, not "test data", and is left
--     exactly as-is; this script only links people to it.
--
-- Why a full wipe is safe here: this project's CI (the
-- "Integration tests" GitHub Actions job) re-seeds its own fixed
-- test fixtures (a "Test Cluster", a couple of test people, and
-- the perm-*@nucleus-test.invalid accounts) from scratch at the
-- start of every single run via scripts/seed.ts. Nothing in this
-- project depends on any of that data surviving between CI runs,
-- so wiping it here causes no lasting harm — the next PR's CI run
-- recreates exactly what it needs.
--
-- After this script, run scripts/seed-demo-accounts.sql (see the
-- instructions that came with this file) to wire up demo logins.
-- ============================================================


-- ============================================================
-- PART 0 — WIPE
-- FK-safe order: children before parents. See the comment block
-- at the top of this file for why a full wipe is safe here.
-- ============================================================

do $$
begin
  -- Break the one self-referencing edge before the bulk deletes.
  update persons set merged_into_id = null where merged_into_id is not null;

  -- journal_entries.activity_id is ON DELETE SET NULL (not cascade),
  -- but a source='activity' row's check constraint requires activity_id
  -- to stay non-null — so this must be deleted before activities, not
  -- left to cascade from nuclei/clusters later.
  delete from journal_entries;

  -- Same shape of trap: household_members.linked_person_id is ON DELETE
  -- SET NULL, but a row with no display_name relies on linked_person_id
  -- being non-null to satisfy household_members_has_identity. Must be
  -- deleted before persons, not left to cascade from clusters later
  -- (only bites once real household data exists, i.e. on a re-run).
  delete from household_members;

  delete from event_log;
  delete from user_permissions;
  delete from timeline_item_notes;
  delete from timeline_events;
  delete from timeline_cycles;
  delete from permission_requests;
  delete from activity_participants;
  delete from nucleus_enrollments;
  delete from session_attendance;
  delete from sessions;
  delete from activities;
  delete from persons;
  delete from nuclei;
  delete from clusters;

  raise notice 'Wipe complete — courses/course_units and all auth/profile rows were left untouched.';
end $$;


-- ============================================================
-- PART 1 — Clusters, nuclei, capacity catalogs
-- ============================================================

do $$
declare
  cedar_id     uuid;
  northgate_id uuid;
  riverside_id uuid;
  elmwood_id   uuid;
  birchwood_id uuid;
  sunview_id   uuid;
  pinecrest_id uuid;
  harborview_id uuid;
begin

  -- Geographically placed in Alberta so the "Boundaries" map layer
  -- (real cluster polygons, public/data/alberta-clusters.geojson)
  -- has something to demo: Cedar Hollow sits inside the real
  -- "Calgary" cluster polygon, Northgate inside "Edmonton" — each
  -- nucleus/household below keeps its original relative offset
  -- from the old (Ottawa-area) cluster center, just re-based here.
  insert into clusters (name, center_lat, center_lng, zoom)
  values ('Cedar Hollow', 51.0387, -114.0509, 11)
  returning id into cedar_id;

  insert into clusters (name, center_lat, center_lng, zoom)
  values ('Northgate', 53.5303, -113.5012, 11)
  returning id into northgate_id;

  -- ─── Nuclei ────────────────────────────────────────────────

  insert into nuclei (cluster_id, name, lat, lng, notes, banner_image_url)
  values (cedar_id, 'Riverside', 51.0352, -114.0437,
    'The most established nucleus in Cedar Hollow — four active core activities and a steady rhythm of reflection.', null)
  returning id into riverside_id;

  insert into nuclei (cluster_id, name, lat, lng, notes)
  values (cedar_id, 'Elmwood', 51.0472, -114.0637,
    'Building momentum — a new children''s class just started and a junior youth group is finding its footing.')
  returning id into elmwood_id;

  insert into nuclei (cluster_id, name, lat, lng, notes)
  values (cedar_id, 'Birchwood Commons', 51.0222, -114.0337,
    'A home-based devotional gathering is drawing in new families.')
  returning id into birchwood_id;

  insert into nuclei (cluster_id, name, lat, lng)
  values (cedar_id, 'Sunview Heights', 51.0572, -114.0137)
  returning id into sunview_id;

  insert into nuclei (cluster_id, name, lat, lng, notes)
  values (northgate_id, 'Pinecrest', 53.5253, -113.5062,
    'Northgate''s furthest-along nucleus, though the cluster itself has no assigned coordinator yet.')
  returning id into pinecrest_id;

  insert into nuclei (cluster_id, name, lat, lng)
  values (northgate_id, 'Harborview', 53.5403, -113.4812)
  returning id into harborview_id;

  -- ─── Capacity catalogs (one per cluster) ────────────────────
  -- Cedar Hollow deliberately includes a near-duplicate ("Tutor" /
  -- "Book Tutor") to demo the merge-capacities flow on camera.

  insert into cluster_capacities (cluster_id, name) values
    (cedar_id, 'Tutor'),
    (cedar_id, 'Book Tutor'),
    (cedar_id, 'Animator'),
    (cedar_id, 'Children''s Class Teacher'),
    (cedar_id, 'Reflection Meeting Facilitator'),
    (cedar_id, 'Home Visiting Coordinator'),
    (northgate_id, 'Tutor'),
    (northgate_id, 'Animator'),
    (northgate_id, 'Devotional Host');

  raise notice 'Clusters, nuclei, capacity catalogs seeded. Cedar Hollow=%, Northgate=%', cedar_id, northgate_id;
end $$;


-- ============================================================
-- PART 2 — Persons
-- Mixed age groups, profile status, religious status, and (for
-- Priya Nakamura) enrollment in two nuclei — the case the
-- cross-nucleus engagement-level fix now handles correctly.
-- Samuel O'Connor / Sam OConnor are a deliberate near-duplicate
-- pair, left unmerged, to demo the person-merge flow on camera.
-- ============================================================

insert into persons (name, age_group, is_minor, profile_status, religious_status, cluster_id) values
  ('Amara Osei',        'adult', false, 'confirmed',  'bahai',    (select id from clusters where name = 'Cedar Hollow')),
  ('Jonas Whitfield',   'adult', false, 'confirmed',  'bahai',    (select id from clusters where name = 'Cedar Hollow')),
  ('Priya Nakamura',    'adult', false, 'confirmed',  'bahai',    (select id from clusters where name = 'Cedar Hollow')),
  ('Diego Fernandez',   'adult', false, 'confirmed',  'friend',   (select id from clusters where name = 'Cedar Hollow')),
  ('Layla Haddad',      'adult', false, 'confirmed',  'bahai',    (select id from clusters where name = 'Cedar Hollow')),
  ('Samuel O''Connor',  'adult', false, 'confirmed',  'unknown',  (select id from clusters where name = 'Cedar Hollow')),
  ('Sam OConnor',       'adult', false, 'provisional','unknown',  (select id from clusters where name = 'Cedar Hollow')),
  ('Fatima Al-Sayed',   'adult', false, 'confirmed',  'bahai',    (select id from clusters where name = 'Cedar Hollow')),
  ('Grace Mwangi',      'adult', false, 'confirmed',  'friend',   (select id from clusters where name = 'Cedar Hollow')),
  ('Tomas Ibarra',      'adult', false, 'confirmed',  'unknown',  (select id from clusters where name = 'Cedar Hollow')),
  ('Elena Petrov',      'adult', false, 'confirmed',  'bahai',    (select id from clusters where name = 'Cedar Hollow')),
  ('Noah Bergstrom',    'adult', false, 'provisional','unknown',  (select id from clusters where name = 'Cedar Hollow')),
  ('Aaliyah Johnson',   'adult', false, 'confirmed',  'bahai',    (select id from clusters where name = 'Cedar Hollow')),
  ('Rosa Delgado',      'adult', false, 'confirmed',  'unknown',  (select id from clusters where name = 'Cedar Hollow')),
  ('Henry Osei',        'adult', false, 'confirmed',  'bahai',    (select id from clusters where name = 'Cedar Hollow')),
  ('Nadia Karimi',      'adult', false, 'confirmed',  'friend',   (select id from clusters where name = 'Cedar Hollow')),
  ('David Okafor',      'adult', false, 'confirmed',  'bahai',    (select id from clusters where name = 'Cedar Hollow')),
  ('Sofia Andersson',   'adult', false, 'provisional','unknown',  (select id from clusters where name = 'Cedar Hollow')),
  ('Marcus Lindqvist',  'adult', false, 'confirmed',  'bahai',    (select id from clusters where name = 'Northgate')),
  ('Ingrid Solberg',    'adult', false, 'confirmed',  'friend',   (select id from clusters where name = 'Northgate')),
  ('Omar Haddad',       'adult', false, 'confirmed',  'bahai',    (select id from clusters where name = 'Northgate')),
  ('Chloe Baptiste',    'adult', false, 'confirmed',  'friend',   (select id from clusters where name = 'Northgate')),
  ('Wei Zhang',         'adult', false, 'confirmed',  'unknown',  (select id from clusters where name = 'Northgate')),
  ('Liam O''Sullivan',  'adult', false, 'confirmed',  'unknown',  (select id from clusters where name = 'Northgate')),
  ('Grace-Anne Dubois', 'adult', false, 'confirmed',  'bahai',    (select id from clusters where name = 'Northgate')),
  ('Maya Thompson',     'youth', false, 'confirmed',  'bahai',    (select id from clusters where name = 'Cedar Hollow')),
  ('Ali Rahman',        'youth', false, 'confirmed',  'bahai',    (select id from clusters where name = 'Cedar Hollow')),
  ('Zoe Martinez',      'junior_youth', true, 'confirmed',  'unknown', (select id from clusters where name = 'Cedar Hollow')),
  ('Kofi Mensah',       'junior_youth', true, 'confirmed',  'unknown', (select id from clusters where name = 'Cedar Hollow')),
  ('Isabella Rossi',    'junior_youth', true, 'provisional','unknown', (select id from clusters where name = 'Cedar Hollow')),
  ('Ethan Park',        'junior_youth', true, 'confirmed',  'unknown', (select id from clusters where name = 'Cedar Hollow')),
  ('Lily Chen',         'child', true, 'confirmed',   'unknown', (select id from clusters where name = 'Cedar Hollow')),
  ('Noah Garcia',       'child', true, 'confirmed',   'unknown', (select id from clusters where name = 'Cedar Hollow')),
  ('Aisha Bello',       'child', true, 'provisional', 'unknown', (select id from clusters where name = 'Cedar Hollow')),
  ('Ben Wilson',        'child', true, 'confirmed',   'unknown', (select id from clusters where name = 'Cedar Hollow'));

do $$ begin raise notice 'Persons seeded: %', (select count(*) from persons); end $$;


-- ============================================================
-- PART 3 — Nucleus enrollments (concentric-circle placement)
-- Priya Nakamura appears twice with DIFFERENT engagement levels —
-- coordinating in Riverside, merely aware in Elmwood — which is
-- exactly the scenario the per-nucleus engagement fix protects.
-- ============================================================

insert into nucleus_enrollments (person_id, nucleus_id, engagement_level)
select p.id, n.id, e.level::engagement_level_enum
from (values
  ('Amara Osei',       'Riverside',        'coordinating'),
  ('Jonas Whitfield',  'Riverside',        'coordinating'),
  ('Priya Nakamura',   'Riverside',        'coordinating'),
  ('Diego Fernandez',  'Riverside',        'supporting'),
  ('Layla Haddad',     'Riverside',        'supporting'),
  ('Samuel O''Connor', 'Riverside',        'participating'),
  ('Sam OConnor',      'Riverside',        'participating'),
  ('Maya Thompson',    'Riverside',        'supporting'),
  ('Ali Rahman',       'Riverside',        'participating'),
  ('Zoe Martinez',     'Riverside',        'participating'),
  ('Kofi Mensah',      'Riverside',        'participating'),
  ('Isabella Rossi',   'Riverside',        'aware'),
  ('Lily Chen',        'Riverside',        'participating'),
  ('Noah Garcia',      'Riverside',        'participating'),
  ('Aisha Bello',      'Riverside',        'aware'),
  ('Rosa Delgado',     'Riverside',        'aware'),
  ('Henry Osei',       'Riverside',        'aware'),
  ('Nadia Karimi',     'Riverside',        'aware'),
  ('Priya Nakamura',   'Elmwood',          'aware'),
  ('Fatima Al-Sayed',  'Elmwood',          'coordinating'),
  ('Grace Mwangi',     'Elmwood',          'supporting'),
  ('Tomas Ibarra',     'Elmwood',          'aware'),
  ('Ben Wilson',       'Elmwood',          'participating'),
  ('Ethan Park',       'Elmwood',          'participating'),
  ('Elena Petrov',     'Birchwood Commons','coordinating'),
  ('Noah Bergstrom',   'Birchwood Commons','aware'),
  ('David Okafor',     'Birchwood Commons','participating'),
  ('Sofia Andersson',  'Birchwood Commons','aware'),
  ('Aaliyah Johnson',  'Sunview Heights',  'participating'),
  ('Marcus Lindqvist', 'Pinecrest',        'coordinating'),
  ('Ingrid Solberg',   'Pinecrest',        'supporting'),
  ('Omar Haddad',      'Pinecrest',        'participating'),
  ('Chloe Baptiste',   'Pinecrest',        'aware'),
  ('Wei Zhang',        'Harborview',       'aware'),
  ('Liam O''Sullivan', 'Harborview',       'aware'),
  ('Grace-Anne Dubois','Harborview',       'participating')
) as e(person_name, nucleus_name, level)
join persons p on p.name = e.person_name
join nuclei  n on n.name = e.nucleus_name
on conflict (person_id, nucleus_id) do update set engagement_level = excluded.engagement_level;

-- Two "aware" newcomers who were personally invited by Amara Osei —
-- shows the primary-contact arrow in the network view.
update nucleus_enrollments ne
set primary_contact_id = (select id from persons where name = 'Amara Osei')
from persons p, nuclei n
where ne.person_id = p.id and ne.nucleus_id = n.id
  and p.name in ('Rosa Delgado', 'Henry Osei') and n.name = 'Riverside';

do $$ begin raise notice 'Enrollments seeded: %', (select count(*) from nucleus_enrollments); end $$;


-- ============================================================
-- PART 4 — Activities (every type, lifecycle state, and
-- scheduling mode is represented at least once)
-- ============================================================

insert into activities (
  nucleus_id, name, type, lifecycle_state, scheduling_mode,
  schedule_day_of_week, schedule_time, schedule_interval_weeks, schedule_notes,
  location, current_course_id, start_date, end_date, completed_at, is_active
)
select
  n.id, a.name, a.type::activity_type_enum, a.lifecycle::activity_lifecycle_enum, a.mode::activity_scheduling_mode_enum,
  a.dow, a.time_of_day, a.interval_weeks, a.notes,
  a.location, (select id from courses where short_name = a.course_short and stream <> 'jysep' limit 1),
  a.start_date, a.end_date, a.completed_at, a.lifecycle <> 'cancelled'
from (values
  ('Riverside', 'Sunrise Children''s Class', 'children_class', 'active', 'structured_recurring', 6, '10:00'::time, 1, null, 'Community room, Riverside center', 'Book 3', null::date, null::date, null::timestamptz),
  ('Riverside', 'Rising Stars Junior Youth Group', 'junior_youth', 'active', 'structured_recurring', 3, '17:30'::time, 1, null, 'Riverside youth room', null, null, null, null),
  ('Riverside', 'Book 1 Study Circle', 'study_circle', 'active', 'structured_recurring', 1, '19:00'::time, 1, null, 'Haddad home', 'Book 1', null, null, null),
  ('Riverside', 'Friday Evening Devotional', 'devotional', 'active', 'sporadic_ongoing', null, null, null, 'Most Friday evenings, hosted in rotating homes', null, null, null, null, null),
  ('Riverside', 'Summer Service Intensive', 'other', 'completed', 'short_duration', null, null, null, 'Two-week neighborhood clean-up and visiting intensive', null, null, (current_date - interval '4 months')::date, (current_date - interval '3.5 months')::date, (current_date - interval '3.5 months')::timestamptz),
  ('Elmwood', 'Tuesday Children''s Class', 'children_class', 'planned', 'structured_recurring', 2, '16:00'::time, 1, 'Starting next month', null, null, null, null, null),
  ('Elmwood', 'Grade 2 Children''s Class', 'children_class', 'active', 'structured_recurring', 6, '10:30'::time, 1, null, null, 'Grade 2', null, null, null),
  ('Elmwood', 'Elmwood Junior Youth Circle', 'junior_youth', 'active', 'structured_recurring', 4, '17:00'::time, 1, null, null, null, null, null, null),
  ('Birchwood Commons', 'New Family Devotional', 'devotional', 'active', 'sporadic_ongoing', null, null, null, 'Home devotionals, roughly every other week', null, null, null, null, null),
  ('Pinecrest', 'Book 2 Study Circle', 'study_circle', 'active', 'structured_recurring', 2, '19:00'::time, 1, null, null, 'Book 2', null, null, null),
  ('Pinecrest', 'Cancelled JY Group', 'junior_youth', 'cancelled', 'structured_recurring', 5, '17:00'::time, 1, 'Paused — scheduling conflict, revisit next cycle', null, null, null, null, null),
  ('Harborview', 'Harborview Devotional Gathering', 'devotional', 'active', 'sporadic_ongoing', null, null, null, null, null, null, null, null, null)
) as a(nucleus_name, name, type, lifecycle, mode, dow, time_of_day, interval_weeks, notes, location, course_short, start_date, end_date, completed_at)
join nuclei n on n.name = a.nucleus_name;

do $$ begin raise notice 'Activities seeded: %', (select count(*) from activities); end $$;


-- ============================================================
-- PART 5 — Activity participants
-- A couple are marked inactive, and a couple carry a stale
-- last_reviewed_at, to demo the lapsed-attendance nudge.
-- ============================================================

insert into activity_participants (activity_id, person_id, role, status, last_reviewed_at)
select a.id, p.id, x.role::participant_role_enum,
       x.status::activity_participant_status_enum,
       x.last_reviewed
from (values
  ('Sunrise Children''s Class', 'Amara Osei',       'teacher',     'active',   now() - interval '5 days'),
  ('Sunrise Children''s Class', 'Lily Chen',         'child',       'active',   now() - interval '5 days'),
  ('Sunrise Children''s Class', 'Noah Garcia',       'child',       'active',   now() - interval '5 days'),
  ('Sunrise Children''s Class', 'Aisha Bello',       'child',       'inactive', now() - interval '95 days'),
  ('Rising Stars Junior Youth Group', 'Jonas Whitfield', 'animator',    'active', now() - interval '3 days'),
  ('Rising Stars Junior Youth Group', 'Maya Thompson',   'animator',    'active', now() - interval '3 days'),
  ('Rising Stars Junior Youth Group', 'Zoe Martinez',    'junior_youth','active', now() - interval '3 days'),
  ('Rising Stars Junior Youth Group', 'Kofi Mensah',     'junior_youth','active', now() - interval '3 days'),
  ('Rising Stars Junior Youth Group', 'Isabella Rossi',  'junior_youth','active', now() - interval '75 days'),
  ('Book 1 Study Circle', 'Layla Haddad',      'tutor',       'active', now() - interval '2 days'),
  ('Book 1 Study Circle', 'Diego Fernandez',   'participant', 'active', now() - interval '2 days'),
  ('Book 1 Study Circle', 'Samuel O''Connor',  'participant', 'active', now() - interval '2 days'),
  ('Book 1 Study Circle', 'Sam OConnor',       'participant', 'active', now() - interval '2 days'),
  ('Book 1 Study Circle', 'Ali Rahman',        'participant', 'active', now() - interval '2 days'),
  ('Friday Evening Devotional', 'Priya Nakamura', 'host',     'active', now() - interval '6 days'),
  ('Friday Evening Devotional', 'Rosa Delgado',   'attendee', 'active', now() - interval '6 days'),
  ('Friday Evening Devotional', 'Henry Osei',     'attendee', 'active', now() - interval '6 days'),
  ('Friday Evening Devotional', 'Nadia Karimi',   'attendee', 'active', now() - interval '6 days'),
  ('Summer Service Intensive', 'Amara Osei',      'participant', 'active', null),
  ('Summer Service Intensive', 'Jonas Whitfield', 'participant', 'active', null),
  ('Summer Service Intensive', 'Maya Thompson',   'participant', 'active', null),
  ('Tuesday Children''s Class', 'Fatima Al-Sayed', 'teacher', 'active', null),
  ('Grade 2 Children''s Class', 'Grace Mwangi',    'teacher', 'active', now() - interval '4 days'),
  ('Grade 2 Children''s Class', 'Ben Wilson',      'child',   'active', now() - interval '4 days'),
  ('Elmwood Junior Youth Circle', 'Grace Mwangi',  'animator',      'active', now() - interval '10 days'),
  ('Elmwood Junior Youth Circle', 'Ethan Park',    'junior_youth',  'active', now() - interval '10 days'),
  ('New Family Devotional', 'Elena Petrov',     'host',     'active', now() - interval '8 days'),
  ('New Family Devotional', 'Noah Bergstrom',   'attendee', 'active', now() - interval '8 days'),
  ('New Family Devotional', 'David Okafor',     'attendee', 'active', now() - interval '8 days'),
  ('New Family Devotional', 'Sofia Andersson',  'attendee', 'active', now() - interval '8 days'),
  ('Book 2 Study Circle', 'Marcus Lindqvist', 'tutor',       'active', now() - interval '4 days'),
  ('Book 2 Study Circle', 'Ingrid Solberg',   'participant', 'active', now() - interval '4 days'),
  ('Book 2 Study Circle', 'Omar Haddad',      'participant', 'active', now() - interval '4 days'),
  ('Cancelled JY Group', 'Chloe Baptiste', 'animator', 'inactive', now() - interval '110 days'),
  ('Harborview Devotional Gathering', 'Grace-Anne Dubois', 'host',     'active', now() - interval '7 days'),
  ('Harborview Devotional Gathering', 'Wei Zhang',         'attendee', 'active', now() - interval '7 days'),
  ('Harborview Devotional Gathering', 'Liam O''Sullivan',  'attendee', 'active', now() - interval '7 days')
) as x(activity_name, person_name, role, status, last_reviewed)
join activities a on a.name = x.activity_name
join persons    p on p.name = x.person_name
on conflict (activity_id, person_id) do update set role = excluded.role, status = excluded.status, last_reviewed_at = excluded.last_reviewed_at;

do $$ begin raise notice 'Activity participants seeded: %', (select count(*) from activity_participants); end $$;


-- ============================================================
-- PART 6 — Person capacities
-- ============================================================

insert into person_capacities (person_id, capacity_id)
select p.id, cc.id
from (values
  ('Amara Osei',      'Reflection Meeting Facilitator', 'Cedar Hollow'),
  ('Jonas Whitfield',  'Home Visiting Coordinator',      'Cedar Hollow'),
  ('Layla Haddad',     'Tutor',                          'Cedar Hollow'),
  ('Samuel O''Connor', 'Book Tutor',                      'Cedar Hollow'),
  ('Grace Mwangi',     'Children''s Class Teacher',      'Cedar Hollow'),
  ('Fatima Al-Sayed',  'Children''s Class Teacher',      'Cedar Hollow'),
  ('Elena Petrov',     'Home Visiting Coordinator',      'Cedar Hollow'),
  ('Maya Thompson',    'Animator',                        'Cedar Hollow'),
  ('Marcus Lindqvist', 'Tutor',                          'Northgate'),
  ('Grace-Anne Dubois','Devotional Host',                'Northgate')
) as x(person_name, capacity_name, cluster_name)
join persons p on p.name = x.person_name
join clusters c on c.name = x.cluster_name
join cluster_capacities cc on cc.cluster_id = c.id and cc.name = x.capacity_name
on conflict do nothing;

do $$ begin raise notice 'Person capacities seeded: %', (select count(*) from person_capacities); end $$;


-- ============================================================
-- PART 7 — Curriculum: whole-book completions (also completes
-- every real unit, matching how the app derives book status from
-- its units) and in-progress books (left at 0-1 units complete).
-- ============================================================

with completed_books as (
  select p.id as person_id, c.id as course_id, n.id as nucleus_id
  from (values
    ('Amara Osei',      'Book 1', 'Riverside'),
    ('Amara Osei',      'Book 2', 'Riverside'),
    ('Layla Haddad',    'Book 1', 'Riverside'),
    ('Layla Haddad',    'Book 7', 'Riverside'),
    ('Jonas Whitfield', 'Book 1', 'Riverside'),
    ('Jonas Whitfield', 'Book 2', 'Riverside'),
    ('Jonas Whitfield', 'Book 5', 'Riverside'),
    ('Maya Thompson',   'Book 1', 'Riverside'),
    ('Maya Thompson',   'Book 5', 'Riverside'),
    ('Fatima Al-Sayed', 'Book 1', 'Elmwood'),
    ('Fatima Al-Sayed', 'Book 3', 'Elmwood'),
    ('Elena Petrov',    'Book 1', 'Birchwood Commons'),
    ('Elena Petrov',    'Book 2', 'Birchwood Commons'),
    ('Marcus Lindqvist','Book 1', 'Pinecrest'),
    ('Marcus Lindqvist','Book 2', 'Pinecrest'),
    ('Ali Rahman',      'Book 5', 'Riverside')
  ) as t(person_name, course_short, nucleus_name)
  join persons p on p.name = t.person_name
  join courses c on c.short_name = t.course_short and c.stream = 'ruhi_main'
  join nuclei  n on n.name = t.nucleus_name
)
insert into course_enrollments (person_id, course_id, nucleus_id, status, started_at, completed_at)
select person_id, course_id, nucleus_id, 'completed', (current_date - interval '8 months')::date, (current_date - interval '2 months')::date
from completed_books
on conflict (person_id, course_id) do update
  set status = excluded.status, completed_at = excluded.completed_at, nucleus_id = excluded.nucleus_id;

insert into course_unit_enrollments (person_id, course_unit_id, nucleus_id, status, started_at, completed_at)
select ce.person_id, cu.id, ce.nucleus_id, 'completed', (current_date - interval '8 months')::date, (current_date - interval '2 months')::date
from course_enrollments ce
join courses c on c.id = ce.course_id and c.stream = 'ruhi_main'
join course_units cu on cu.course_id = c.id and cu.is_placeholder = false
where ce.status = 'completed'
on conflict (person_id, course_unit_id) do update
  set status = excluded.status, completed_at = excluded.completed_at;

-- Branch-course completions (no units to mirror).
insert into course_enrollments (person_id, course_id, nucleus_id, status, started_at, completed_at)
select p.id, c.id, n.id, 'completed', (current_date - interval '5 months')::date, (current_date - interval '1 month')::date
from (values
  ('Grace Mwangi', 'Grade 2', 'Elmwood')
) as t(person_name, course_short, nucleus_name)
join persons p on p.name = t.person_name
join courses c on c.short_name = t.course_short and c.stream = 'branch'
join nuclei  n on n.name = t.nucleus_name
on conflict (person_id, course_id) do update set status = excluded.status, completed_at = excluded.completed_at;

-- In-progress books — book-level row only; Diego also gets one
-- completed unit so the partial-progress bar has something to show.
insert into course_enrollments (person_id, course_id, nucleus_id, status, started_at)
select p.id, c.id, n.id, 'in_progress', (current_date - interval '2 months')::date
from (values
  ('Amara Osei',      'Book 7',  'Riverside'),
  ('Diego Fernandez', 'Book 1',  'Riverside'),
  ('Samuel O''Connor','Book 1',  'Riverside'),
  ('Maya Thompson',   'Book 2',  'Riverside'),
  ('Fatima Al-Sayed',  'Grade 2', 'Elmwood'),
  ('Marcus Lindqvist','Book 6',  'Pinecrest'),
  ('Ali Rahman',      'Book 1',  'Riverside')
) as t(person_name, course_short, nucleus_name)
join persons p on p.name = t.person_name
join courses c on c.short_name = t.course_short and c.stream in ('ruhi_main', 'branch')
join nuclei  n on n.name = t.nucleus_name
on conflict (person_id, course_id) do update set status = excluded.status;

insert into course_unit_enrollments (person_id, course_unit_id, nucleus_id, status, started_at, completed_at)
select p.id, cu.id, n.id, 'completed', (current_date - interval '2 months')::date, (current_date - interval '3 weeks')::date
from persons p
join nuclei n on n.name = 'Riverside'
join courses c on c.short_name = 'Book 1' and c.stream = 'ruhi_main'
join course_units cu on cu.course_id = c.id and cu."order" = 1
where p.name = 'Diego Fernandez'
on conflict (person_id, course_unit_id) do update set status = excluded.status, completed_at = excluded.completed_at;

-- JYSEP texts (no units at all).
insert into course_enrollments (person_id, course_id, nucleus_id, status, started_at, completed_at)
select p.id, c.id, n.id, x.status::completion_status_enum,
       (current_date - interval '6 months')::date,
       case when x.status = 'completed' then (current_date - interval '1 month')::date else null end
from (values
  ('Zoe Martinez', 'Breezes of Confirmation', 'Riverside', 'completed'),
  ('Zoe Martinez', 'Wellspring of Joy',       'Riverside', 'in_progress'),
  ('Kofi Mensah',  'Breezes of Confirmation', 'Riverside', 'in_progress')
) as x(person_name, course_short, nucleus_name, status)
join persons p on p.name = x.person_name
join courses c on c.short_name = x.course_short and c.stream = 'jysep'
join nuclei  n on n.name = x.nucleus_name
on conflict (person_id, course_id) do update set status = excluded.status, completed_at = excluded.completed_at;

do $$ begin raise notice 'Course enrollments: % / unit enrollments: %', (select count(*) from course_enrollments), (select count(*) from course_unit_enrollments); end $$;


-- ============================================================
-- PART 8 — Milestone stage + Milestone Three scores
-- Riverside and Pinecrest reach stage 3 with a partial (not full)
-- set of feature scores; Elmwood/Harborview sit at earlier
-- stages; Birchwood Commons at stage 1; Sunview Heights is left
-- with no row at all (defaults to stage 0 — the "just starting"
-- state).
-- ============================================================

insert into nucleus_milestone_stage (nucleus_id, stage)
select n.id, x.stage
from (values
  ('Riverside', 3),
  ('Elmwood', 2),
  ('Birchwood Commons', 1),
  ('Pinecrest', 3),
  ('Harborview', 1)
) as x(nucleus_name, stage)
join nuclei n on n.name = x.nucleus_name
on conflict (nucleus_id) do update set stage = excluded.stage;

insert into nucleus_milestone_three (nucleus_id, overall_note)
select n.id, x.note
from (values
  ('Riverside', 'A genuine culture of accompaniment has taken hold — newer friends are stepping into roles within months rather than years. The devotional gathering keeps drawing in people the core activities haven''t reached directly.'),
  ('Pinecrest', 'Steady, if slower — the study circle is the clear engine of growth here. Still working out how to sustain momentum without a cluster coordinator in place.')
) as x(nucleus_name, note)
join nuclei n on n.name = x.nucleus_name
on conflict (nucleus_id) do update set overall_note = excluded.overall_note;

insert into nucleus_milestone_three_scores (nucleus_id, feature_key, score, note)
select n.id, x.feature_key, x.score, x.note
from (values
  ('Riverside', 'human_resources', 7, 'Five people now actively accompanying others.'),
  ('Riverside', 'spreading_activity', 6, null),
  ('Riverside', 'embracing_numbers', 8, 'Junior youth group nearly doubled this cycle.'),
  ('Riverside', 'effective_cycles', 5, null),
  ('Riverside', 'periods_of_intensity', 6, 'Summer intensive was a turning point.'),
  ('Pinecrest', 'human_resources', 5, null),
  ('Pinecrest', 'spreading_activity', 4, 'Limited by lack of a cluster coordinator to help connect nuclei.'),
  ('Pinecrest', 'embracing_numbers', 6, null),
  ('Pinecrest', 'effective_cycles', 5, null),
  ('Pinecrest', 'community_undertakings', 3, 'Just beginning to explore this.'),
  ('Pinecrest', 'reflection_spaces', 6, null)
) as x(nucleus_name, feature_key, score, note)
join nuclei n on n.name = x.nucleus_name
on conflict (nucleus_id, feature_key) do update set score = excluded.score, note = excluded.note;

do $$ begin raise notice 'Milestone data seeded.'; end $$;


-- ============================================================
-- PART 9 — Timeline: cycles, events, meetings, and one note
-- ============================================================

insert into timeline_cycles (label, start_date, end_date, cluster_id)
select 'Cycle 47', (current_date - interval '20 days')::date, (current_date + interval '60 days')::date, c.id
from clusters c where c.name = 'Cedar Hollow';

do $$
declare
  cedar_id      uuid;
  riverside_id  uuid;
  pinecrest_id  uuid;
  reflection_evt_id uuid;
  childrens_class_id uuid;
begin
  select id into cedar_id     from clusters where name = 'Cedar Hollow';
  select id into riverside_id from nuclei where name = 'Riverside';
  select id into pinecrest_id from nuclei where name = 'Pinecrest';
  select id into childrens_class_id from activities where name = 'Sunrise Children''s Class';

  insert into timeline_events (name, item_type, start_date, end_date, cluster_id, location)
  values ('Regional Convention', 'event', (current_date + interval '55 days')::date, (current_date + interval '57 days')::date, cedar_id, 'Regional Conference Center');

  insert into timeline_events (name, item_type, start_date, start_time, cluster_id, location, meeting_type, attendees)
  values ('Cluster Reflection Meeting', 'meeting', (current_date + interval '10 days')::date, '19:00', cedar_id, 'Riverside community room', 'reflection',
    array['Amara Osei', 'Jonas Whitfield', 'Fatima Al-Sayed', 'Elena Petrov'])
  returning id into reflection_evt_id;

  insert into timeline_events (name, item_type, start_date, start_time, nucleus_id, meeting_type)
  values ('Riverside Coordination Meeting', 'meeting', (current_date + interval '4 days')::date, '18:30', riverside_id, 'coordination');

  insert into timeline_events (name, item_type, start_date, start_time, nucleus_id, meeting_type)
  values ('Pinecrest Consultation', 'meeting', (current_date + interval '6 days')::date, '19:00', pinecrest_id, 'consultation');

  -- A timeline entry that mirrors the recurring children's class,
  -- standing in for the app's own auto-generated timeline entries.
  insert into timeline_events (name, item_type, start_date, start_time, nucleus_id, activity_id)
  values ('Sunrise Children''s Class', 'event', (current_date + interval '3 days')::date, '10:00', riverside_id, childrens_class_id);

  insert into timeline_item_notes (timeline_item_id, kind, title, body_text)
  values (reflection_evt_id, 'text', 'Pre-reflection notes',
    'Bring attendance trends from the last three cycles and the latest Cluster Learning Hub synthesis for "Sustaining Youth Participation".');

  insert into timeline_item_notes (timeline_item_id, kind, title, link_url, link_label)
  values (reflection_evt_id, 'link', 'Institute process overview', 'https://www.bahai.org/action/devotional-meetings-study-circles-childrens-classes-junior-youth-groups', 'bahai.org: the institute process');

  raise notice 'Timeline seeded.';
end $$;


-- ============================================================
-- PART 10 — Reflective Learning System
-- Nucleus-level Objects of Learning that auto-link to canonical
-- cluster themes, Activity Notebook + Nucleus Journal entries,
-- and Cluster synthesis reflections. Demonstrates the upward
-- flow: activity -> nucleus -> cluster.
-- ============================================================

do $$
declare
  cedar_id      uuid;
  riverside_id  uuid;
  elmwood_id    uuid;
  birchwood_id  uuid;
  childrens_class_id uuid;
  jy_group_id   uuid;
  study_circle_id uuid;
  devotional_id uuid;
  ct_youth      uuid;
  ct_families   uuid;
  ct_devotional uuid;
  lt_riverside_youth   uuid;
  lt_riverside_families uuid;
  lt_elmwood_youth     uuid;
  lt_birchwood_devotional uuid;
  e_id uuid;
begin
  select id into cedar_id     from clusters where name = 'Cedar Hollow';
  select id into riverside_id from nuclei where name = 'Riverside';
  select id into elmwood_id   from nuclei where name = 'Elmwood';
  select id into birchwood_id from nuclei where name = 'Birchwood Commons';
  select id into childrens_class_id from activities where name = 'Sunrise Children''s Class';
  select id into jy_group_id  from activities where name = 'Rising Stars Junior Youth Group';
  select id into study_circle_id from activities where name = 'Book 1 Study Circle';
  select id into devotional_id from activities where name = 'New Family Devotional';

  insert into cluster_themes (cluster_id, name, color, description, consolidation_level)
  values
    (cedar_id, 'Sustaining Youth Participation', 'amber',
     'How we are inviting, engaging, and empowering junior youth and youth to take part and grow.', 60),
    (cedar_id, 'Welcoming New Families', 'blue',
     'Creating a warm, sustained experience for families new to the community.', 35),
    (cedar_id, 'Deepening Devotional Life', 'purple',
     'Nurturing spiritual life individually and together through home devotionals.', 45)
  on conflict (cluster_id, name) do update
    set description = excluded.description, color = excluded.color, consolidation_level = excluded.consolidation_level;

  select id into ct_youth      from cluster_themes where cluster_id = cedar_id and name = 'Sustaining Youth Participation';
  select id into ct_families   from cluster_themes where cluster_id = cedar_id and name = 'Welcoming New Families';
  select id into ct_devotional from cluster_themes where cluster_id = cedar_id and name = 'Deepening Devotional Life';

  insert into learning_themes (nucleus_id, name, color, description, status, cluster_theme_id, promoted_at)
    values (riverside_id, 'Sustaining Youth Participation', 'amber',
            'What helps junior youth and youth keep coming back, cycle after cycle.', 'established', ct_youth, now() - interval '4 months')
    on conflict (nucleus_id, name) do nothing;
  select id into lt_riverside_youth from learning_themes where nucleus_id = riverside_id and name = 'Sustaining Youth Participation';

  insert into learning_themes (nucleus_id, name, color, description, status, cluster_theme_id, promoted_at)
    values (riverside_id, 'Welcoming New Families', 'blue',
            'Rosa and Henry both arrived through personal invitation — watching for the pattern.', 'emerging', ct_families, null)
    on conflict (nucleus_id, name) do nothing;
  select id into lt_riverside_families from learning_themes where nucleus_id = riverside_id and name = 'Welcoming New Families';

  insert into learning_themes (nucleus_id, name, color, description, status, cluster_theme_id, promoted_at)
    values (elmwood_id, 'Sustaining Youth Participation', 'amber',
            'Elmwood''s junior youth circle is brand new — early observations.', 'established', ct_youth, now() - interval '1 month')
    on conflict (nucleus_id, name) do nothing;
  select id into lt_elmwood_youth from learning_themes where nucleus_id = elmwood_id and name = 'Sustaining Youth Participation';

  insert into learning_themes (nucleus_id, name, color, description, status, cluster_theme_id, promoted_at)
    values (birchwood_id, 'Deepening Devotional Life', 'purple',
            'The home devotional has become the on-ramp for every new family this cycle.', 'established', ct_devotional, now() - interval '2 months')
    on conflict (nucleus_id, name) do nothing;
  select id into lt_birchwood_devotional from learning_themes where nucleus_id = birchwood_id and name = 'Deepening Devotional Life';

  -- ─── Activity Notebook entries ────────────────────────────
  if not exists (select 1 from journal_entries where activity_id = jy_group_id and what_happened like 'Strong turnout%') then
    insert into journal_entries (nucleus_id, source, activity_id, occurred_at, what_happened, encouraging_signs, people_emerging)
    values (riverside_id, 'activity', jy_group_id, now() - interval '14 days',
      'Strong turnout this evening — 9 junior youth, including Isabella''s first time. Maya led the animation for the first half on her own.',
      'Several stayed afterward asking about a service project in the neighborhood.',
      'Maya is clearly ready to co-animate a group of her own next cycle.')
    returning id into e_id;
    insert into journal_entry_themes (entry_id, theme_id) values (e_id, lt_riverside_youth);
    insert into journal_entry_attendance (entry_id, person_id)
      select e_id, id from persons where name in ('Zoe Martinez', 'Kofi Mensah', 'Isabella Rossi');
  end if;

  if not exists (select 1 from journal_entries where activity_id = childrens_class_id and what_happened like 'Quieter session%') then
    insert into journal_entries (nucleus_id, source, activity_id, occurred_at, what_happened, challenges, follow_up)
    values (riverside_id, 'activity', childrens_class_id, now() - interval '7 days',
      'Quieter session — only Lily and Noah this week. Aisha''s family has missed the last several Saturdays.',
      'Not sure if the Saturday morning slot still works for Aisha''s family.',
      'Amara to call Aisha''s parents this week and ask directly rather than assuming.')
    returning id into e_id;
    insert into journal_entry_themes (entry_id, theme_id) values (e_id, lt_riverside_families);
    insert into journal_entry_attendance (entry_id, person_id)
      select e_id, id from persons where name in ('Lily Chen', 'Noah Garcia');
  end if;

  if not exists (select 1 from journal_entries where activity_id = study_circle_id and what_happened like 'Deep conversation%') then
    insert into journal_entries (nucleus_id, source, activity_id, occurred_at, what_happened, learning)
    values (riverside_id, 'activity', study_circle_id, now() - interval '3 days',
      'Deep conversation on this unit''s reading. Diego offered to help host next time.',
      'When participants take even small acts of service (like offering to host), it seems to accelerate their own sense of ownership over the circle.')
    returning id into e_id;
    insert into journal_entry_themes (entry_id, theme_id) values (e_id, lt_riverside_youth);
    insert into journal_entry_attendance (entry_id, person_id)
      select e_id, id from persons where name in ('Layla Haddad', 'Diego Fernandez', 'Samuel O''Connor', 'Ali Rahman');
  end if;

  if not exists (select 1 from journal_entries where activity_id = devotional_id and what_happened like '14 attended%') then
    insert into journal_entries (nucleus_id, source, activity_id, occurred_at, what_happened, encouraging_signs)
    values (birchwood_id, 'activity', devotional_id, now() - interval '10 days',
      '14 attended the home devotional. Two new neighbors joined for the first time, invited by David.',
      'One of the new families said it was the first gathering they''d felt at home in since moving to the area.')
    returning id into e_id;
    insert into journal_entry_themes (entry_id, theme_id) values (e_id, lt_birchwood_devotional);
    insert into journal_entry_attendance (entry_id, person_id)
      select e_id, id from persons where name in ('Elena Petrov', 'David Okafor', 'Sofia Andersson');
  end if;

  -- ─── Nucleus Journal entries ──────────────────────────────
  if not exists (select 1 from journal_entries where nucleus_id = riverside_id and source = 'nucleus' and body like 'A pattern is emerging%') then
    insert into journal_entries (nucleus_id, source, occurred_at, body)
    values (riverside_id, 'nucleus', now() - interval '5 days',
      'A pattern is emerging: when someone is personally invited rather than just told about an activity, they arrive AND often bring someone else. Rosa and Henry both joined this way through Amara.')
    returning id into e_id;
    insert into journal_entry_themes (entry_id, theme_id) values (e_id, lt_riverside_families);
  end if;

  if not exists (select 1 from journal_entries where nucleus_id = elmwood_id and source = 'nucleus' and body like 'The junior youth circle%') then
    insert into journal_entries (nucleus_id, source, occurred_at, body)
    values (elmwood_id, 'nucleus', now() - interval '9 days',
      'The junior youth circle is only a month old but Ethan has already brought two friends to ask about joining next cycle. Small starts can move fast.')
    returning id into e_id;
    insert into journal_entry_themes (entry_id, theme_id) values (e_id, lt_elmwood_youth);
  end if;

  -- ─── Cluster synthesis entries ────────────────────────────
  if not exists (select 1 from journal_entries where cluster_theme_id = ct_youth and source = 'cluster' and body like 'Across Riverside and Elmwood%') then
    insert into journal_entries (source, cluster_id, cluster_theme_id, occurred_at, body)
    values ('cluster', cedar_id, ct_youth, now() - interval '4 days',
      'Across Riverside and Elmwood, the same observation keeps surfacing: junior youth and youth step up fastest when given real responsibility, not just an invitation to attend. Maya co-animating in Riverside and Ethan recruiting peers in Elmwood are the same pattern in two places. Worth raising at the next cluster reflection meeting.');
  end if;

  if not exists (select 1 from journal_entries where cluster_theme_id = ct_families and source = 'cluster' and body like 'Personal invitation%') then
    insert into journal_entries (source, cluster_id, cluster_theme_id, occurred_at, body)
    values ('cluster', cedar_id, ct_families, now() - interval '1 day',
      'Personal invitation continues to outperform general announcement, and newcomers who are personally invited often bring someone else with them. Question for the next consultation: how do we help more friends develop the confidence to invite one-on-one, rather than relying on the same few people?');
  end if;

  raise notice 'Reflective Learning System seeded.';
end $$;


-- ============================================================
-- PART 11 — Cluster meeting notes
-- ============================================================

insert into cluster_meeting_notes (cluster_id, title, body, occurred_at)
select c.id, x.title, x.body, x.occurred_at
from (values
  ('August Cluster Agency Meeting',
   'Reviewed progress across all four nuclei. Agreed to focus the next quarter on strengthening the Elmwood junior youth circle and exploring whether Sunview Heights is ready for its first core activity. Institutions represented: Regional Council liaison, Area Teaching Committee.',
   now() - interval '18 days'),
  ('Inter-institutional Coordination Call',
   'Monthly call with the Regional Council liaison. Discussed the upcoming Regional Convention logistics and how Cedar Hollow''s four nuclei will be represented. Agreed to circulate a short save-the-date to all core activity participants.',
   now() - interval '9 days')
) as x(title, body, occurred_at)
join clusters c on c.name = 'Cedar Hollow';

do $$ begin raise notice 'Cluster meeting notes seeded.'; end $$;


-- ============================================================
-- PART 12 — LSA households
-- lsa_jurisdictions rows are auto-created by trigger for every
-- cluster; we just attach households/members to them.
-- ============================================================

insert into households (jurisdiction_id, display_name, address_line, lat, lng, notes)
select j.id, x.display_name, x.address_line, x.lat, x.lng, x.notes
from (values
  ('Cedar Hollow', 'Osei Household', '14 Cedar Lane', 51.0357, -114.0447, 'Long-established Bahá''í family; frequent hosts.'),
  ('Cedar Hollow', 'Fernandez-Delgado Household', '22 Maple Court', 51.0482, -114.0617, 'New to the neighborhood this year.'),
  ('Northgate',    'Lindqvist Household', '8 Harbor Road', 53.5263, -113.5072, null)
) as x(cluster_name, display_name, address_line, lat, lng, notes)
join clusters c on c.name = x.cluster_name
join lsa_jurisdictions j on j.cluster_id = c.id;

-- linked_person_id resolves via the left join for rows that name an
-- existing person; the one LSA-only row (Camila, not yet in the
-- community-building roster) has person_name = null, so p.id is null
-- there and display_name carries her label instead — satisfying the
-- household_members_has_identity check either way.
insert into household_members (household_id, linked_person_id, display_name, relationship, age_group)
select h.id, p.id, x.display_name, x.relationship, x.age_group
from (values
  ('Osei Household', 'Amara Osei', null, 'head', 'adult'),
  ('Osei Household', 'Henry Osei', null, 'spouse', 'adult'),
  ('Fernandez-Delgado Household', 'Diego Fernandez', null, 'head', 'adult'),
  ('Fernandez-Delgado Household', 'Rosa Delgado', null, 'spouse', 'adult'),
  ('Fernandez-Delgado Household', null, 'Camila Fernandez (not yet in the community-building roster)', 'child', 'child'),
  ('Lindqvist Household', 'Marcus Lindqvist', null, 'head', 'adult')
) as x(household_name, person_name, display_name, relationship, age_group)
join households h on h.display_name = x.household_name
left join persons p on p.name = x.person_name;

do $$ begin raise notice 'LSA households seeded.'; end $$;


-- ============================================================
-- PART 13 — event_log backfill (drives the Growth Report)
-- ============================================================

insert into event_log (timestamp, type, cluster_id, nucleus_id, activity_id, person_id, description)
select x.ts, x.type::event_log_type_enum, c.id, n.id, a.id, p.id, x.description
from (values
  (now() - interval '6 months', 'nucleus_created', 'Cedar Hollow', 'Riverside', null, null, 'Riverside nucleus established'),
  (now() - interval '5 months', 'nucleus_created', 'Cedar Hollow', 'Elmwood', null, null, 'Elmwood nucleus established'),
  (now() - interval '4 months', 'nucleus_created', 'Cedar Hollow', 'Birchwood Commons', null, null, 'Birchwood Commons nucleus established'),
  (now() - interval '2 months', 'nucleus_created', 'Cedar Hollow', 'Sunview Heights', null, null, 'Sunview Heights nucleus established'),
  (now() - interval '5 months', 'nucleus_created', 'Northgate', 'Pinecrest', null, null, 'Pinecrest nucleus established'),
  (now() - interval '3 months', 'nucleus_created', 'Northgate', 'Harborview', null, null, 'Harborview nucleus established'),
  (now() - interval '5 months', 'activity_created', 'Cedar Hollow', 'Riverside', 'Sunrise Children''s Class', null, 'Sunrise Children''s Class started'),
  (now() - interval '5 months', 'activity_created', 'Cedar Hollow', 'Riverside', 'Rising Stars Junior Youth Group', null, 'Rising Stars Junior Youth Group started'),
  (now() - interval '4 months', 'activity_created', 'Cedar Hollow', 'Riverside', 'Book 1 Study Circle', null, 'Book 1 Study Circle started'),
  (now() - interval '4 months', 'activity_created', 'Cedar Hollow', 'Riverside', 'Friday Evening Devotional', null, 'Friday Evening Devotional started'),
  (now() - interval '1 month',  'activity_created', 'Cedar Hollow', 'Elmwood', 'Elmwood Junior Youth Circle', null, 'Elmwood Junior Youth Circle started'),
  (now() - interval '3 months', 'activity_created', 'Cedar Hollow', 'Elmwood', 'Grade 2 Children''s Class', null, 'Grade 2 Children''s Class started'),
  (now() - interval '3 months', 'activity_created', 'Cedar Hollow', 'Birchwood Commons', 'New Family Devotional', null, 'New Family Devotional started'),
  (now() - interval '4 months', 'activity_created', 'Northgate', 'Pinecrest', 'Book 2 Study Circle', null, 'Book 2 Study Circle started'),
  (now() - interval '90 days', 'participant_added', 'Cedar Hollow', 'Riverside', 'Sunrise Children''s Class', 'Lily Chen', 'Lily Chen joined Sunrise Children''s Class'),
  (now() - interval '80 days', 'participant_added', 'Cedar Hollow', 'Riverside', 'Rising Stars Junior Youth Group', 'Isabella Rossi', 'Isabella Rossi joined Rising Stars Junior Youth Group'),
  (now() - interval '30 days', 'participant_added', 'Cedar Hollow', 'Elmwood', 'Elmwood Junior Youth Circle', 'Ethan Park', 'Ethan Park joined Elmwood Junior Youth Circle'),
  (now() - interval '60 days', 'circle_movement', 'Cedar Hollow', 'Riverside', null, 'Ali Rahman', 'Ali Rahman moved from aware to participating'),
  (now() - interval '45 days', 'circle_movement', 'Cedar Hollow', 'Riverside', null, 'Diego Fernandez', 'Diego Fernandez moved from participating to supporting'),
  (now() - interval '30 days', 'circle_movement', 'Northgate', 'Pinecrest', null, 'Omar Haddad', 'Omar Haddad moved from aware to participating'),
  (now() - interval '2 months', 'course_started', 'Cedar Hollow', 'Riverside', null, 'Amara Osei', 'Amara Osei started Book 7'),
  (now() - interval '2 months', 'course_completed', 'Cedar Hollow', 'Riverside', null, 'Jonas Whitfield', 'Jonas Whitfield completed Book 5'),
  (now() - interval '1 month',  'course_completed', 'Cedar Hollow', 'Birchwood Commons', null, 'Elena Petrov', 'Elena Petrov completed Book 2'),
  (now() - interval '3 weeks',  'course_completed', 'Cedar Hollow', 'Riverside', null, 'Diego Fernandez', 'Diego Fernandez completed Unit 1 of Book 1')
) as x(ts, type, cluster_name, nucleus_name, activity_name, person_name, description)
join clusters c on c.name = x.cluster_name
left join nuclei n on n.name = x.nucleus_name
left join activities a on a.name = x.activity_name
left join persons p on p.name = x.person_name;

do $$ begin raise notice 'Event log backfilled: %', (select count(*) from event_log); end $$;


-- ============================================================
-- Done.
-- ============================================================
do $$
begin
  raise notice '============================================================';
  raise notice 'Demo dataset seeded: % clusters, % nuclei, % persons, % activities.',
    (select count(*) from clusters), (select count(*) from nuclei),
    (select count(*) from persons), (select count(*) from activities);
  raise notice 'Next: run scripts/seed-demo-accounts.sql after creating the demo login accounts (see the instructions that came with this file).';
  raise notice '============================================================';
end $$;
