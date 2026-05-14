-- ============================================================
-- Duplicate-name handling redesign + richer age model.
--
-- Identity is `persons.id` — names are labels, not identifiers.
-- Adds two structured fields used for contextual disambiguation
-- in the UI:
--   - age_group     : 'child' | 'junior_youth' | 'youth'
--                     | 'adult' | 'unknown'
--   - profile_status: 'provisional' | 'confirmed'
--
-- The legacy `is_minor` boolean stays on the row but its allowed
-- combinations with age_group are now constrained:
--   child / junior_youth → is_minor must be true
--   adult                → is_minor must be false
--   youth / unknown      → is_minor is user-settable
--
-- Note: there is intentionally NO unique constraint on (name) /
-- lower(name) anywhere — two people may share a name. The UI
-- disambiguates by context (nucleus, activity, age group, etc.).
-- ============================================================

alter table persons
  add column if not exists age_group       text not null default 'unknown',
  add column if not exists profile_status  text not null default 'provisional';

alter table persons
  drop constraint if exists persons_age_group_check;
alter table persons
  add constraint persons_age_group_check
  check (age_group in ('child', 'junior_youth', 'youth', 'adult', 'unknown'));

alter table persons
  drop constraint if exists persons_profile_status_check;
alter table persons
  add constraint persons_profile_status_check
  check (profile_status in ('provisional', 'confirmed'));

-- Backfill: every existing row has is_minor = false today. Mark them
-- as adults unless they were explicitly flagged as minors (in which
-- case we don't know the cohort and use 'unknown').
update persons
   set age_group = case
     when is_minor then 'unknown'
     else 'adult'
   end
 where age_group = 'unknown';

-- Backfill: anything already attached to a nucleus or activity is
-- treated as a confirmed profile. Profiles with no attachments stay
-- provisional — they are exactly the "first-name-only, no context"
-- records the new design wants to mark as such.
update persons p
   set profile_status = 'confirmed'
 where profile_status = 'provisional'
   and (
     exists (
       select 1 from nucleus_enrollments ne
       where ne.person_id = p.id and ne.deleted_at is null
     )
     or exists (
       select 1 from activity_participants ap
       where ap.person_id = p.id and ap.deleted_at is null
     )
   );

-- Lock the age_group ↔ is_minor invariants at the DB level.
alter table persons
  drop constraint if exists persons_age_minor_invariant;
alter table persons
  add constraint persons_age_minor_invariant check (
    (age_group in ('child', 'junior_youth') and is_minor = true)
    or (age_group = 'adult' and is_minor = false)
    or age_group in ('youth', 'unknown')
  );
