-- ============================================================
-- DEMO LOGIN ACCOUNTS — run AFTER seed-demo-full.sql, and AFTER
-- you've created the accounts below in the Supabase dashboard.
--
-- Auth users can't be created safely by hand-written SQL (password
-- hashing and related setup are handled by Supabase's own admin
-- API/UI, not a plain INSERT), so create these first:
--
--   Dashboard → Authentication → Users → Add user
--   For each row below: enter the email + a password of your
--   choice, and check "Auto Confirm User" (so no confirmation
--   email is needed).
--
-- Only the first four are needed to show the four different
-- "shells" the app renders per role (full access / cluster-scoped
-- / pinned single-nucleus / pinned single-activity). The last two
-- are optional extras for the Regional Viewer and LSA layers.
--
--   demo-admin@example.com        — Admin (full access; use this
--                                    one for most of the walkthrough)
--   demo-coordinator@example.com  — Cluster Coordinator, Cedar Hollow
--   demo-nc@example.com           — Nucleus Coordinator, Elmwood only
--                                    (pinned shell)
--   demo-lead@example.com         — Activity Lead, Book 1 Study
--                                    Circle only (pinned shell)
--   demo-viewer@example.com       — Regional Viewer (read-only,
--                                    optional)
--   demo-lsa@example.com          — LSA Member, Cedar Hollow
--                                    (optional)
--
-- This script is safe to re-run — every write is idempotent. If an
-- account from the list above wasn't created, its section is
-- silently skipped (a NOTICE says so) rather than failing.
-- ============================================================

do $$
declare
  cedar_id     uuid;
  elmwood_id   uuid;
  study_circle_id uuid;
  admin_id       uuid;
  coordinator_id uuid;
  nc_id          uuid;
  lead_id        uuid;
  viewer_id      uuid;
  lsa_id         uuid;
begin
  select id into cedar_id        from clusters where name = 'Cedar Hollow';
  select id into elmwood_id      from nuclei where name = 'Elmwood';
  select id into study_circle_id from activities where name = 'Book 1 Study Circle';

  if cedar_id is null then
    raise notice 'Cedar Hollow not found — run seed-demo-full.sql first. Aborting.';
    return;
  end if;

  select id into admin_id       from auth.users where email = 'demo-admin@example.com';
  select id into coordinator_id from auth.users where email = 'demo-coordinator@example.com';
  select id into nc_id          from auth.users where email = 'demo-nc@example.com';
  select id into lead_id        from auth.users where email = 'demo-lead@example.com';
  select id into viewer_id      from auth.users where email = 'demo-viewer@example.com';
  select id into lsa_id         from auth.users where email = 'demo-lsa@example.com';

  if admin_id is not null then
    update profiles set name = 'Demo Admin', is_admin = true, is_super_admin = false, is_regional_viewer = false,
      privacy_acknowledged_at = now(), privacy_policy_version_acknowledged = '2026-05-13'
      where id = admin_id;
    raise notice 'demo-admin wired up.';
  else
    raise notice 'demo-admin@example.com not found — skipped (create it in the dashboard first if you want it).';
  end if;

  if coordinator_id is not null then
    update profiles set name = 'Demo Cluster Coordinator', is_admin = false, is_super_admin = false, is_regional_viewer = false,
      privacy_acknowledged_at = now(), privacy_policy_version_acknowledged = '2026-05-13'
      where id = coordinator_id;
    delete from user_permissions where user_id = coordinator_id;
    insert into user_permissions (user_id, role, cluster_id) values (coordinator_id, 'cluster_coordinator', cedar_id);
    raise notice 'demo-coordinator wired up as Cluster Coordinator of Cedar Hollow.';
  else
    raise notice 'demo-coordinator@example.com not found — skipped.';
  end if;

  if nc_id is not null and elmwood_id is not null then
    update profiles set name = 'Demo Nucleus Coordinator', is_admin = false, is_super_admin = false, is_regional_viewer = false,
      privacy_acknowledged_at = now(), privacy_policy_version_acknowledged = '2026-05-13'
      where id = nc_id;
    delete from user_permissions where user_id = nc_id;
    insert into user_permissions (user_id, role, nucleus_id) values (nc_id, 'nucleus_collaborator', elmwood_id);
    raise notice 'demo-nc wired up as Nucleus Coordinator of Elmwood (pinned shell).';
  else
    raise notice 'demo-nc@example.com not found (or Elmwood missing) — skipped.';
  end if;

  if lead_id is not null and study_circle_id is not null then
    update profiles set name = 'Demo Activity Lead', is_admin = false, is_super_admin = false, is_regional_viewer = false,
      privacy_acknowledged_at = now(), privacy_policy_version_acknowledged = '2026-05-13'
      where id = lead_id;
    delete from user_permissions where user_id = lead_id;
    insert into user_permissions (user_id, role, activity_id) values (lead_id, 'activity_lead', study_circle_id);
    raise notice 'demo-lead wired up as Activity Lead of Book 1 Study Circle (pinned shell).';

    -- A pending permission request, so the reviewer queue in User
    -- Management isn't empty: the Activity Lead "requesting" to
    -- remove a participant they can't delete outright.
    insert into permission_requests (target_type, target_id, action, note, cluster_id, requested_by)
    select 'person', (select id from persons where name = 'Sam OConnor'), 'delete',
           'Duplicate profile of Samuel O''Connor — believe this is the same person, requesting removal.',
           cedar_id, lead_id
    where not exists (
      select 1 from permission_requests
      where requested_by = lead_id and action = 'delete' and status = 'pending'
    );
  else
    raise notice 'demo-lead@example.com not found (or Book 1 Study Circle missing) — skipped.';
  end if;

  if viewer_id is not null then
    update profiles set name = 'Demo Regional Viewer', is_admin = false, is_super_admin = false, is_regional_viewer = true,
      privacy_acknowledged_at = now(), privacy_policy_version_acknowledged = '2026-05-13'
      where id = viewer_id;
    raise notice 'demo-viewer wired up as Regional Viewer.';
  else
    raise notice 'demo-viewer@example.com not found — skipped (optional).';
  end if;

  if lsa_id is not null then
    update profiles set name = 'Demo LSA Member', is_admin = false, is_super_admin = false, is_regional_viewer = false,
      privacy_acknowledged_at = now(), privacy_policy_version_acknowledged = '2026-05-13'
      where id = lsa_id;
    delete from user_permissions where user_id = lsa_id;
    insert into user_permissions (user_id, role, cluster_id) values (lsa_id, 'lsa_member', cedar_id);
    raise notice 'demo-lsa wired up as LSA Member of Cedar Hollow.';
  else
    raise notice 'demo-lsa@example.com not found — skipped (optional).';
  end if;

  raise notice '============================================================';
  raise notice 'Demo accounts wired up. Log in as demo-admin@example.com for the main walkthrough.';
  raise notice '============================================================';
end $$;
