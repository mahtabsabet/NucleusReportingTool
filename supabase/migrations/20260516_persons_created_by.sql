-- ============================================================
-- persons.created_by: track who created each person record so the
-- inserter can read their own row back via RLS, eliminating the
-- need for the client-UUID workaround in addPersonToActivity.
--
-- The persons SELECT policy requires the person be enrolled in a
-- nucleus / activity the caller can access — but a brand-new
-- person has no enrollments yet. PR #57 worked around this for
-- non-admin callers (CC / NC / AL) by generating the id client-
-- side and skipping the post-insert .select() chain. With
-- created_by, the read-back works for everyone and the workaround
-- can be reverted.
--
-- created_by defaults to auth.uid() so callers don't have to set
-- it explicitly. The INSERT policy tightens to require
-- created_by = auth.uid(), closing the original divergence #5
-- hole: previously the INSERT policy only checked "caller has any
-- scoped role" with no scope or identity tie-in, so a crafted
-- direct API call could insert a person record disconnected from
-- anything in the caller's scope.
--
-- Existing rows have created_by = NULL (the new column is
-- defaulted, not backfilled). They remain readable through the
-- enrollment / participation branches of the SELECT policy.
-- ============================================================

alter table persons
  add column if not exists created_by uuid references auth.users(id) default auth.uid();


-- ─── Tightened INSERT ─────────────────────────────────────────
-- Replace the old "any scoped role" gate with one that also
-- requires created_by = auth.uid(). The column DEFAULT supplies
-- this for normal clients (no behavior change for the app); the
-- WITH CHECK rejects callers who try to impersonate someone else
-- by passing an explicit created_by.
drop policy if exists "Activity leads and above create persons" on persons;
create policy "Scoped users create persons as themselves" on persons
  for insert with check (
    created_by = auth.uid()
    and (
      is_admin() or exists (
        select 1 from user_permissions
        where user_id = auth.uid()
          and role in ('cluster_coordinator', 'nucleus_collaborator', 'activity_lead')
      )
    )
  );


-- ─── Broadened SELECT ─────────────────────────────────────────
-- Add a "you created this row" branch so the chained .select()
-- after .insert() works for non-admin callers. Other branches
-- (enrollment / participation / admin) are unchanged.
drop policy if exists "Read persons in scope" on persons;
create policy "Read persons in scope" on persons
  for select using (
    deleted_at is null and (
      is_admin()
      or created_by = auth.uid()
      or exists (
        select 1 from nucleus_enrollments ne
        where ne.person_id = persons.id
          and ne.deleted_at is null
          and user_has_nucleus_access(ne.nucleus_id)
      )
      or exists (
        select 1 from activity_participants ap
        where ap.person_id = persons.id
          and ap.deleted_at is null
          and user_has_activity_access(ap.activity_id)
      )
    )
  );
