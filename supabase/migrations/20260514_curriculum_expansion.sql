-- ============================================================
-- Curriculum expansion: flexible streams, books, units, branch
-- courses, and the Junior Youth Spiritual Empowerment Program.
--
-- The old system hard-coded "Books 1-7" as a flat course list.
-- This migration turns `courses` into a relational curriculum:
--
--   stream                  : which curriculum a course belongs to
--                             ('ruhi_main' | 'branch' | 'jysep')
--   parent_course_id        : branch courses hang off a main-
--                             sequence book (Book 3 / Book 5)
--   allows_whole_completion : false for books whose unit set is
--                             not yet finalized (Books 12-14 have
--                             a placeholder Unit 3) — those can
--                             only be marked partially complete
--
-- `course_units` holds the units of a Ruhi book (NOT assumed to
-- be 3 — Book 3 has 2, Books 12-14 carry a placeholder). JY texts
-- and branch courses have no units; they are tracked whole/partial.
--
-- Completion is now a 3-state status ('in_progress',
-- 'partially_completed', 'completed') used by both course-level
-- and unit-level enrollments.
--
-- Forward-looking: `nucleus_id` on both enrollment tables and
-- `activities.current_course_id` (which can now point at a JY
-- text or branch course) leave room for future study-circle /
-- JY-group completion workflows without further schema changes.
-- Idempotent — safe to re-run.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Extend `courses` into a curriculum structure
-- ----------------------------------------------------------------

alter table courses
  add column if not exists stream                  text not null default 'ruhi_main',
  add column if not exists parent_course_id        uuid references courses(id),
  add column if not exists allows_whole_completion boolean not null default true;

alter table courses drop constraint if exists courses_stream_check;
alter table courses add constraint courses_stream_check
  check (stream in ('ruhi_main', 'branch', 'jysep'));

create index if not exists courses_parent_idx on courses (parent_course_id);

-- ----------------------------------------------------------------
-- 2. 3-state completion status (replaces the 2-state enum)
-- ----------------------------------------------------------------

do $$ begin
  create type completion_status_enum as enum
    ('in_progress', 'partially_completed', 'completed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'course_enrollments'
      and column_name = 'status'
      and udt_name = 'course_status_enum'
  ) then
    alter table course_enrollments alter column status drop default;
    alter table course_enrollments
      alter column status type completion_status_enum
      using status::text::completion_status_enum;
    alter table course_enrollments alter column status set default 'in_progress';
  end if;
end $$;

drop type if exists course_status_enum;

-- ----------------------------------------------------------------
-- 3. Units of a Ruhi book
-- ----------------------------------------------------------------

create table if not exists course_units (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references courses(id),
  name           text not null,
  "order"        int not null default 0,
  -- A placeholder unit reserves a slot for content not yet
  -- released (e.g. the future Unit 3 of Books 12-14). It can be
  -- displayed but never marked complete.
  is_placeholder boolean not null default false,
  unique (course_id, "order")
);

create index if not exists course_units_course_idx on course_units (course_id);

-- ----------------------------------------------------------------
-- 4. Per-person unit-level completion
-- ----------------------------------------------------------------

create table if not exists course_unit_enrollments (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid not null references persons(id) on delete cascade,
  course_unit_id uuid not null references course_units(id),
  status         completion_status_enum not null default 'in_progress',
  started_at     date,
  completed_at   date,
  nucleus_id     uuid references nuclei(id),
  unique (person_id, course_unit_id)
);

create index if not exists course_unit_enrollments_person_idx
  on course_unit_enrollments (person_id);

-- ----------------------------------------------------------------
-- 5. Row Level Security
-- ----------------------------------------------------------------

alter table course_units            enable row level security;
alter table course_unit_enrollments enable row level security;

drop policy if exists "Authenticated users read course units" on course_units;
create policy "Authenticated users read course units" on course_units
  for select using (auth.uid() is not null);

drop policy if exists "Admins manage course units" on course_units;
create policy "Admins manage course units" on course_units
  for all using (is_admin());

drop policy if exists "Read course unit enrollments in scope" on course_unit_enrollments;
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

drop policy if exists "Activity leads and above manage course unit enrollments" on course_unit_enrollments;
create policy "Activity leads and above manage course unit enrollments" on course_unit_enrollments
  for all using (
    is_admin() or exists (
      select 1 from user_permissions
      where user_id = auth.uid()
        and role in ('cluster_coordinator', 'nucleus_collaborator', 'activity_lead')
    )
  );

-- ----------------------------------------------------------------
-- 6. Seed / reconcile the curriculum catalog
--
-- Existing Books 1-7 are matched by short_name and updated in
-- place so their course_enrollments survive. Everything else is
-- inserted only when missing.
-- ----------------------------------------------------------------

-- 6a. Reconcile the main-sequence books (1-14).
do $$
declare
  rec record;
  v_course_id uuid;
begin
  for rec in
    select * from (values
      ('Book 1',  'Book 1: Reflections on the Life of the Spirit', 1,  true),
      ('Book 2',  'Book 2: Arising to Serve',                      2,  true),
      ('Book 3',  'Book 3: Teaching Children''s Classes, Grade 1', 3,  true),
      ('Book 4',  'Book 4: The Twin Manifestations',               4,  true),
      ('Book 5',  'Book 5: Releasing the Powers of Junior Youth',  5,  true),
      ('Book 6',  'Book 6: Teaching the Cause',                    6,  true),
      ('Book 7',  'Book 7: Walking Together on a Path of Service',  7,  true),
      ('Book 8',  'Book 8: The Covenant of Baha''u''llah',          8,  true),
      ('Book 9',  'Book 9: Gaining an Historical Perspective',     9,  true),
      ('Book 10', 'Book 10: Building Vibrant Communities',         10, true),
      ('Book 11', 'Book 11: Material Means',                       11, true),
      ('Book 12', 'Book 12: Family and the Community',             12, false),
      ('Book 13', 'Book 13: Engaging in Social Action',            13, false),
      ('Book 14', 'Book 14: Participating in Public Discourse',    14, false)
    ) as t(short_name, name, ord, allows_whole)
  loop
    select id into v_course_id from courses where short_name = rec.short_name limit 1;
    if v_course_id is null then
      insert into courses (name, short_name, "order", stream, allows_whole_completion, is_active)
      values (rec.name, rec.short_name, rec.ord, 'ruhi_main', rec.allows_whole, true);
    else
      update courses
         set name = rec.name,
             "order" = rec.ord,
             stream = 'ruhi_main',
             parent_course_id = null,
             allows_whole_completion = rec.allows_whole,
             is_active = true
       where id = v_course_id;
    end if;
  end loop;
end $$;

-- 6b. Units of each main-sequence book.
do $$
declare
  rec record;
  v_course_id uuid;
begin
  for rec in
    select * from (values
      ('Book 1', 1, 'Understanding the Bahá''í Writings',                       false),
      ('Book 1', 2, 'Prayer',                                                   false),
      ('Book 1', 3, 'Life and Death',                                           false),
      ('Book 2', 1, 'The Joy of Teaching',                                      false),
      ('Book 2', 2, 'Uplifting Conversations',                                  false),
      ('Book 2', 3, 'Deepening Themes',                                         false),
      ('Book 3', 1, 'Some Principles of Bahá''í Education',                     false),
      ('Book 3', 2, 'Lessons for Children''s Classes, Grade 1',                false),
      ('Book 4', 1, 'The Greatness of This Day',                                false),
      ('Book 4', 2, 'The Life of the Báb',                                      false),
      ('Book 4', 3, 'The Life of Bahá''u''lláh',                                 false),
      ('Book 5', 1, 'Life''s Springtime',                                       false),
      ('Book 5', 2, 'An Age of Promise',                                        false),
      ('Book 5', 3, 'Serving as an Animator',                                   false),
      ('Book 6', 1, 'The Spiritual Nature of Teaching',                         false),
      ('Book 6', 2, 'Qualities and Attitudes Essential for Teaching',           false),
      ('Book 6', 3, 'The Act of Teaching',                                      false),
      ('Book 7', 1, 'The Spiritual Dynamics of Advancing on a Path of Service', false),
      ('Book 7', 2, 'Serving as a Tutor of the Institute Courses',              false),
      ('Book 7', 3, 'Promoting the Arts at the Grassroots',                     false),
      ('Book 8', 1, 'The Center of the Covenant and His Will and Testament',    false),
      ('Book 8', 2, 'The Guardian of the Faith',                                false),
      ('Book 8', 3, 'The Universal House of Justice',                           false),
      ('Book 9', 1, 'The Eternal Covenant',                                     false),
      ('Book 9', 2, 'Passage to Maturity',                                      false),
      ('Book 9', 3, 'A Sacred Enterprise',                                      false),
      ('Book 10', 1, 'Accompanying One Another on the Path of Service',         false),
      ('Book 10', 2, 'Consultation',                                            false),
      ('Book 10', 3, 'Dynamics of Service on an Area Teaching Committee',        false),
      ('Book 11', 1, 'Giving: The Spiritual Basis of Prosperity',               false),
      ('Book 11', 2, 'The Institution of the Fund',                             false),
      ('Book 11', 3, 'The Law of Huqúqu''lláh',                                 false),
      ('Book 12', 1, 'The Institution of Marriage',                             false),
      ('Book 12', 2, 'An Expanding Conversation on the Education of Children',   false),
      ('Book 12', 3, 'Unit 3 (placeholder — not yet released)',                 true),
      ('Book 13', 1, 'Stirrings at the Grassroots',                             false),
      ('Book 13', 2, 'Elements of a Conceptual Framework',                      false),
      ('Book 13', 3, 'Unit 3 (placeholder — not yet released)',                 true),
      ('Book 14', 1, 'The Nature of Our Contributions',                         false),
      ('Book 14', 2, 'Dynamics of Our Participation',                           false),
      ('Book 14', 3, 'Unit 3 (placeholder — not yet released)',                 true)
    ) as t(short_name, ord, unit_name, is_placeholder)
  loop
    select id into v_course_id from courses where short_name = rec.short_name limit 1;
    if v_course_id is not null and not exists (
      select 1 from course_units where course_id = v_course_id and "order" = rec.ord
    ) then
      insert into course_units (course_id, "order", name, is_placeholder)
      values (v_course_id, rec.ord, rec.unit_name, rec.is_placeholder);
    end if;
  end loop;
end $$;

-- 6c. Branch courses, nested under Book 3 and Book 5.
do $$
declare
  rec record;
  v_parent_id uuid;
begin
  for rec in
    select * from (values
      ('Book 3', 'Grade 2',         'Teaching Children''s Classes, Grade 2', 1),
      ('Book 3', 'Grade 3',         'Teaching Children''s Classes, Grade 3', 2),
      ('Book 3', 'Grade 4',         'Teaching Children''s Classes, Grade 4', 3),
      ('Book 5', 'Initial Impulse', 'Initial Impulse',                       1),
      ('Book 5', 'Widening Circle', 'Widening Circle',                       2)
    ) as t(parent_short_name, short_name, name, ord)
  loop
    select id into v_parent_id from courses where short_name = rec.parent_short_name limit 1;
    if v_parent_id is not null and not exists (
      select 1 from courses where short_name = rec.short_name and parent_course_id = v_parent_id
    ) then
      insert into courses (name, short_name, "order", stream, parent_course_id, allows_whole_completion, is_active)
      values (rec.name, rec.short_name, rec.ord, 'branch', v_parent_id, true, true);
    end if;
  end loop;
end $$;

-- 6d. Junior Youth Spiritual Empowerment Program texts.
do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      (1,  'Breezes of Confirmation'),
      (2,  'Wellspring of Joy'),
      (3,  'Habits of an Orderly Mind'),
      (4,  'Glimmerings of Hope'),
      (5,  'Walking the Straight Path'),
      (6,  'On Health and Well-Being'),
      (7,  'Learning About Excellence'),
      (8,  'Drawing on the Power of the Word'),
      (9,  'Thinking About Numbers'),
      (10, 'Observation and Insight'),
      (11, 'The Human Temple'),
      (12, 'Making Sense of Data'),
      (13, 'Spirit of Faith'),
      (14, 'Power of the Holy Spirit'),
      (15, 'Rays of Light')
    ) as t(ord, name)
  loop
    if not exists (
      select 1 from courses where stream = 'jysep' and name = rec.name
    ) then
      insert into courses (name, short_name, "order", stream, allows_whole_completion, is_active)
      values (rec.name, rec.name, rec.ord, 'jysep', true, true);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------
-- 7. Backfill unit enrollments from legacy course enrollments
--
-- Existing course_enrollments on Ruhi books predate unit tracking.
-- Units are now the source of truth for a Ruhi book's progress, so
-- mirror each legacy enrollment onto its book's non-placeholder
-- units. The book's course-level row is kept as the rollup.
-- ----------------------------------------------------------------

insert into course_unit_enrollments (person_id, course_unit_id, status, started_at, completed_at, nucleus_id)
select ce.person_id, cu.id, ce.status, ce.started_at, ce.completed_at, ce.nucleus_id
from course_enrollments ce
join courses c on c.id = ce.course_id and c.stream = 'ruhi_main'
join course_units cu on cu.course_id = c.id and cu.is_placeholder = false
where not exists (
  select 1 from course_unit_enrollments cue
  where cue.person_id = ce.person_id and cue.course_unit_id = cu.id
);
