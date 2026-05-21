-- ============================================================
-- Cluster Learning Hub — round 2 refinements
--
--  • learning_themes.pushed_from_cluster: marks a nucleus theme
--    that was pushed down from the cluster Hub. These can't be
--    archived at the nucleus level (the cluster owns them).
--  • cluster_themes.merged_into_id: lets a cluster coordinator
--    merge two Objects of Learning, archiving the source and
--    pointing it at the survivor.
-- ============================================================

alter table learning_themes
  add column pushed_from_cluster boolean not null default false;

alter table cluster_themes
  add column merged_into_id uuid references cluster_themes(id) on delete set null;

-- Allow CC + admins to UPDATE nucleus learning_themes that belong
-- to a nucleus in their cluster — needed so a cluster-level merge
-- can rename the nucleus-level copies to the unified name. The
-- existing "Nucleus collaborators curate themes" policy already
-- covers CC for the cluster, so this is a no-op confirmation that
-- the merge path is permitted; documented here for clarity.
