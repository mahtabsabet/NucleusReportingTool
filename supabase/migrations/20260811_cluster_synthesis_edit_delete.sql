-- ============================================================
-- Cluster synthesis reflections: allow delete
--
-- The cluster-level "Cluster synthesis" panel already allows
-- creating and reading reflections (source = 'cluster' journal
-- entries), and the "Edit own entries or as curator" UPDATE
-- policy (see 20260520_cluster_learning_hub.sql) already covers
-- them — cluster coordinators (and admins) on the entry's
-- cluster can update. The DELETE policy added in
-- 20260601_journal_entry_delete.sql intentionally excluded
-- cluster entries ("Cluster synthesis entries keep their own
-- archive flow"). Product now wants reflections deletable (with
-- confirmation) the same way activity/nucleus entries are, so
-- this adds the matching cluster branch to the DELETE policy.
-- ============================================================

drop policy if exists "Delete own entries or as curator" on journal_entries;
create policy "Delete own entries or as curator" on journal_entries
  for delete using (
    is_admin()
    or author_id = auth.uid()
    or (source = 'activity' and activity_id is not null and user_has_activity_access(activity_id))
    or (source = 'nucleus' and exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator')
        and (
          up.nucleus_id = journal_entries.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = journal_entries.nucleus_id)
        )
    ))
    or (source = 'cluster' and cluster_id is not null and exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role = 'cluster_coordinator'
        and up.cluster_id = journal_entries.cluster_id
    ))
  );
