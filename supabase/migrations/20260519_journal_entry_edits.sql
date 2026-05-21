-- ============================================================
-- Reflective Learning System: allow correcting and re-tagging
-- existing entries.
--
-- The original migration deliberately omitted UPDATE/DELETE
-- policies on journal_entries and a DELETE policy on
-- journal_entry_themes, making both surfaces append-only. In
-- practice users need to:
--   • Tag an old entry with a theme that didn't exist when the
--     entry was written.
--   • Untag an entry (mistake correction).
--   • Edit an entry's text to fix a typo or factual error.
--
-- The UI gates editing behind a confirmation step so accidental
-- overwrites are unlikely; this migration unblocks the DB side.
-- An edited_at / edited_by pair is added so the trail of who
-- touched an entry last is preserved even though we don't keep
-- a full revision history.
-- ============================================================

alter table journal_entries add column edited_at timestamptz;
alter table journal_entries add column edited_by uuid
  references profiles(id) on delete set null;

-- UPDATE on journal_entries:
--   • the original author of the entry, OR
--   • anyone with activity-scope access (for activity entries), OR
--   • CC/NC on the parent nucleus (for nucleus entries).
create policy "Edit own entries or as curator" on journal_entries
  for update using (
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

-- DELETE on journal_entry_themes: same scope as the existing
-- INSERT policy, so anyone who could tag the entry can also
-- remove a tag from it.
create policy "Untag own entries" on journal_entry_themes
  for delete using (
    is_admin() or exists (
      select 1 from journal_entries e
      where e.id = journal_entry_themes.entry_id
        and (
          (e.source = 'activity' and e.activity_id is not null and user_has_activity_access(e.activity_id))
          or (e.source = 'nucleus' and exists (
            select 1 from user_permissions up
            where up.user_id = auth.uid()
              and up.role in ('cluster_coordinator', 'nucleus_collaborator')
              and (
                up.nucleus_id = e.nucleus_id
                or up.cluster_id = (select cluster_id from nuclei where id = e.nucleus_id)
              )
          ))
        )
    )
  );
