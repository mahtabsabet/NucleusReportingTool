-- ============================================================
-- Cluster Coordinators can manage their own cluster's cycles.
--
-- timeline_cycles is the only timeline table that hadn't been
-- extended to Cluster Coordinators yet — timeline_events,
-- timeline_item_notes, and the timeline-attachments storage bucket
-- already let CCs write within their cluster. This closes that
-- gap so a Cluster Coordinator can edit cycle boundaries for
-- their cluster.
--
-- The existing "Admins manage timeline cycles" policy is left
-- alone; this is an additive permissive policy. Postgres
-- OR-combines permissive policies, so the net effect is: admins
-- keep managing everything; CCs gain write access to their
-- assigned cluster's rows; no one else changes.
-- ============================================================

create policy "Cluster coordinators manage own cluster cycles" on timeline_cycles
  for all using (
    cluster_id is not null and exists (
      select 1 from user_permissions
      where user_id = auth.uid()
        and role = 'cluster_coordinator'
        and cluster_id = timeline_cycles.cluster_id
    )
  );
