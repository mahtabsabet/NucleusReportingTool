-- ============================================================
-- Activity Notebook: "Learning" field + per-entry attendance
--
-- Two changes to the Activity Notebook capture flow:
--
--   1. A single free-text `learning` field replaces the four
--      detailed prompts (encouraging_signs, challenges,
--      people_emerging, follow_up) in the composer. The old
--      columns are LEFT IN PLACE so historical entries keep
--      rendering their original text read-only — nothing is lost.
--      New entries write `what_happened` + `learning` only.
--
--   2. An attendance roster per entry. Each Activity Notebook
--      entry can record exactly who attended that occurrence,
--      drawn from the activity's standing participant roster at
--      the time the entry is written. Stored as a join table so
--      future data-freshness work ("who hasn't attended in a
--      while?", "when did person X last attend?") can query it
--      directly rather than parsing free text.
--
-- The join table mirrors journal_entry_themes: read/insert/delete
-- gated on activity-scope access to the parent entry. Attendance
-- rows are editable (insert + delete) so correcting an entry can
-- adjust who attended, consistent with journal_entry edits.
-- ============================================================

alter table journal_entries add column learning text;

create table journal_entry_attendance (
  entry_id   uuid not null references journal_entries(id) on delete cascade,
  person_id  uuid not null references persons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, person_id)
);

-- Indexed by person so "when did this person last attend?" and
-- "who hasn't attended recently?" stay cheap for the upcoming
-- freshness prompts.
create index on journal_entry_attendance (person_id);

alter table journal_entry_attendance enable row level security;

-- Read attendance for any entry the caller can already read.
create policy "Read attendance in accessible entries" on journal_entry_attendance
  for select using (
    is_admin() or exists (
      select 1 from journal_entries e
      where e.id = journal_entry_attendance.entry_id
        and user_has_nucleus_access(e.nucleus_id)
    )
  );

-- Record attendance at write time: anyone who can write the parent
-- activity entry can mark who attended it.
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

-- Editing an entry may remove an attendee that was checked by
-- mistake — same scope as the insert policy.
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
