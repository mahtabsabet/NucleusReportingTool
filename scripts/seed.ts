import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

export const TEST_IDS = {
  clusterId:           '11111111-1111-1111-1111-111111111111',
  nucleusId:           '22222222-2222-2222-2222-222222222222',
  activityId:          '33333333-3333-3333-3333-333333333333',
  personAwareId:       '44444444-4444-4444-4444-444444444444',
  personParticipatingId: '55555555-5555-5555-5555-555555555555',
} as const;

export async function seed() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const testEmail = process.env.E2E_TEST_EMAIL;

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

  // Resolve the test user's ID (needed to grant cluster access)
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw new Error(`List users: ${listErr.message}`);
  const testUser = users.find(u => u.email === testEmail);
  if (!testUser) throw new Error(`Test user not found in auth.users: ${testEmail}`);

  const testPersonIds = [TEST_IDS.personAwareId, TEST_IDS.personParticipatingId];

  // Clear existing test data in FK-safe order
  await supabase.from('user_permissions').delete().eq('cluster_id', TEST_IDS.clusterId);
  await supabase.from('activity_participants').delete().eq('activity_id', TEST_IDS.activityId);
  await supabase.from('nucleus_enrollments').delete().in('person_id', testPersonIds);
  await supabase.from('activities').delete().eq('id', TEST_IDS.activityId);
  await supabase.from('persons').delete().in('id', testPersonIds);
  await supabase.from('nuclei').delete().eq('id', TEST_IDS.nucleusId);
  await supabase.from('clusters').delete().eq('id', TEST_IDS.clusterId);

  const { error: clusterErr } = await supabase.from('clusters').insert({
    id: TEST_IDS.clusterId,
    name: 'Test Cluster',
    center_lat: 43.65,
    center_lng: -79.38,
    zoom: 11,
  });
  if (clusterErr) throw new Error(`Seed cluster: ${clusterErr.message}`);

  // Ensure the test user is an admin so RLS grants broad access
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

  const { error: nucleusErr } = await supabase.from('nuclei').insert({
    id: TEST_IDS.nucleusId,
    cluster_id: TEST_IDS.clusterId,
    name: 'Test Nucleus',
    lat: 43.65,
    lng: -79.38,
  });
  if (nucleusErr) throw new Error(`Seed nucleus: ${nucleusErr.message}`);

  const { error: personsErr } = await supabase.from('persons').insert([
    { id: TEST_IDS.personAwareId, name: 'Alice Test', is_minor: false },
    { id: TEST_IDS.personParticipatingId, name: 'Bob Test', is_minor: false },
  ]);
  if (personsErr) throw new Error(`Seed persons: ${personsErr.message}`);

  const { error: enrollErr } = await supabase.from('nucleus_enrollments').insert([
    { person_id: TEST_IDS.personAwareId, nucleus_id: TEST_IDS.nucleusId, engagement_level: 'aware' },
    { person_id: TEST_IDS.personParticipatingId, nucleus_id: TEST_IDS.nucleusId, engagement_level: 'participating' },
  ]);
  if (enrollErr) throw new Error(`Seed enrollments: ${enrollErr.message}`);

  const { error: activityErr } = await supabase.from('activities').insert({
    id: TEST_IDS.activityId,
    nucleus_id: TEST_IDS.nucleusId,
    name: "Test Children's Class",
    type: 'children_class',
    is_active: true,
  });
  if (activityErr) throw new Error(`Seed activity: ${activityErr.message}`);

  console.log('✓ Dev DB seeded with test data');
}
