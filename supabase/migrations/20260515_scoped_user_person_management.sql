-- ============================================================
-- Scoped-user person management: close two RLS gaps that
-- prevented Cluster Coordinators from deleting persons in their
-- cluster, and Activity Leads from adding a person to their own
-- activity.
--
-- Both gaps mismatched the canonical permissions table in
-- src/lib/permissions.ts:
--   - actionPermission('delete_person') → 'direct' for a CC on
--     a person in their cluster
--   - actionPermission('create_person') → 'direct' for an AL on
--     their own activity
--
-- Each new policy is additive (no existing policy modified) and
-- permissive. Postgres OR-combines permissive policies, so the
-- net effect is: admins keep every capability; CCs gain person
-- deletion within their cluster; ALs gain the nucleus_enrollment
-- write they need for the addPersonToActivity flow.
-- ============================================================


-- ─── 1. Cluster Coordinators delete persons in own cluster ────
-- The app hard-deletes persons (with ON DELETE CASCADE to
-- enrollments / participants / attendance / course enrollments,
-- per 20260504_fix_person_hard_delete). The existing
-- "Admins delete persons" policy keeps that capability admin-
-- only — but personDeletePermission(personId) already returns
-- 'direct' for a CC on a person in their cluster, surfacing a
-- Delete button that the DB silently rejected. This grants the
-- DB-level capability to match.
--
-- A CC qualifies if the target person has any nucleus enrollment
-- OR activity participation whose owning cluster matches one of
-- the caller's cluster_coordinator grants. Soft-deleted child
-- rows don't count.

create policy "Cluster coordinators delete persons in own cluster" on persons
  for delete using (
    exists (
      select 1 from nucleus_enrollments ne
      join nuclei n on n.id = ne.nucleus_id
      where ne.person_id = persons.id
        and ne.deleted_at is null
        and n.cluster_id = any(select coordinator_cluster_ids())
    )
    or exists (
      select 1 from activity_participants ap
      join activities a on a.id = ap.activity_id
      join nuclei n on n.id = a.nucleus_id
      where ap.person_id = persons.id
        and ap.deleted_at is null
        and n.cluster_id = any(select coordinator_cluster_ids())
    )
  );


-- ─── 2. Activity Leads enroll/re-enroll their activity's people
--        in the parent nucleus ─────────────────────────────────
-- addPersonToActivity auto-enrolls the new person in the parent
-- nucleus (via an upsert on nucleus_enrollments) so the data
-- model stays uniform — every activity participant is also a
-- nucleus member. The existing "Nucleus collaborators manage
-- enrollments" policy only allows is_admin / CC / NC, leaving an
-- AL adding a person to their own activity to fail on the
-- enrollment step.
--
-- INSERT covers the brand-new-enrollment case; UPDATE covers the
-- re-enroll case (upsert with deleted_at = null on a row whose
-- deleted_at was previously set). DELETE is intentionally NOT
-- granted — removing a person from a nucleus is a stronger
-- action than removing them from an activity, and remains with
-- CC / NC.

create policy "Activity leads enroll persons in own nucleus" on nucleus_enrollments
  for insert with check (
    exists (
      select 1 from user_permissions up
      join activities a on a.id = up.activity_id
      where up.user_id = auth.uid()
        and up.role = 'activity_lead'
        and a.nucleus_id = nucleus_enrollments.nucleus_id
        and a.deleted_at is null
    )
  );

create policy "Activity leads re-enroll persons in own nucleus" on nucleus_enrollments
  for update using (
    exists (
      select 1 from user_permissions up
      join activities a on a.id = up.activity_id
      where up.user_id = auth.uid()
        and up.role = 'activity_lead'
        and a.nucleus_id = nucleus_enrollments.nucleus_id
        and a.deleted_at is null
    )
  );
