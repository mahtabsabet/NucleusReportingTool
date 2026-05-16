-- ============================================================
-- Activity leads: allow UPDATE on their own activity row.
--
-- Symptom: when an Activity Lead saved schedule / notes changes
-- via the ActivityDetail page, the supabase call:
--   .from('activities').update(...).eq('id', ...).select(...).single()
-- threw "Cannot coerce the result to a single JSON object". The
-- UPDATE matched zero rows because the only existing write policy
-- on `activities` ("Nucleus collaborators manage activities")
-- requires the caller to hold a cluster_coordinator or
-- nucleus_collaborator grant for the activity's cluster / nucleus.
-- The chained .select().single() then errored on the empty result.
--
-- This adds an AL-scoped UPDATE policy so an AL can save changes
-- to their own activity. The matching app helper (actionPermission
-- 'edit_person' / activity editing) and the UI already assume this
-- works; until now only the RLS layer was missing.
--
-- Scope: the policy matches only rows where the caller has an
-- `activity_lead` grant on that exact activity_id. Column-level
-- restriction (e.g. preventing an AL from renaming the activity
-- or moving it to another nucleus) is intentionally not enforced
-- here — the UI doesn't expose those affordances to AL, and that
-- is the same posture taken for CC/NC by the existing policy.
-- ============================================================

drop policy if exists "Activity leads update own activity" on activities;
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
