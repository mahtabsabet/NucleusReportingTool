-- ============================================================
-- Activity Notebook: allow deleting an entire entry
--
-- journal_entries was append-only by design (no DELETE policy).
-- Product now wants a leader to remove an entry outright — e.g.
-- one logged against the wrong activity, or a duplicate — behind
-- a confirmation step in the UI.
--
-- DELETE scope mirrors the existing "Edit own entries or as
-- curator" UPDATE policy: the original author, anyone with
-- activity-scope access (for activity entries), or CC/NC on the
-- parent nucleus (for nucleus entries). Cluster synthesis entries
-- keep their own archive flow and are intentionally excluded.
--
-- journal_entry_themes and journal_entry_attendance both reference
-- journal_entries with ON DELETE CASCADE, so their rows are
-- removed automatically.
-- ============================================================

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
  );
