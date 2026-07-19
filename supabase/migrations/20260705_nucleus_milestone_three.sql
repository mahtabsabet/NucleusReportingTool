-- ============================================================
-- Nucleus Milestone Three progress
--
-- Replaces the old, purely-derived established/growing/emerging
-- tiering of nuclei (which lived only in the cluster "network"
-- view and had no stored data behind it) with an explicit,
-- collaborator-entered measure of how far a nucleus has developed
-- the features that characterise a Milestone Three cluster.
--
-- Data is entered on each nucleus's own page: a 0–10 slider per
-- feature, optionally annotated. The cluster-level "progress &
-- connections" view then positions each nucleus along a continuous
-- progress axis, computed as the average of its feature scores.
--
--   nucleus_milestone_three_scores  — one row per (nucleus, feature)
--   nucleus_milestone_three         — one row per nucleus, holding
--                                     the holistic overall note
--
-- The canonical list of feature_keys lives in the app
-- (src/lib/milestoneThree.ts); the DB stores whatever keys the app
-- writes so wording/label changes never require a migration.
-- ============================================================


-- ─── Tables ──────────────────────────────────────────────────

create table if not exists nucleus_milestone_three_scores (
  nucleus_id  uuid not null references nuclei(id) on delete cascade,
  feature_key text not null,
  score       smallint not null check (score between 0 and 10),
  note        text,
  updated_by  uuid references profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (nucleus_id, feature_key)
);

create index if not exists nucleus_milestone_three_scores_nucleus_idx
  on nucleus_milestone_three_scores (nucleus_id);

-- One holistic note per nucleus — the "assessed holistically" layer
-- that sits alongside the per-feature detail.
create table if not exists nucleus_milestone_three (
  nucleus_id   uuid primary key references nuclei(id) on delete cascade,
  overall_note text,
  updated_by   uuid references profiles(id) on delete set null,
  updated_at   timestamptz not null default now()
);


-- ─── RLS ─────────────────────────────────────────────────────

alter table nucleus_milestone_three_scores enable row level security;
alter table nucleus_milestone_three        enable row level security;

-- Read: anyone who can see the nucleus (admins, regional viewers via
-- nucleus access, and users scoped anywhere inside it).
create policy "Read milestone-three scores in accessible nuclei"
  on nucleus_milestone_three_scores
  for select using (is_admin() or user_has_nucleus_access(nucleus_id));

-- Write: whoever may edit the nucleus's concentric circles — cluster
-- coordinators, nucleus collaborators, and activity leads with access
-- to this nucleus. Same gate the circle-movement UI uses. `for all`
-- covers the upsert (insert + update) the editor performs, plus the
-- delete when a score is cleared.
create policy "Nucleus editors manage milestone-three scores"
  on nucleus_milestone_three_scores
  for all using (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator', 'activity_lead')
        and (
          up.nucleus_id = nucleus_milestone_three_scores.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = nucleus_milestone_three_scores.nucleus_id)
          or up.activity_id in (select id from activities where nucleus_id = nucleus_milestone_three_scores.nucleus_id)
        )
    )
  ) with check (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator', 'activity_lead')
        and (
          up.nucleus_id = nucleus_milestone_three_scores.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = nucleus_milestone_three_scores.nucleus_id)
          or up.activity_id in (select id from activities where nucleus_id = nucleus_milestone_three_scores.nucleus_id)
        )
    )
  );

create policy "Read milestone-three note in accessible nuclei"
  on nucleus_milestone_three
  for select using (is_admin() or user_has_nucleus_access(nucleus_id));

create policy "Nucleus editors manage milestone-three note"
  on nucleus_milestone_three
  for all using (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator', 'activity_lead')
        and (
          up.nucleus_id = nucleus_milestone_three.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = nucleus_milestone_three.nucleus_id)
          or up.activity_id in (select id from activities where nucleus_id = nucleus_milestone_three.nucleus_id)
        )
    )
  ) with check (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator', 'activity_lead')
        and (
          up.nucleus_id = nucleus_milestone_three.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = nucleus_milestone_three.nucleus_id)
          or up.activity_id in (select id from activities where nucleus_id = nucleus_milestone_three.nucleus_id)
        )
    )
  );
