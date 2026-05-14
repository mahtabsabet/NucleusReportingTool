import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

export const TEST_IDS = {
  clusterId:             '11111111-1111-1111-1111-111111111111',
  nucleusId:             '22222222-2222-2222-2222-222222222222',
  activityId:            '33333333-3333-3333-3333-333333333333',
  personAwareId:         '44444444-4444-4444-4444-444444444444',
  personParticipatingId: '55555555-5555-5555-5555-555555555555',
  // Second cluster/nucleus — used only to verify out-of-scope access is blocked
  cluster2Id:            '66666666-6666-6666-6666-666666666666',
  nucleus2Id:            '77777777-7777-7777-7777-777777777777',
  // Timeline event fixture — clicked by the notes happy-path test to
  // open the detail drawer. The name is unique enough to locate via
  // a tooltip lookup on the strip.
  timelineEventId:       '88888888-8888-8888-8888-888888888888',
} as const;

// Fixed name for the timeline event fixture. Exported so the e2e
// spec can search for it without duplicating the literal.
export const TEST_TIMELINE_EVENT_NAME = 'E2E Test Phase';

// Canonical password for the main E2E test user. Re-asserted on every
// seed run so the test DB password and the value used by auth.setup.ts
// can never drift (an earlier convention put this in a GitHub secret,
// which proved brittle — manual exercises of admin-reset / change-
// password against the same dev project silently rotated the password
// and broke CI for every subsequent PR). This is a dev/test project,
// so a hardcoded literal is appropriate; the same pattern is used for
// the perm test users below.
export const E2E_MAIN_USER_PASSWORD = 'E2EMain123!';

// Mirror of CURRENT_PRIVACY_POLICY_VERSION in src/lib/db/privacy.ts and
// the literal returned by current_privacy_policy_version() in the
// 20260513_privacy_acknowledgement migration. Bump all three together.
// Test users are stamped with this value so the privacy gate doesn't
// block e2e setup — fixtures don't acknowledge through the UI.
const PRIVACY_POLICY_VERSION_FOR_SEED = '2026-05-13';

// Permanent test users created (and kept) in dev for permission integration tests.
// Credentials are fixed so permissions.setup.ts can log in without reading the DB.
export const TEST_USERS = {
  superAdmin: {
    email:    'perm-super-admin@nucleus-test.invalid',
    password: 'TestSuper123!',
    name:     'Perm Super Admin',
  },
  admin: {
    email:    'perm-admin@nucleus-test.invalid',
    password: 'TestAdmin123!',
    name:     'Perm Admin',
  },
  regional: {
    email:    'perm-regional@nucleus-test.invalid',
    password: 'TestRegional123!',
    name:     'Perm Regional',
  },
  coordinator: {
    email:    'perm-coordinator@nucleus-test.invalid',
    password: 'TestCoord123!',
    name:     'Perm Coordinator',
  },
  collaborator: {
    email:    'perm-collaborator@nucleus-test.invalid',
    password: 'TestCollab123!',
    name:     'Perm Collaborator',
  },
  lead: {
    email:    'perm-lead@nucleus-test.invalid',
    password: 'TestLead123!',
    name:     'Perm Lead',
  },
  viewer: {
    email:    'perm-viewer@nucleus-test.invalid',
    password: 'TestViewer123!',
    name:     'Perm Viewer',
  },
} as const;

export async function seed() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const testEmail = process.env.E2E_TEST_EMAIL;
  // Password is now hardcoded above (see comment on E2E_MAIN_USER_PASSWORD)
  // so the GitHub secret only needs to provide the email; the password
  // is re-asserted from this file on every seed run.
  const testPassword = E2E_MAIN_USER_PASSWORD;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local\n' +
      'Get the service role key from: Supabase dashboard → Settings → API → service_role'
    );
  }
  if (!testEmail) {
    throw new Error('Missing E2E_TEST_EMAIL in .env.local');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Fetch all users once — used for both the main E2E user and the perm test users
  const { data: { users: allUsers }, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw new Error(`List users: ${listErr.message}`);

  // Resolve the main E2E test user. Auto-create it if missing — CI starts
  // from a fresh database and shouldn't fail before the seed has had a
  // chance to run. The user persists across CI runs, but the password is
  // re-set every run so a manual reset / change-password exercise against
  // the same Supabase project can't leave CI permanently broken. Same
  // logic applies to the perm test users below.
  let testUser = allUsers.find(u => u.email === testEmail);
  if (!testUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email:         testEmail,
      password:      testPassword,
      user_metadata: { name: 'E2E Test User' },
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`Create main E2E test user ${testEmail}: ${error?.message ?? 'unknown'}`);
    }
    await supabase.from('profiles').update({ name: 'E2E Test User' }).eq('id', data.user.id);
    testUser = data.user;
    allUsers.push(data.user);
  } else {
    const { error: pwErr } = await supabase.auth.admin.updateUserById(testUser.id, {
      password: testPassword,
    });
    if (pwErr) throw new Error(`Reset main E2E test user password: ${pwErr.message}`);
    // Also clear must_change_password in case a prior test toggled it on
    // through the admin reset → temporary path.
    await supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', testUser.id);
  }

  // Stamp the privacy acknowledgement on the main test user so the gate
  // doesn't block auth.setup.ts. Real users have to confirm through the
  // UI; fixtures get pre-acknowledged. Idempotent — run on every seed.
  await supabase
    .from('profiles')
    .update({
      privacy_acknowledged_at: new Date().toISOString(),
      privacy_policy_version_acknowledged: PRIVACY_POLICY_VERSION_FOR_SEED,
    })
    .eq('id', testUser.id);

  // Find or create each permanent permission test user. Like the main
  // test user above, passwords are re-set every run for idempotency.
  async function ensurePermUser(
    email: string, password: string, name: string,
  ): Promise<string> {
    const existing = allUsers.find(u => u.email === email);
    let id: string;
    if (existing) {
      const { error: pwErr } = await supabase.auth.admin.updateUserById(existing.id, { password });
      if (pwErr) throw new Error(`Reset perm test user ${email} password: ${pwErr.message}`);
      await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', existing.id);
      id = existing.id;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email, password,
        user_metadata: { name },
        email_confirm: true,
      });
      if (error) throw new Error(`Create perm test user ${email}: ${error.message}`);
      await supabase.from('profiles').update({ name }).eq('id', data.user.id);
      id = data.user.id;
    }
    // Pre-acknowledge the privacy policy so permissions.setup.ts isn't
    // blocked by the gate. Same rationale as the main test user above.
    await supabase
      .from('profiles')
      .update({
        privacy_acknowledged_at: new Date().toISOString(),
        privacy_policy_version_acknowledged: PRIVACY_POLICY_VERSION_FOR_SEED,
      })
      .eq('id', id);
    return id;
  }

  const permIds = {
    superAdmin:  await ensurePermUser(TEST_USERS.superAdmin.email,  TEST_USERS.superAdmin.password,  TEST_USERS.superAdmin.name),
    admin:       await ensurePermUser(TEST_USERS.admin.email,       TEST_USERS.admin.password,       TEST_USERS.admin.name),
    regional:    await ensurePermUser(TEST_USERS.regional.email,    TEST_USERS.regional.password,    TEST_USERS.regional.name),
    coordinator: await ensurePermUser(TEST_USERS.coordinator.email, TEST_USERS.coordinator.password, TEST_USERS.coordinator.name),
    collaborator:await ensurePermUser(TEST_USERS.collaborator.email,TEST_USERS.collaborator.password,TEST_USERS.collaborator.name),
    lead:        await ensurePermUser(TEST_USERS.lead.email,        TEST_USERS.lead.password,        TEST_USERS.lead.name),
    viewer:      await ensurePermUser(TEST_USERS.viewer.email,      TEST_USERS.viewer.password,      TEST_USERS.viewer.name),
  };

  // Remove any ephemeral users created by tests (e.g. from "admin can create a user" tests).
  // Convention: test-created users use @nucleus-test.invalid emails.
  const permanentEmails = new Set(Object.values(TEST_USERS).map(u => u.email));
  const ephemeralUsers = allUsers.filter(
    u => u.email?.endsWith('@nucleus-test.invalid') && !permanentEmails.has(u.email!),
  );
  for (const u of ephemeralUsers) {
    await supabase.auth.admin.deleteUser(u.id);
  }

  const testPersonIds = [TEST_IDS.personAwareId, TEST_IDS.personParticipatingId];

  // Clean up any persons dynamically created by tests (e.g. "Charlie Test" added by test 2)
  const { data: testCreatedPersons } = await supabase
    .from('persons')
    .select('id')
    .ilike('name', '% Test')
    .not('id', 'in', `(${testPersonIds.join(',')})`);
  if (testCreatedPersons && testCreatedPersons.length > 0) {
    const ids = testCreatedPersons.map(p => p.id);
    await supabase.from('activity_participants').delete().in('person_id', ids);
    await supabase.from('nucleus_enrollments').delete().in('person_id', ids);
    await supabase.from('persons').delete().in('id', ids);
  }

  // Wipe all perm test user permissions before re-granting them below
  await supabase.from('user_permissions').delete().in('user_id', Object.values(permIds));

  // Clear existing test data in FK-safe order. Notes cascade with their
  // parent timeline_events row, but we delete them explicitly so a
  // half-run seed (no event row but stale notes) reaches a clean state.
  await supabase.from('timeline_item_notes').delete().eq('timeline_item_id', TEST_IDS.timelineEventId);
  await supabase.from('timeline_events').delete().eq('id', TEST_IDS.timelineEventId);
  // Sweep any ad-hoc notes/events created mid-test under our test cluster.
  // Notes first (FK), then any cluster-scoped events with names that match
  // our test prefix. We don't blanket-delete cluster events because some
  // legitimate fixtures may live there.
  const { data: leakedEvents } = await supabase
    .from('timeline_events')
    .select('id')
    .eq('cluster_id', TEST_IDS.clusterId)
    .ilike('name', 'E2E %');
  if (leakedEvents && leakedEvents.length > 0) {
    const leakedIds = leakedEvents.map((r: any) => r.id);
    await supabase.from('timeline_item_notes').delete().in('timeline_item_id', leakedIds);
    await supabase.from('timeline_events').delete().in('id', leakedIds);
  }
  await supabase.from('user_permissions').delete().eq('cluster_id', TEST_IDS.clusterId);
  await supabase.from('user_permissions').delete().eq('cluster_id', TEST_IDS.cluster2Id);
  await supabase.from('activity_participants').delete().eq('activity_id', TEST_IDS.activityId);
  await supabase.from('nucleus_enrollments').delete().in('person_id', testPersonIds);
  await supabase.from('activities').delete().eq('id', TEST_IDS.activityId);
  await supabase.from('persons').delete().in('id', testPersonIds);
  await supabase.from('nuclei').delete().eq('id', TEST_IDS.nucleusId);
  await supabase.from('nuclei').delete().eq('id', TEST_IDS.nucleus2Id);
  await supabase.from('clusters').delete().eq('id', TEST_IDS.clusterId);
  await supabase.from('clusters').delete().eq('id', TEST_IDS.cluster2Id);

  // ── Seed core test data ──────────────────────────────────────────────────────

  const { error: clusterErr } = await supabase.from('clusters').upsert({
    id: TEST_IDS.clusterId,
    name: 'Test Cluster',
    center_lat: 43.65,
    center_lng: -79.38,
    zoom: 11,
  }, { onConflict: 'id' });
  if (clusterErr) throw new Error(`Seed cluster: ${clusterErr.message}`);

  // Second cluster — deliberately no coordinator so we can test out-of-scope blocking
  const { error: cluster2Err } = await supabase.from('clusters').upsert({
    id: TEST_IDS.cluster2Id,
    name: 'Test Cluster 2',
    center_lat: 43.70,
    center_lng: -79.40,
    zoom: 11,
  }, { onConflict: 'id' });
  if (cluster2Err) throw new Error(`Seed cluster 2: ${cluster2Err.message}`);

  const { error: nucleusErr } = await supabase.from('nuclei').upsert({
    id: TEST_IDS.nucleusId,
    cluster_id: TEST_IDS.clusterId,
    name: 'Test Nucleus',
    lat: 43.65,
    lng: -79.38,
    deleted_at: null,
  }, { onConflict: 'id' });
  if (nucleusErr) throw new Error(`Seed nucleus: ${nucleusErr.message}`);

  const { error: nucleus2Err } = await supabase.from('nuclei').upsert({
    id: TEST_IDS.nucleus2Id,
    cluster_id: TEST_IDS.cluster2Id,
    name: 'Test Nucleus 2',
    lat: 43.70,
    lng: -79.40,
    deleted_at: null,
  }, { onConflict: 'id' });
  if (nucleus2Err) throw new Error(`Seed nucleus 2: ${nucleus2Err.message}`);

  const { error: personsErr } = await supabase.from('persons').upsert([
    { id: TEST_IDS.personAwareId,         name: 'Alice Test', is_minor: false, deleted_at: null },
    { id: TEST_IDS.personParticipatingId, name: 'Bob Test',   is_minor: false, deleted_at: null },
  ], { onConflict: 'id' });
  if (personsErr) throw new Error(`Seed persons: ${personsErr.message}`);

  const { error: enrollErr } = await supabase.from('nucleus_enrollments').upsert([
    { person_id: TEST_IDS.personAwareId,         nucleus_id: TEST_IDS.nucleusId, engagement_level: 'aware',         deleted_at: null },
    { person_id: TEST_IDS.personParticipatingId, nucleus_id: TEST_IDS.nucleusId, engagement_level: 'participating', deleted_at: null },
  ], { onConflict: 'person_id,nucleus_id' });
  if (enrollErr) throw new Error(`Seed enrollments: ${enrollErr.message}`);

  const { error: activityErr } = await supabase.from('activities').upsert({
    id: TEST_IDS.activityId,
    nucleus_id: TEST_IDS.nucleusId,
    name: "Test Children's Class",
    type: 'children_class',
    is_active: true,
    deleted_at: null,
  }, { onConflict: 'id' });
  if (activityErr) throw new Error(`Seed activity: ${activityErr.message}`);

  // Timeline event fixture used by the "click → drawer → add note" e2e
  // test. We pin a date inside the default 1-year initial window of the
  // workspace so it's visible without panning. The timeline opens on
  // "today" by default and our cycle range starts in 2026, so place the
  // event a few weeks after the start of 2026 — well inside the
  // initial viewport regardless of when the test runs.
  const { error: timelineEvtErr } = await supabase.from('timeline_events').upsert({
    id:         TEST_IDS.timelineEventId,
    name:       TEST_TIMELINE_EVENT_NAME,
    item_type:  'event',
    start_date: '2026-02-01',
    end_date:   '2026-02-28',
    cluster_id: TEST_IDS.clusterId,
    location:   'Test Cluster Hall',
  }, { onConflict: 'id' });
  if (timelineEvtErr) throw new Error(`Seed timeline event: ${timelineEvtErr.message}`);

  // ── Grant permissions ────────────────────────────────────────────────────────

  // Main E2E test user: admin + cluster coordinator (unchanged from before)
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ is_admin: true })
    .eq('id', testUser.id);
  if (profileErr) throw new Error(`Seed profile: ${profileErr.message}`);

  const { error: permErr } = await supabase.from('user_permissions').insert({
    user_id: testUser.id,
    role: 'cluster_coordinator',
    cluster_id: TEST_IDS.clusterId,
  });
  if (permErr) throw new Error(`Seed user_permissions: ${permErr.message}`);

  // perm-super-admin: top-tier role, both flags set, no scoped row.
  await supabase.from('profiles')
    .update({ is_admin: true, is_super_admin: true, is_regional_viewer: false })
    .eq('id', permIds.superAdmin);

  // perm-admin: system administrator, no scoped permission row needed.
  // Explicitly clear is_super_admin/is_regional_viewer so re-seeds put the
  // user back in a known state regardless of prior runs.
  await supabase.from('profiles')
    .update({ is_admin: true, is_super_admin: false, is_regional_viewer: false })
    .eq('id', permIds.admin);

  // perm-regional: read-only across all clusters.
  await supabase.from('profiles')
    .update({ is_admin: false, is_super_admin: false, is_regional_viewer: true })
    .eq('id', permIds.regional);

  // perm-coordinator: cluster coordinator for cluster 1 only (not admin)
  await supabase.from('profiles')
    .update({ is_admin: false, is_super_admin: false, is_regional_viewer: false })
    .eq('id', permIds.coordinator);
  await supabase.from('user_permissions').insert({
    user_id: permIds.coordinator,
    role: 'cluster_coordinator',
    cluster_id: TEST_IDS.clusterId,
  });

  // perm-collaborator: nucleus collaborator for nucleus 1 (not admin, not coordinator)
  await supabase.from('profiles')
    .update({ is_admin: false, is_super_admin: false, is_regional_viewer: false })
    .eq('id', permIds.collaborator);
  await supabase.from('user_permissions').insert({
    user_id: permIds.collaborator,
    role: 'nucleus_collaborator',
    nucleus_id: TEST_IDS.nucleusId,
  });

  // perm-lead: activity lead for activity 1 (not admin, not coordinator, not collaborator)
  await supabase.from('profiles')
    .update({ is_admin: false, is_super_admin: false, is_regional_viewer: false })
    .eq('id', permIds.lead);
  await supabase.from('user_permissions').insert({
    user_id: permIds.lead,
    role: 'activity_lead',
    activity_id: TEST_IDS.activityId,
  });

  // perm-viewer: authenticated but no permissions at all
  await supabase.from('profiles')
    .update({ is_admin: false, is_super_admin: false, is_regional_viewer: false })
    .eq('id', permIds.viewer);

  // Clean up any leftover pending requests submitted by previous test runs.
  // Only those tied to our seeded ids — leaves real requests alone.
  await supabase.from('permission_requests').delete()
    .or(`requested_by.eq.${permIds.collaborator},requested_by.eq.${permIds.lead},requested_by.eq.${permIds.coordinator}`);

  // ── Verify ───────────────────────────────────────────────────────────────────

  const [{ count: actCount }, { count: personCount }, { count: enrollCount }] = await Promise.all([
    supabase.from('activities').select('*', { count: 'exact', head: true }).eq('nucleus_id', TEST_IDS.nucleusId).is('deleted_at', null),
    supabase.from('persons').select('*', { count: 'exact', head: true }).in('id', testPersonIds),
    supabase.from('nucleus_enrollments').select('*', { count: 'exact', head: true }).eq('nucleus_id', TEST_IDS.nucleusId).is('deleted_at', null),
  ]);

  const { data: permData } = await supabase.from('user_permissions').select('user_id,role').eq('cluster_id', TEST_IDS.clusterId);
  const { data: profileData } = await supabase.from('profiles').select('is_admin').eq('id', testUser.id);

  console.log(`✓ Dev DB seeded — activities:${actCount} persons:${personCount} enrollments:${enrollCount} perms:${permData?.length} is_admin:${profileData?.[0]?.is_admin}`);
  console.log(`✓ Perm test users ready — admin:${permIds.admin.slice(0, 8)} coord:${permIds.coordinator.slice(0, 8)} collab:${permIds.collaborator.slice(0, 8)} lead:${permIds.lead.slice(0, 8)} viewer:${permIds.viewer.slice(0, 8)}`);
  if (!actCount || !personCount || !enrollCount) throw new Error('Seed verification failed: missing data');
}
