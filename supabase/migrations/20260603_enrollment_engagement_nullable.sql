-- ============================================================
-- Allow nucleus_enrollments.engagement_level to be NULL.
--
-- The live database created this column NOT NULL (with a default),
-- which is drift from schema.sql, where it has always been nullable.
--
-- A NULL engagement_level is exactly how the concentric-circles view
-- represents an "unassigned" member (ConcentricCircles.tsx buckets
-- `engagement_level === null` into the unplaced section). People added
-- to a nucleus directly from the cluster People page should start
-- unassigned — not pre-placed in the outer "aware" ring — so they need
-- to be able to store NULL.
--
-- Drop the NOT NULL constraint so NULL is allowed again. Any column
-- DEFAULT is intentionally left untouched: the activity-driven
-- enrollment flow (which omits engagement_level) keeps its current
-- behavior, while the People page sets engagement_level = NULL
-- explicitly to land people in the unassigned bucket.
-- ============================================================

alter table nucleus_enrollments
  alter column engagement_level drop not null;
