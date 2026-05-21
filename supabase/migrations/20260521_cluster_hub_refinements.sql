-- ============================================================
-- Cluster Learning Hub — round 2 refinements
--
--  • learning_themes.pushed_from_cluster: marks a nucleus theme
--    that was pushed down from the cluster Hub. These can't be
--    archived at the nucleus level (the cluster owns them).
--  • cluster_themes.merged_into_id: lets a cluster coordinator
--    merge two Objects of Learning, archiving the source and
--    pointing it at the survivor.
--  • journal_entries.cluster_archive_notice_for: tags the
--    system note posted to nuclei when a cluster theme is archived,
--    so the note can be withdrawn if the theme is un-archived.
--
-- Idempotent (safe to re-run): uses IF NOT EXISTS / drop-before-
-- create so partial prior application doesn't error.
-- ============================================================

alter table learning_themes
  add column if not exists pushed_from_cluster boolean not null default false;

alter table cluster_themes
  add column if not exists merged_into_id uuid references cluster_themes(id) on delete set null;

alter table journal_entries
  add column if not exists cluster_archive_notice_for uuid
    references cluster_themes(id) on delete set null;

-- ── Merge needs to DELETE duplicate nucleus-level theme copies ──
-- A cluster-level merge re-points each nucleus's local copy of the
-- source theme onto the survivor. Where a nucleus already had both,
-- the duplicate must be deleted. learning_themes had no DELETE
-- policy, so those deletes were silently denied by RLS and the old
-- theme lingered at the nucleus level. Mirror the curate (UPDATE)
-- policy for DELETE.
drop policy if exists "Nucleus collaborators delete themes" on learning_themes;
create policy "Nucleus collaborators delete themes" on learning_themes
  for delete using (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator')
        and (
          up.nucleus_id = learning_themes.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = learning_themes.nucleus_id)
        )
    )
  );

-- ── Withdraw archive notices on un-archive ──────────────────────
-- Journal entries are otherwise append-only; this DELETE policy is
-- deliberately narrow — it only permits removing the cluster's own
-- archive-notice entries, and only by a coordinator of that cluster.
drop policy if exists "Cluster coordinators withdraw archive notices" on journal_entries;
create policy "Cluster coordinators withdraw archive notices" on journal_entries
  for delete using (
    cluster_archive_notice_for is not null
    and (
      is_admin() or exists (
        select 1 from user_permissions up
        where up.user_id = auth.uid()
          and up.role = 'cluster_coordinator'
          and up.cluster_id = (select cluster_id from nuclei where id = journal_entries.nucleus_id)
      )
    )
  );
