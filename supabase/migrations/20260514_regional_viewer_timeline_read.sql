-- ============================================================
-- Regional Viewer read access for Timeline data.
--
-- The blanket "Regional viewers read everything" policies added in
-- 20260507 predate the Timeline feature (shipped in 20260511 and
-- 20260512). Regional Viewers therefore fall through to the base
-- timeline policies, which gate on user_has_cluster_access() /
-- user_has_nucleus_access() — and a pure Regional Viewer holds no
-- user_permissions rows, so those return false. The practical
-- effect was that cluster-/nucleus-scoped timeline cycles, events,
-- and notes were invisible to Regional Viewers.
--
-- This migration extends the same read-only pattern to the timeline
-- tables. Edits stay blocked: no INSERT/UPDATE/DELETE policy
-- references is_regional_viewer(), and these policies are SELECT
-- only. Postgres OR-combines permissive policies, so this purely
-- widens read access.
-- ============================================================

create policy "Regional viewers read timeline cycles" on timeline_cycles
  for select using (is_regional_viewer());

create policy "Regional viewers read timeline events" on timeline_events
  for select using (is_regional_viewer());

create policy "Regional viewers read timeline notes" on timeline_item_notes
  for select using (is_regional_viewer());

-- Document attachments for 'document'-kind notes live in the private
-- 'timeline-attachments' storage bucket. Without this a Regional
-- Viewer could read a note row but not fetch the file it points to.
create policy "Regional viewers read timeline attachments"
  on storage.objects
  for select
  using (
    bucket_id = 'timeline-attachments'
    and is_regional_viewer()
  );
