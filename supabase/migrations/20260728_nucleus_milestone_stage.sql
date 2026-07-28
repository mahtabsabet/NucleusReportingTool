-- ============================================================
-- Nucleus Milestone stage (generalizes Milestone Three)
--
-- "Milestone Three" on the nucleus dashboard generalizes into a
-- "Milestone" interface: every nucleus is assigned a milestone
-- stage (0-3). Stages 0-2 are plain descriptors with no further
-- detail to record. Stage 3 keeps the existing per-feature sliders
-- (nucleus_milestone_three_scores / nucleus_milestone_three) — that
-- data is never deleted on downgrade, so a nucleus that moves back
-- to Milestone 3 later sees its previous scores reappear.
--
-- Also fixes a permission drift: the write policies on the
-- milestone-three tables granted 'activity_lead', but the app's own
-- actionPermission() rule for 'edit_concentric_circles' (the gate
-- these policies were meant to mirror) has always forbidden Activity
-- Leads. Milestone editing — including the new stage — is Nucleus
-- Collaborator / Cluster Coordinator (and Admin/Super Admin) only.
-- ============================================================


-- ─── Table ───────────────────────────────────────────────────

create table if not exists nucleus_milestone_stage (
  nucleus_id  uuid primary key references nuclei(id) on delete cascade,
  stage       smallint not null default 0 check (stage between 0 and 3),
  updated_by  uuid references profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- Backfill: nuclei that already have milestone-three data recorded
-- were, in effect, being assessed as Milestone Three — carry that
-- forward so existing sliders keep showing on the dashboard.
insert into nucleus_milestone_stage (nucleus_id, stage)
select distinct nucleus_id, 3
from (
  select nucleus_id from nucleus_milestone_three_scores
  union
  select nucleus_id from nucleus_milestone_three
) existing
on conflict (nucleus_id) do nothing;


-- ─── RLS ─────────────────────────────────────────────────────

alter table nucleus_milestone_stage enable row level security;

create policy "Read milestone stage in accessible nuclei"
  on nucleus_milestone_stage
  for select using (is_admin() or user_has_nucleus_access(nucleus_id));

-- Write: cluster coordinators and nucleus collaborators only —
-- Activity Leads cannot change a nucleus's milestone stage.
create policy "Nucleus editors manage milestone stage"
  on nucleus_milestone_stage
  for all using (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator')
        and (
          up.nucleus_id = nucleus_milestone_stage.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = nucleus_milestone_stage.nucleus_id)
        )
    )
  ) with check (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator')
        and (
          up.nucleus_id = nucleus_milestone_stage.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = nucleus_milestone_stage.nucleus_id)
        )
    )
  );


-- ─── Permission fix: milestone-three tables ─────────────────
-- Drop Activity Lead from the write policies so they match the app's
-- edit_concentric_circles rule (cluster coordinators and nucleus
-- collaborators only).

alter policy "Nucleus editors manage milestone-three scores"
  on nucleus_milestone_three_scores
  using (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator')
        and (
          up.nucleus_id = nucleus_milestone_three_scores.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = nucleus_milestone_three_scores.nucleus_id)
        )
    )
  ) with check (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator')
        and (
          up.nucleus_id = nucleus_milestone_three_scores.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = nucleus_milestone_three_scores.nucleus_id)
        )
    )
  );

alter policy "Nucleus editors manage milestone-three note"
  on nucleus_milestone_three
  using (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator')
        and (
          up.nucleus_id = nucleus_milestone_three.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = nucleus_milestone_three.nucleus_id)
        )
    )
  ) with check (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator')
        and (
          up.nucleus_id = nucleus_milestone_three.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = nucleus_milestone_three.nucleus_id)
        )
    )
  );
