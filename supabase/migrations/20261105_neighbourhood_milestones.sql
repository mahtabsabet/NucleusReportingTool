-- ============================================================
-- Neighbourhood milestones — a manual, per-neighbourhood milestone
-- (1, 2 or 3) shown as a translucent tint on the neighbourhood
-- overlay of the cluster and household maps.
--
-- Neighbourhood shapes are a static file in the app
-- (public/data/calgary-communities.geojson); a row here only records
-- the milestone a cluster has set for one of them, keyed by the
-- City of Calgary community code. No row = no milestone.
--
-- Anyone who can see the cluster can read its milestones; cluster
-- coordinators of that cluster (and admins) set them. Milestones are
-- set by hand for now — they are not derived from nucleus/activity
-- data.
-- ============================================================

create table if not exists neighbourhood_milestones (
  cluster_id         uuid not null references clusters(id) on delete cascade,
  neighbourhood_code text not null,
  milestone          smallint not null check (milestone between 1 and 3),
  updated_by         uuid references profiles(id) on delete set null default auth.uid(),
  updated_at         timestamptz not null default now(),
  primary key (cluster_id, neighbourhood_code)
);

alter table neighbourhood_milestones enable row level security;

drop policy if exists "Read neighbourhood milestones in accessible clusters" on neighbourhood_milestones;
create policy "Read neighbourhood milestones in accessible clusters" on neighbourhood_milestones
  for select using (
    is_admin() or is_regional_viewer() or user_has_cluster_access(cluster_id)
  );

drop policy if exists "Cluster coordinators set neighbourhood milestones" on neighbourhood_milestones;
create policy "Cluster coordinators set neighbourhood milestones" on neighbourhood_milestones
  for all using (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role = 'cluster_coordinator'
        and up.cluster_id = neighbourhood_milestones.cluster_id
    )
  );

grant select, insert, update, delete on neighbourhood_milestones to authenticated;
