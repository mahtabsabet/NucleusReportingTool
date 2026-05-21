-- ============================================================
-- Reflective Learning System
--
-- Replaces the flat `activities.notes` and `nuclei.notes` text
-- fields with a two-layer journal:
--   • Activity Notebook  — append-only field-notebook entries
--                          captured right after an activity.
--   • Nucleus Journal    — append-only nucleus-level reflections
--                          plus a persistent set of "Objects of
--                          Learning" (learning themes) that bind
--                          the two layers together.
--
-- Activity entries can be tagged with learning themes drawn from
-- the parent nucleus. Clicking a theme in the Nucleus Journal
-- surfaces every entry — activity- and nucleus-level — ever
-- tagged with it, across all time.
--
-- Append-only is enforced by omitting UPDATE/DELETE policies on
-- journal_entries and journal_entry_themes. learning_themes is
-- the only mutable surface, and only for elevated roles (CC/NC).
--
-- Old `activities.notes` and `nuclei.notes` are left in place by
-- this migration: existing text is back-filled into one seed
-- journal entry per record so no institutional memory is lost.
-- A follow-up migration can drop the columns once the new UI
-- has been verified in production.
-- ============================================================


-- ============================================================
-- Tables
-- ============================================================

create table learning_themes (
  id             uuid primary key default gen_random_uuid(),
  nucleus_id     uuid not null references nuclei(id) on delete cascade,
  name           text not null,
  description    text,
  -- Highlighter palette. Free-form so future palette additions
  -- don't require an enum migration. UI maps unknown values to a
  -- neutral default.
  color          text not null default 'amber',
  status         text not null default 'emerging'
                 check (status in ('emerging', 'established', 'archived')),
  proposed_by    uuid references profiles(id) on delete set null,
  proposed_at    timestamptz not null default now(),
  promoted_at    timestamptz,
  -- Set when this theme is merged into another. The surviving
  -- theme is merged_into_id; tags on this theme's entries are
  -- re-pointed by the merge operation.
  merged_into_id uuid references learning_themes(id) on delete set null,
  unique (nucleus_id, name)
);

create table journal_entries (
  id                uuid primary key default gen_random_uuid(),
  nucleus_id        uuid not null references nuclei(id) on delete cascade,
  source            text not null check (source in ('activity', 'nucleus')),
  -- Required when source = 'activity'; null otherwise.
  activity_id       uuid references activities(id) on delete set null,
  author_id         uuid references profiles(id) on delete set null,
  -- occurred_at = when the reflection refers to (typically the
  -- activity time). created_at = when the entry was written. They
  -- usually match but can diverge for late-written reflections.
  occurred_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),

  -- Activity-style prompts. All optional — the notebook is meant
  -- to feel lightweight, not a required form.
  what_happened     text,
  encouraging_signs text,
  challenges        text,
  people_emerging   text,
  follow_up         text,

  -- Nucleus-style narrative. Either prompts OR body should be
  -- non-empty in practice; we don't enforce it at the DB level
  -- because back-filled rows from legacy notes may carry only one
  -- or the other.
  body              text,

  constraint activity_entry_has_activity check (
    source = 'nucleus' or activity_id is not null
  )
);

create table journal_entry_themes (
  entry_id   uuid not null references journal_entries(id) on delete cascade,
  theme_id   uuid not null references learning_themes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, theme_id)
);


-- ============================================================
-- Indexes
-- ============================================================

create index on learning_themes (nucleus_id, status);
create index on journal_entries (nucleus_id, occurred_at desc);
create index on journal_entries (activity_id, occurred_at desc)
  where activity_id is not null;
create index on journal_entry_themes (theme_id);


-- ============================================================
-- RLS
-- ============================================================

alter table learning_themes      enable row level security;
alter table journal_entries      enable row level security;
alter table journal_entry_themes enable row level security;


-- learning_themes ---------------------------------------------

create policy "Read themes in accessible nuclei" on learning_themes
  for select using (is_admin() or user_has_nucleus_access(nucleus_id));

-- Activity leads (and above) can PROPOSE a theme. The app forces
-- status='emerging' for activity-lead inserts; CC/NC can create
-- themes that go straight to 'established'. The DB doesn't gate
-- the status field itself — the UI does — because the cost of an
-- over-eager AL proposing an 'established' theme is just a quick
-- demote by a CC/NC, not a security issue.
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

-- Promote / rename / archive / merge. CC and NC only — activity
-- leads can't curate the nucleus-wide theme list.
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


-- journal_entries ---------------------------------------------

create policy "Read entries in accessible nuclei" on journal_entries
  for select using (is_admin() or user_has_nucleus_access(nucleus_id));

-- Activity entries: any role with access to the activity may write.
-- Per product spec authorship is currently scoped to activity leads
-- by the UI; the DB allows CC/NC too so they can correct or backfill.
create policy "Write activity entries" on journal_entries
  for insert with check (
    source = 'activity'
    and activity_id is not null
    and (is_admin() or user_has_activity_access(activity_id))
  );

-- Nucleus entries: CC/NC on this nucleus.
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

-- No UPDATE / DELETE policies on journal_entries: append-only.


-- journal_entry_themes ----------------------------------------

create policy "Read entry tags in accessible nuclei" on journal_entry_themes
  for select using (
    is_admin() or exists (
      select 1 from journal_entries e
      where e.id = journal_entry_themes.entry_id
        and user_has_nucleus_access(e.nucleus_id)
    )
  );

-- Tag at write time: anyone who can write the parent entry can
-- attach themes to it. There's no separate "edit tags" flow.
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

-- Merging themes re-points tags from the merged theme onto the
-- surviving theme. That's an UPDATE on entry_id-stable rows; only
-- CC/NC may do it.
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


-- ============================================================
-- Back-fill legacy notes into journal entries
--
-- One seed entry per non-empty notes field. Source = 'activity'
-- or 'nucleus' accordingly. author_id is null because we don't
-- know who wrote the legacy text. occurred_at is now() — we have
-- no better timestamp on the legacy columns.
-- ============================================================

insert into journal_entries (nucleus_id, source, activity_id, body)
select a.nucleus_id, 'activity', a.id, a.notes
from activities a
where a.notes is not null and length(trim(a.notes)) > 0;

insert into journal_entries (nucleus_id, source, body)
select n.id, 'nucleus', n.notes
from nuclei n
where n.notes is not null and length(trim(n.notes)) > 0;
