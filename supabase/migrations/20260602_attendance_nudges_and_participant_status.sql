-- ============================================================
-- Attendance nudges + participant lifecycle status
--
-- Two related additions that turn the attendance-trends data into
-- actionable prompts:
--
--   1. A soft "inactive" status on activity participants. A lead can
--      mark someone inactive (kept on the roster, history preserved,
--      excluded from the upcoming cluster growth profile) instead of
--      removing them outright. `last_reviewed_at` records when a lead
--      last acted on the 60-day "hasn't attended" prompt so it snoozes
--      rather than re-nagging.
--
--   2. An occurrence log that records only the EXCEPTIONS to an
--      activity's expected schedule — sessions a lead dismissed the
--      reminder for, or confirmed "didn't happen this time". Expected
--      occurrences themselves are derived on the fly from the
--      activity's schedule fields; only these overrides are stored, so
--      we never have to materialise every session. `did_not_occur` is
--      kept distinct from `dismissed` because a confirmed non-occurrence
--      is meaningful to the future cluster growth profile, whereas a
--      plain dismissal is just "stop reminding me about this one".
--
-- Scope: read/write on both follows the same activity-scope access as
-- the notebook attendance rows (lead / nucleus collaborator / cluster
-- coordinator / admin).
-- ============================================================

-- ── 1. Participant status ────────────────────────────────────
create type activity_participant_status_enum as enum ('active', 'inactive');

alter table activity_participants
  add column status            activity_participant_status_enum not null default 'active',
  add column status_changed_at timestamptz,
  add column status_changed_by uuid references profiles(id) on delete set null,
  add column last_reviewed_at  timestamptz;

-- ── 2. Occurrence log (schedule exceptions only) ─────────────
create type activity_occurrence_status_enum as enum ('did_not_occur', 'dismissed');

create table activity_occurrence_log (
  id              uuid primary key default gen_random_uuid(),
  activity_id     uuid not null references activities(id) on delete cascade,
  occurrence_date date not null,
  status          activity_occurrence_status_enum not null,
  note            text,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  -- One override per (activity, occurrence). Re-dismissing or changing
  -- a decision upserts onto this row.
  unique (activity_id, occurrence_date)
);

create index on activity_occurrence_log (activity_id);

alter table activity_occurrence_log enable row level security;

create policy "Read occurrence log in accessible activities" on activity_occurrence_log
  for select using (
    is_admin() or user_has_activity_access(activity_id)
  );

create policy "Write occurrence log in accessible activities" on activity_occurrence_log
  for insert with check (
    is_admin() or user_has_activity_access(activity_id)
  );

create policy "Update occurrence log in accessible activities" on activity_occurrence_log
  for update using (
    is_admin() or user_has_activity_access(activity_id)
  ) with check (
    is_admin() or user_has_activity_access(activity_id)
  );

create policy "Delete occurrence log in accessible activities" on activity_occurrence_log
  for delete using (
    is_admin() or user_has_activity_access(activity_id)
  );

-- ── 3. Audit event types ─────────────────────────────────────
alter type event_log_type_enum add value if not exists 'participant_marked_inactive';
alter type event_log_type_enum add value if not exists 'participant_reactivated';
