-- ============================================================
-- Adds a per-user "must change password on next login" flag.
--
-- Set to true whenever an admin sets a temporary password for a
-- user. The client reads this flag after sign-in and forces the
-- change-password flow before letting the user use the app.
-- Cleared (set false) by the change-password edge function once
-- the new password is saved.
-- ============================================================

alter table profiles
  add column if not exists must_change_password boolean not null default false;

-- Allow users to read this flag for themselves (the gate runs on
-- the client right after login). Existing select policies on
-- profiles already cover this — no new policy is required because
-- the column is part of the existing row the user can already read.
