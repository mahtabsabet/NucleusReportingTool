-- ============================================================
-- Privacy & Information Stewardship Acknowledgement
--
-- Every user must acknowledge the current policy version before
-- the app lets them through. Two pieces of state:
--
--   1. profiles.privacy_acknowledged_at         (last ack timestamp)
--      profiles.privacy_policy_version_acknowledged (text version)
--      ─ The "current state" the gate checks on each load.
--
--   2. privacy_acknowledgements                 (append-only log)
--      ─ Audit history: every ack a user has ever made, kept
--        even after admin resets so we can answer "did this
--        person, on this date, agree to that version?".
--
-- A user is considered acknowledged when their profile columns
-- equal the value of `current_privacy_policy_version()` (which
-- is just a SQL function so the version bump lives in one place).
--
-- Admins reset acknowledgement by nulling the two profile columns.
-- The audit log is never erased.
-- ============================================================

alter table profiles
  add column if not exists privacy_acknowledged_at        timestamptz,
  add column if not exists privacy_policy_version_acknowledged text;

create table if not exists privacy_acknowledgements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  policy_version  text not null,
  acknowledged_at timestamptz not null default now()
);

create index if not exists privacy_acknowledgements_user_idx
  on privacy_acknowledgements (user_id, acknowledged_at desc);

alter table privacy_acknowledgements enable row level security;

-- A user can see and append their own acknowledgement history.
-- Admins can see everyone's history. Nobody updates or deletes
-- rows (append-only audit trail; admin "reset" only clears the
-- profile columns, leaving the log intact).
create policy "Read own acknowledgements" on privacy_acknowledgements
  for select using (user_id = auth.uid() or is_admin());

create policy "Insert own acknowledgement" on privacy_acknowledgements
  for insert with check (user_id = auth.uid());

-- ─── Current policy version ──────────────────────────────────
-- Bump the literal here when the policy text changes. Old
-- acknowledgements remain in the audit log; users will be
-- shown the gate again on next load because their profile
-- column no longer matches.

create or replace function current_privacy_policy_version()
returns text language sql immutable as $$
  select '2026-05-13'::text
$$;

-- ─── Reset RPC (admin only) ──────────────────────────────────
-- Clears the profile-level "acknowledged" markers for a user so
-- the gate fires again on next login. The audit history in
-- privacy_acknowledgements is preserved.

create or replace function reset_privacy_acknowledgement(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only administrators may reset privacy acknowledgements';
  end if;
  update profiles
     set privacy_acknowledged_at = null,
         privacy_policy_version_acknowledged = null
   where id = target_user_id;
end;
$$;

revoke all on function reset_privacy_acknowledgement(uuid) from public;
grant execute on function reset_privacy_acknowledgement(uuid) to authenticated;
