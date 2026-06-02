-- ============================================================
-- Sample data for the attendance nudges + participant status.
--
-- Seeds one dedicated nucleus — "Attendance Nudge Demo" — in the
-- FIRST cluster alphabetically, with five activities that each
-- exercise a distinct branch of the nudge logic, plus participants
-- whose attendance histories trigger the 60-day lapsed-review and
-- inactive-status paths.
--
-- Person names are deliberately self-describing ("Demo · Noor
-- (lapsed 60d+)") so you can see at a glance which scenario each
-- one is meant to demonstrate.
--
-- All dates are relative to now(), so the scenarios stay valid
-- whenever you run this. Idempotent: re-running updates in place.
--
-- Prerequisite: the 20260602_attendance_nudges_and_participant_status
-- migration must be applied first.
--
-- What to look for after seeding, in the "Attendance Nudge Demo"
-- nucleus:
--   • Tuesday Children's Class  → "Time to log a session" banner,
--       plus a "haven't attended in 60+ days" review panel listing
--       Noor (Eli is snoozed; Kai never attended so isn't flagged),
--       and Mara under a collapsed "Inactive" section.
--   • Drop-in Devotional        → steady, non-dismissible reminder.
--   • Spring Intensive          → missed-occurrence banner (nothing
--       logged before it wrapped up).
--   • Up-to-date Wed Class      → NO banners (logged through today).
--   • Completed Book 1 Circle   → NO banners (not active).
-- ============================================================

do $$
declare
  c_id  uuid;
  nd_id uuid;
  -- activities
  a_tue uuid;  -- structured_recurring, active, behind on logging
  a_dev uuid;  -- sporadic_ongoing, active
  a_int uuid;  -- short_duration, active, window elapsed unlogged
  a_wed uuid;  -- structured_recurring, active, up to date
  a_done uuid; -- study_circle, completed (control)
  -- persons
  p_aria uuid; p_sam uuid; p_noor uuid; p_eli uuid; p_mara uuid;
  p_kai uuid;  p_jordan uuid; p_priya uuid;
  e_id uuid;
begin

select id into c_id from clusters where deleted_at is null order by name limit 1;
if c_id is null then raise notice 'No clusters found; aborting seed.'; return; end if;

-- ─── Dedicated nucleus ─────────────────────────────────────
select id into nd_id from nuclei
  where cluster_id = c_id and name = 'Attendance Nudge Demo' and deleted_at is null limit 1;
if nd_id is null then
  insert into nuclei (cluster_id, name, lat, lng)
  values (c_id, 'Attendance Nudge Demo', 53.5444, -113.4909)
  returning id into nd_id;
end if;

-- ─── Persons (self-describing demo names) ──────────────────
select id into p_aria from persons where name = 'Demo · Aria (active teacher)' limit 1;
if p_aria is null then insert into persons (name, age_group, is_minor, profile_status)
  values ('Demo · Aria (active teacher)', 'adult', false, 'confirmed') returning id into p_aria; end if;

select id into p_sam from persons where name = 'Demo · Sam (active)' limit 1;
if p_sam is null then insert into persons (name, age_group, is_minor, profile_status)
  values ('Demo · Sam (active)', 'child', true, 'confirmed') returning id into p_sam; end if;

select id into p_noor from persons where name = 'Demo · Noor (lapsed 60d+)' limit 1;
if p_noor is null then insert into persons (name, age_group, is_minor, profile_status)
  values ('Demo · Noor (lapsed 60d+)', 'child', true, 'confirmed') returning id into p_noor; end if;

select id into p_eli from persons where name = 'Demo · Eli (lapsed but reviewed)' limit 1;
if p_eli is null then insert into persons (name, age_group, is_minor, profile_status)
  values ('Demo · Eli (lapsed but reviewed)', 'child', true, 'confirmed') returning id into p_eli; end if;

select id into p_mara from persons where name = 'Demo · Mara (inactive)' limit 1;
if p_mara is null then insert into persons (name, age_group, is_minor, profile_status)
  values ('Demo · Mara (inactive)', 'child', true, 'confirmed') returning id into p_mara; end if;

select id into p_kai from persons where name = 'Demo · Kai (never attended)' limit 1;
if p_kai is null then insert into persons (name, age_group, is_minor, profile_status)
  values ('Demo · Kai (never attended)', 'child', true, 'confirmed') returning id into p_kai; end if;

select id into p_jordan from persons where name = 'Demo · Jordan' limit 1;
if p_jordan is null then insert into persons (name, age_group, is_minor, profile_status)
  values ('Demo · Jordan', 'adult', false, 'confirmed') returning id into p_jordan; end if;

select id into p_priya from persons where name = 'Demo · Priya' limit 1;
if p_priya is null then insert into persons (name, age_group, is_minor, profile_status)
  values ('Demo · Priya', 'adult', false, 'confirmed') returning id into p_priya; end if;

-- ─── Activity 1: weekly Tuesday class, behind on logging ───
-- Weekly (Tue) since 10 weeks ago; last entry was 2 weeks ago, so a
-- scheduled session has passed unlogged → "Time to log" nudge. Also
-- the home of the lapsed/inactive participant cases.
select id into a_tue from activities
  where nucleus_id = nd_id and name = 'Demo · Tuesday Children''s Class' and deleted_at is null limit 1;
if a_tue is null then
  insert into activities (nucleus_id, name, type, is_active, lifecycle_state, scheduling_mode,
    schedule_days_of_week, schedule_day_of_week, schedule_time, schedule_interval_weeks, start_date)
  values (nd_id, 'Demo · Tuesday Children''s Class', 'children_class', true, 'active',
    'structured_recurring', array[2], 2, '17:00', 1, current_date - 70)
  returning id into a_tue;
else
  update activities set lifecycle_state = 'active', is_active = true, scheduling_mode = 'structured_recurring',
    schedule_days_of_week = array[2], schedule_day_of_week = 2, schedule_time = '17:00',
    schedule_interval_weeks = 1, start_date = current_date - 70, end_date = null
  where id = a_tue;
end if;

insert into activity_participants (activity_id, person_id, role, status, last_reviewed_at) values
  (a_tue, p_aria, 'teacher', 'active', null),
  (a_tue, p_sam,  'child',   'active', null),
  (a_tue, p_noor, 'child',   'active', null),
  (a_tue, p_eli,  'child',   'active', now() - interval '10 days'),  -- reviewed → snoozed
  (a_tue, p_mara, 'child',   'inactive', null),
  (a_tue, p_kai,  'child',   'active', null)
on conflict (activity_id, person_id) do update
  set role = excluded.role, status = excluded.status,
      last_reviewed_at = excluded.last_reviewed_at, deleted_at = null;

-- Sessions (notebook entries with attendance), oldest → newest.
if not exists (select 1 from journal_entries where activity_id = a_tue and what_happened like '[demo-tue-s1]%') then
  insert into journal_entries (nucleus_id, source, activity_id, occurred_at, what_happened)
  values (nd_id, 'activity', a_tue, now() - interval '90 days', '[demo-tue-s1] Full class to start the cycle.')
  returning id into e_id;
  insert into journal_entry_attendance (entry_id, person_id) values
    (e_id, p_aria), (e_id, p_sam), (e_id, p_noor), (e_id, p_mara)
  on conflict do nothing;
end if;

if not exists (select 1 from journal_entries where activity_id = a_tue and what_happened like '[demo-tue-s2]%') then
  insert into journal_entries (nucleus_id, source, activity_id, occurred_at, what_happened)
  values (nd_id, 'activity', a_tue, now() - interval '65 days', '[demo-tue-s2] Noor and Eli here for the last time so far.')
  returning id into e_id;
  insert into journal_entry_attendance (entry_id, person_id) values
    (e_id, p_aria), (e_id, p_sam), (e_id, p_noor), (e_id, p_eli)
  on conflict do nothing;
end if;

if not exists (select 1 from journal_entries where activity_id = a_tue and what_happened like '[demo-tue-s3]%') then
  insert into journal_entries (nucleus_id, source, activity_id, occurred_at, what_happened)
  values (nd_id, 'activity', a_tue, now() - interval '30 days', '[demo-tue-s3] Core group only.')
  returning id into e_id;
  insert into journal_entry_attendance (entry_id, person_id) values (e_id, p_aria), (e_id, p_sam)
  on conflict do nothing;
end if;

if not exists (select 1 from journal_entries where activity_id = a_tue and what_happened like '[demo-tue-s4]%') then
  insert into journal_entries (nucleus_id, source, activity_id, occurred_at, what_happened)
  values (nd_id, 'activity', a_tue, now() - interval '14 days', '[demo-tue-s4] Last logged session.')
  returning id into e_id;
  insert into journal_entry_attendance (entry_id, person_id) values (e_id, p_aria), (e_id, p_sam)
  on conflict do nothing;
end if;

-- ─── Activity 2: sporadic devotional (steady reminder) ─────
select id into a_dev from activities
  where nucleus_id = nd_id and name = 'Demo · Drop-in Devotional' and deleted_at is null limit 1;
if a_dev is null then
  insert into activities (nucleus_id, name, type, is_active, lifecycle_state, scheduling_mode, start_date)
  values (nd_id, 'Demo · Drop-in Devotional', 'devotional', true, 'active', 'sporadic_ongoing', current_date - 120)
  returning id into a_dev;
else
  update activities set lifecycle_state = 'active', is_active = true, scheduling_mode = 'sporadic_ongoing',
    schedule_days_of_week = array[]::int[], schedule_day_of_week = null, end_date = null
  where id = a_dev;
end if;

insert into activity_participants (activity_id, person_id, role, status) values
  (a_dev, p_aria,   'host',        'active'),
  (a_dev, p_jordan, 'participant', 'active')
on conflict (activity_id, person_id) do update
  set role = excluded.role, status = excluded.status, deleted_at = null;

if not exists (select 1 from journal_entries where activity_id = a_dev and what_happened like '[demo-dev-s1]%') then
  insert into journal_entries (nucleus_id, source, activity_id, occurred_at, what_happened)
  values (nd_id, 'activity', a_dev, now() - interval '20 days', '[demo-dev-s1] Quiet, warm gathering.')
  returning id into e_id;
  insert into journal_entry_attendance (entry_id, person_id) values (e_id, p_aria), (e_id, p_jordan)
  on conflict do nothing;
end if;

-- ─── Activity 3: short-duration intensive, window elapsed ──
-- Met Wednesdays for 3 weeks, ended 2 days ago, nothing logged → the
-- missed-occurrence nudge fires for a finite activity.
select id into a_int from activities
  where nucleus_id = nd_id and name = 'Demo · Spring Intensive (wrapped up)' and deleted_at is null limit 1;
if a_int is null then
  insert into activities (nucleus_id, name, type, is_active, lifecycle_state, scheduling_mode,
    schedule_days_of_week, schedule_day_of_week, schedule_time, schedule_interval_weeks, start_date, end_date)
  values (nd_id, 'Demo · Spring Intensive (wrapped up)', 'study_circle', true, 'active',
    'short_duration', array[3], 3, '10:00', 1, current_date - 21, current_date - 2)
  returning id into a_int;
else
  update activities set lifecycle_state = 'active', is_active = true, scheduling_mode = 'short_duration',
    schedule_days_of_week = array[3], schedule_day_of_week = 3, schedule_time = '10:00',
    schedule_interval_weeks = 1, start_date = current_date - 21, end_date = current_date - 2
  where id = a_int;
end if;

insert into activity_participants (activity_id, person_id, role, status) values
  (a_int, p_priya,  'tutor',       'active'),
  (a_int, p_jordan, 'participant', 'active')
on conflict (activity_id, person_id) do update
  set role = excluded.role, status = excluded.status, deleted_at = null;

-- ─── Activity 4: up-to-date weekly class (no nudges) ───────
select id into a_wed from activities
  where nucleus_id = nd_id and name = 'Demo · Up-to-date Wednesday Class' and deleted_at is null limit 1;
if a_wed is null then
  insert into activities (nucleus_id, name, type, is_active, lifecycle_state, scheduling_mode,
    schedule_days_of_week, schedule_day_of_week, schedule_time, schedule_interval_weeks, start_date)
  values (nd_id, 'Demo · Up-to-date Wednesday Class', 'children_class', true, 'active',
    'structured_recurring', array[3], 3, '16:30', 1, current_date - 56)
  returning id into a_wed;
else
  update activities set lifecycle_state = 'active', is_active = true, scheduling_mode = 'structured_recurring',
    schedule_days_of_week = array[3], schedule_day_of_week = 3, schedule_time = '16:30',
    schedule_interval_weeks = 1, start_date = current_date - 56, end_date = null
  where id = a_wed;
end if;

insert into activity_participants (activity_id, person_id, role, status) values
  (a_wed, p_aria,   'teacher', 'active'),
  (a_wed, p_sam,    'child',   'active'),
  (a_wed, p_jordan, 'child',   'active')
on conflict (activity_id, person_id) do update
  set role = excluded.role, status = excluded.status, deleted_at = null;

if not exists (select 1 from journal_entries where activity_id = a_wed and what_happened like '[demo-wed-s1]%') then
  insert into journal_entries (nucleus_id, source, activity_id, occurred_at, what_happened)
  values (nd_id, 'activity', a_wed, now() - interval '7 days', '[demo-wed-s1] Logged last week.')
  returning id into e_id;
  insert into journal_entry_attendance (entry_id, person_id) values
    (e_id, p_aria), (e_id, p_sam), (e_id, p_jordan) on conflict do nothing;
end if;
-- Logged "today" so no scheduled occurrence is outstanding.
if not exists (select 1 from journal_entries where activity_id = a_wed and what_happened like '[demo-wed-s2]%') then
  insert into journal_entries (nucleus_id, source, activity_id, occurred_at, what_happened)
  values (nd_id, 'activity', a_wed, now(), '[demo-wed-s2] Logged today — all caught up.')
  returning id into e_id;
  insert into journal_entry_attendance (entry_id, person_id) values
    (e_id, p_aria), (e_id, p_sam), (e_id, p_jordan) on conflict do nothing;
end if;

-- ─── Activity 5: completed circle (control, no nudges) ─────
select id into a_done from activities
  where nucleus_id = nd_id and name = 'Demo · Completed Book 1 Circle' and deleted_at is null limit 1;
if a_done is null then
  insert into activities (nucleus_id, name, type, is_active, lifecycle_state, scheduling_mode,
    start_date, end_date, completed_at)
  values (nd_id, 'Demo · Completed Book 1 Circle', 'study_circle', false, 'completed',
    'short_duration', current_date - 120, current_date - 30, now() - interval '30 days')
  returning id into a_done;
else
  update activities set lifecycle_state = 'completed', is_active = false
  where id = a_done;
end if;

insert into activity_participants (activity_id, person_id, role, status) values
  (a_done, p_sam,   'participant', 'active'),
  (a_done, p_priya, 'tutor',       'active')
on conflict (activity_id, person_id) do update
  set role = excluded.role, status = excluded.status, deleted_at = null;

if not exists (select 1 from journal_entries where activity_id = a_done and what_happened like '[demo-done-s1]%') then
  insert into journal_entries (nucleus_id, source, activity_id, occurred_at, what_happened)
  values (nd_id, 'activity', a_done, now() - interval '35 days', '[demo-done-s1] Final unit — book complete.')
  returning id into e_id;
  insert into journal_entry_attendance (entry_id, person_id) values (e_id, p_sam), (e_id, p_priya)
  on conflict do nothing;
end if;

raise notice 'Attendance nudge demo data seeded into nucleus % (cluster %)', nd_id, c_id;
end $$;
