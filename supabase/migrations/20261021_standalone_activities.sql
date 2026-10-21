-- ============================================================
-- Standalone activities — activities that live in a cluster but
-- are not (yet) part of a nucleus.
--
-- Until now every activity hung off a nucleus: activities had no
-- cluster or map position of their own, and every access check
-- reached the cluster by joining activities → nuclei. A devotional
-- or JY group often starts before anyone has a nucleus around it,
-- so this migration lets an activity exist on its own:
--
--   • activities.cluster_id  — the activity's own cluster. Always
--     set. For nucleus activities a trigger keeps it equal to the
--     nucleus's cluster, so older callers that only send
--     nucleus_id keep working unchanged.
--   • activities.lat / lng   — map position for standalone
--     activities (nucleus activities inherit the nucleus marker).
--   • activities.nucleus_id  — now nullable.
--
-- Access helpers and policies that joined through nuclei to find
-- the cluster now read activities.cluster_id directly, so a
-- standalone activity is visible to the same people a nucleus
-- activity in that cluster would be (CC, LSA, regional viewer,
-- admins, and its own activity lead). Nucleus collaborators only
-- see it once it is attached to their nucleus.
--
-- attach_activity_to_nucleus() moves a standalone activity into a
-- nucleus atomically: re-points the activity, its notebook entries
-- and its timeline row, and enrolls its roster in the nucleus.
-- ============================================================


-- ─── 0. Event type ───────────────────────────────────────────

alter type event_log_type_enum add value if not exists 'activity_attached_to_nucleus';


-- ─── 1. Columns ──────────────────────────────────────────────

alter table activities add column if not exists cluster_id uuid references clusters(id);
alter table activities add column if not exists lat double precision;
alter table activities add column if not exists lng double precision;

update activities a
  set cluster_id = n.cluster_id
  from nuclei n
  where n.id = a.nucleus_id
    and a.cluster_id is null;

alter table activities alter column cluster_id set not null;
alter table activities alter column nucleus_id drop not null;

create index if not exists activities_cluster_id_idx on activities(cluster_id);


-- ─── 2. Keep cluster_id in step with the nucleus ─────────────
-- Runs before RLS WITH CHECK is evaluated, so policies can rely on
-- cluster_id being correct for nucleus activities.

create or replace function activities_sync_cluster_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nucleus_id is not null then
    select cluster_id into new.cluster_id from nuclei where id = new.nucleus_id;
  end if;
  return new;
end;
$$;

drop trigger if exists activities_sync_cluster_id_trigger on activities;
create trigger activities_sync_cluster_id_trigger
  before insert or update of nucleus_id, cluster_id on activities
  for each row execute function activities_sync_cluster_id();


-- ─── 3. Access helpers ───────────────────────────────────────

create or replace function user_has_cluster_access(cid uuid)
returns boolean as $$
  select exists (
    select 1 from user_permissions up
    where up.user_id = auth.uid() and (
      up.cluster_id = cid
      or up.nucleus_id in (select id from nuclei where cluster_id = cid)
      or up.activity_id in (select id from activities where cluster_id = cid)
    )
  );
$$ language sql security definer stable;

create or replace function user_has_activity_access(aid uuid)
returns boolean as $$
  select exists (
    select 1 from user_permissions up
    where up.user_id = auth.uid() and (
      up.activity_id = aid
      or up.nucleus_id = (select nucleus_id from activities where id = aid)
      or up.cluster_id = (select cluster_id from activities where id = aid)
    )
  );
$$ language sql security definer stable;

create or replace function activities_in_coordinator_clusters()
returns setof uuid language sql security definer stable as $$
  select a.id from activities a
  where a.cluster_id = any(
    select cluster_id from user_permissions
    where user_id = auth.uid() and role = 'cluster_coordinator' and cluster_id is not null
  )
$$;

create or replace function activities_in_lsa_clusters()
returns setof uuid language sql security definer stable as $$
  select a.id from activities a
  where a.cluster_id = any(
    select cluster_id from user_permissions
    where user_id = auth.uid()
      and role = 'lsa_member'
      and cluster_id is not null
  )
$$;


-- ─── 4. Policies on activities ───────────────────────────────

-- Nucleus activities: anyone with access to the nucleus (incl. an
-- activity lead seeing sibling activities, as before). Any
-- activity: anyone with access to that activity or its cluster.
drop policy if exists "Read activities in accessible nuclei" on activities;
create policy "Read activities in accessible nuclei" on activities
  for select using (
    deleted_at is null and (
      is_admin()
      or (nucleus_id is not null and user_has_nucleus_access(nucleus_id))
      or user_has_activity_access(id)
    )
  );

-- CC manage every activity in their cluster (standalone or not);
-- NC manage activities in their nucleus only.
drop policy if exists "Nucleus collaborators manage activities" on activities;
create policy "Nucleus collaborators manage activities" on activities
  for all using (
    is_admin() or exists (
      select 1 from user_permissions up
      where up.user_id = auth.uid()
        and (
          (up.role = 'cluster_coordinator' and up.cluster_id = activities.cluster_id)
          or (up.role = 'nucleus_collaborator' and activities.nucleus_id is not null
              and up.nucleus_id = activities.nucleus_id)
        )
    )
  );

drop policy if exists "LSA members read activities in own cluster" on activities;
create policy "LSA members read activities in own cluster" on activities
  for select using (
    deleted_at is null
    and cluster_id = any(select lsa_member_cluster_ids())
  );


-- ─── 5. Persons policy that joined activities → nuclei ───────

drop policy if exists "Cluster coordinators delete persons in own cluster" on persons;
create policy "Cluster coordinators delete persons in own cluster" on persons
  for delete using (
    exists (
      select 1 from nucleus_enrollments ne
      join nuclei n on n.id = ne.nucleus_id
      where ne.person_id = persons.id
        and ne.deleted_at is null
        and n.cluster_id = any(select coordinator_cluster_ids())
    )
    or exists (
      select 1 from activity_participants ap
      join activities a on a.id = ap.activity_id
      where ap.person_id = persons.id
        and ap.deleted_at is null
        and a.cluster_id = any(select coordinator_cluster_ids())
    )
  );


-- ─── 6. Notebook entries for standalone activities ───────────
-- Activity entries no longer require a nucleus; they pick one up
-- when the activity is attached. Reads for activity entries are
-- also granted via activity access, since a null nucleus_id never
-- satisfies the nucleus-scoped read policy.

alter table journal_entries drop constraint if exists source_scope_invariant;
alter table journal_entries
  add constraint source_scope_invariant check (
    (source = 'activity' and activity_id is not null and cluster_id is null)
    or (source = 'nucleus' and nucleus_id is not null and activity_id is null and cluster_id is null)
    or (source = 'cluster' and cluster_id is not null and nucleus_id is null and activity_id is null)
  );

drop policy if exists "Read activity entries via activity access" on journal_entries;
create policy "Read activity entries via activity access" on journal_entries
  for select using (
    source = 'activity'
    and activity_id is not null
    and user_has_activity_access(activity_id)
  );

drop policy if exists "Read attendance on activity entries via activity access" on journal_entry_attendance;
create policy "Read attendance on activity entries via activity access" on journal_entry_attendance
  for select using (
    exists (
      select 1 from journal_entries e
      where e.id = journal_entry_attendance.entry_id
        and e.source = 'activity'
        and e.activity_id is not null
        and user_has_activity_access(e.activity_id)
    )
  );


-- ─── 7. Attach a standalone activity to a nucleus ────────────
-- SECURITY INVOKER: every statement runs under the caller's RLS,
-- so only someone who may manage the activity AND the nucleus can
-- complete it; the function just makes the steps atomic.
--
-- Roster members are enrolled in the nucleus with a null
-- engagement_level ("unassigned"), matching addPersonToActivity, so
-- a coordinator places them in the circles deliberately. Existing
-- active enrollments are left untouched.

create or replace function attach_activity_to_nucleus(p_activity uuid, p_nucleus uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_activity_cluster uuid;
  v_activity_nucleus uuid;
  v_activity_name    text;
  v_nucleus_cluster  uuid;
  v_nucleus_name     text;
  v_rows             int;
begin
  select cluster_id, nucleus_id, name
    into v_activity_cluster, v_activity_nucleus, v_activity_name
    from activities where id = p_activity and deleted_at is null;
  if not found then
    raise exception 'Activity not found';
  end if;
  if v_activity_nucleus is not null then
    raise exception 'Activity is already part of a nucleus';
  end if;

  select cluster_id, name into v_nucleus_cluster, v_nucleus_name
    from nuclei where id = p_nucleus and deleted_at is null;
  if not found then
    raise exception 'Nucleus not found';
  end if;
  if v_nucleus_cluster <> v_activity_cluster then
    raise exception 'Nucleus is in a different cluster';
  end if;

  update activities set nucleus_id = p_nucleus where id = p_activity;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Not permitted to move this activity';
  end if;

  update journal_entries
    set nucleus_id = p_nucleus
    where activity_id = p_activity and source = 'activity' and nucleus_id is null;

  update timeline_events
    set nucleus_id = p_nucleus
    where activity_id = p_activity;

  -- Revive soft-deleted enrollments without touching active ones.
  update nucleus_enrollments ne
    set deleted_at = null, engagement_level = null
    from activity_participants ap
    where ap.activity_id = p_activity
      and ap.deleted_at is null
      and ne.person_id = ap.person_id
      and ne.nucleus_id = p_nucleus
      and ne.deleted_at is not null;

  insert into nucleus_enrollments (person_id, nucleus_id, engagement_level)
    select distinct ap.person_id, p_nucleus, null::engagement_level_enum
    from activity_participants ap
    where ap.activity_id = p_activity
      and ap.deleted_at is null
    on conflict (person_id, nucleus_id) do nothing;

  insert into event_log (type, cluster_id, nucleus_id, activity_id, user_id, description, details)
    values (
      'activity_attached_to_nucleus', v_activity_cluster, p_nucleus, p_activity, auth.uid(),
      format('Added activity "%s" to nucleus "%s"', v_activity_name, v_nucleus_name),
      jsonb_build_object('activityName', v_activity_name, 'nucleusName', v_nucleus_name)
    );
end;
$$;

grant execute on function attach_activity_to_nucleus(uuid, uuid) to authenticated;
