-- ============================================================
-- Regional Viewer read access for course unit enrollments.
--
-- Companion to 20260514_regional_viewer_timeline_read.sql.
--
-- course_unit_enrollments was (re)created in
-- 20260514_curriculum_expansion.sql with a scope-gated read policy
-- and no is_regional_viewer() branch, so unit-level course
-- completion was invisible to Regional Viewers — even though the
-- person- and course-level data already is (course_enrollments got
-- its regional read policy back in 20260507).
--
-- SELECT only; no write policy references is_regional_viewer(), so
-- Regional Viewers can see unit completion but not edit it.
-- ============================================================

create policy "Regional viewers read course unit enrollments" on course_unit_enrollments
  for select using (is_regional_viewer());
