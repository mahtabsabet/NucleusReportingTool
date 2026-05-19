-- ============================================================
-- Cluster Learning Hub
--
-- Adds a cluster-level synthesis layer on top of the existing
-- nucleus journals. Themes ("Objects of Learning") are now
-- deduplicated at the cluster level: every nucleus theme links
-- to a canonical `cluster_themes` row, so a theme like
-- "Sustaining Youth Participation" appearing in multiple nuclei
-- shows up once in the Hub with all contributing nuclei counted.
--
-- The auto-link happens via a SECURITY DEFINER trigger on
-- `learning_themes` so even activity-lead users (who can't
-- otherwise touch the cluster table) get their nucleus themes
-- attached to a cluster theme. The trigger creates a new
-- `cluster_themes` row the first time a name appears in the
-- cluster and just links to the existing row thereafter.
--
-- `journal_entries` is extended to host a third source —
-- 'cluster' — for the synthesis notes a cluster coordinator
-- writes against a cluster theme. A check constraint enforces
-- the source/scope invariants.
-- ============================================================


-- ─── Tables ─────────────────────────────────────────────────

create table cluster_themes (
  id                  uuid primary key default gen_random_uuid(),
  cluster_id          uuid not null references clusters(id) on delete cascade,
  name                text not null,
  description         text,
  color               text not null default 'amber',
  -- 0 = barely emerging; 100 = consolidated. Set by the cluster
  -- coordinator's judgement on the slider in the Hub's left column.
  consolidation_level int not null default 25
                      check (consolidation_level between 0 and 100),
  created_at          timestamptz not null default now(),
  created_by          uuid references profiles(id) on delete set null,
  archived_at         timestamptz,
  unique (cluster_id, name)
);

alter table learning_themes
  add column cluster_theme_id uuid references cluster_themes(id) on delete set null;

-- ─── Extend journal_entries to host cluster synthesis entries ─

alter table journal_entries alter column nucleus_id drop not null;

alter table journal_entries
  add column cluster_id        uuid references clusters(id) on delete cascade;
alter table journal_entries
  add column cluster_theme_id  uuid references cluster_themes(id) on delete set null;

alter table journal_entries drop constraint if exists journal_entries_source_check;
alter table journal_entries
  add constraint journal_entries_source_check
  check (source in ('activity', 'nucleus', 'cluster'));

alter table journal_entries drop constraint if exists activity_entry_has_activity;
alter table journal_entries
  add constraint source_scope_invariant check (
    (source = 'activity' and activity_id is not null and nucleus_id is not null and cluster_id is null)
    or (source = 'nucleus' and nucleus_id is not null and activity_id is null and cluster_id is null)
    or (source = 'cluster' and cluster_id is not null and nucleus_id is null and activity_id is null)
  );


-- ─── Indexes ────────────────────────────────────────────────

create index on cluster_themes (cluster_id, archived_at);
create index on journal_entries (cluster_id, occurred_at desc) where cluster_id is not null;
create index on journal_entries (cluster_theme_id) where cluster_theme_id is not null;
create index on learning_themes (cluster_theme_id) where cluster_theme_id is not null;


-- ─── Auto-link trigger ─────────────────────────────────────
-- SECURITY DEFINER so the function can insert into cluster_themes
-- regardless of the caller's role. This is how an activity-lead's
-- newly proposed nucleus theme ends up wired into the right
-- cluster theme without needing direct cluster_themes write access.

create or replace function ensure_cluster_theme_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c_id  uuid;
  ct_id uuid;
begin
  if new.cluster_theme_id is not null then
    return new;
  end if;
  select cluster_id into c_id from nuclei where id = new.nucleus_id;
  if c_id is null then
    return new;
  end if;
  select id into ct_id
    from cluster_themes
    where cluster_id = c_id and lower(name) = lower(new.name)
    limit 1;
  if ct_id is null then
    insert into cluster_themes (cluster_id, name, color, description, created_by)
      values (c_id, new.name, coalesce(new.color, 'amber'), new.description, new.proposed_by)
      returning id into ct_id;
  end if;
  new.cluster_theme_id := ct_id;
  return new;
end;
$$;

create trigger ensure_cluster_theme_link_trigger
  before insert on learning_themes
  for each row execute function ensure_cluster_theme_link();


-- ─── RLS: cluster_themes ────────────────────────────────────

alter table cluster_themes enable row level security;

create policy "Read cluster themes" on cluster_themes
  for select using (is_admin() or user_has_cluster_access(cluster_id));

create policy "Cluster coordinators manage cluster themes" on cluster_themes
  for all using (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role = 'cluster_coordinator'
        and up.cluster_id = cluster_themes.cluster_id
    )
  );


-- ─── RLS: journal_entries cluster source ───────────────────

-- The existing "Read entries in accessible nuclei" policy uses
-- nucleus_id, which is null for cluster entries; add a parallel
-- read policy keyed on cluster_id so cluster synthesis is
-- readable to anyone who can see the cluster.
create policy "Read cluster entries in accessible clusters" on journal_entries
  for select using (
    source = 'cluster'
    and cluster_id is not null
    and (is_admin() or user_has_cluster_access(cluster_id))
  );

-- Only CC + admins write cluster synthesis.
create policy "Write cluster synthesis entries" on journal_entries
  for insert with check (
    source = 'cluster'
    and cluster_id is not null
    and (
      is_admin() or exists (
        select 1 from user_permissions up
        where up.user_id = auth.uid()
          and up.role = 'cluster_coordinator'
          and up.cluster_id = journal_entries.cluster_id
      )
    )
  );

-- Drop the previous UPDATE policy and recreate with the cluster
-- branch added.
drop policy if exists "Edit own entries or as curator" on journal_entries;
create policy "Edit own entries or as curator" on journal_entries
  for update using (
    is_admin()
    or author_id = auth.uid()
    or (source = 'activity' and activity_id is not null and user_has_activity_access(activity_id))
    or (source = 'nucleus' and nucleus_id is not null and exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role in ('cluster_coordinator', 'nucleus_collaborator')
        and (
          up.nucleus_id = journal_entries.nucleus_id
          or up.cluster_id = (select cluster_id from nuclei where id = journal_entries.nucleus_id)
        )
    ))
    or (source = 'cluster' and cluster_id is not null and exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and up.role = 'cluster_coordinator'
        and up.cluster_id = journal_entries.cluster_id
    ))
  );


-- ─── Back-fill ──────────────────────────────────────────────
-- Build a cluster_themes row for every (cluster, theme-name)
-- combination that exists today, then link each existing
-- learning_themes row to its match.

insert into cluster_themes (cluster_id, name, color, description, created_by)
select distinct on (n.cluster_id, lower(lt.name))
  n.cluster_id,
  lt.name,
  coalesce(lt.color, 'amber'),
  lt.description,
  lt.proposed_by
from learning_themes lt
join nuclei n on n.id = lt.nucleus_id
order by n.cluster_id, lower(lt.name), lt.proposed_at;

update learning_themes lt
set cluster_theme_id = ct.id
from cluster_themes ct, nuclei n
where n.id = lt.nucleus_id
  and ct.cluster_id = n.cluster_id
  and lower(ct.name) = lower(lt.name)
  and lt.cluster_theme_id is null;
