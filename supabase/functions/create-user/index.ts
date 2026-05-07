import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mirror of src/lib/permissions.ts ROLE_ASSIGNERS — kept inline because
// edge functions cannot import the TS module directly. Any rule change
// must be reflected in BOTH places.
const ROLE_ASSIGNERS: Record<string, string[]> = {
  admin:                ['super_admin'],
  regional_viewer:      ['super_admin', 'admin'],
  cluster_coordinator:  ['super_admin', 'admin', 'cluster_coordinator'],
  nucleus_collaborator: ['super_admin', 'admin', 'cluster_coordinator'],
  activity_lead:        ['super_admin', 'admin', 'cluster_coordinator', 'nucleus_collaborator'],
};

const ROLES_NEEDING_SCOPE = new Set([
  'cluster_coordinator', 'nucleus_collaborator', 'activity_lead',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !caller) return json({ error: 'Unauthorized' }, 401);

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin, is_super_admin, is_regional_viewer')
      .eq('id', caller.id)
      .single();

    const { data: callerPerms } = await supabaseAdmin
      .from('user_permissions')
      .select('role, cluster_id, nucleus_id, activity_id')
      .eq('user_id', caller.id);

    const isSuperAdmin = (callerProfile as any)?.is_super_admin === true;
    const isAdmin = (callerProfile as any)?.is_admin === true || isSuperAdmin;
    const perms: any[] = (callerPerms as any[]) ?? [];
    const myClusterIds = perms
      .filter(p => p.role === 'cluster_coordinator' && p.cluster_id)
      .map(p => p.cluster_id);
    const myNucleusIds = perms
      .filter(p => p.role === 'nucleus_collaborator' && p.nucleus_id)
      .map(p => p.nucleus_id);
    const isCC = myClusterIds.length > 0;
    const isNC = myNucleusIds.length > 0;

    const callerRoles = new Set<string>();
    if (isSuperAdmin) callerRoles.add('super_admin');
    if (isAdmin) callerRoles.add('admin');
    if (isCC) callerRoles.add('cluster_coordinator');
    if (isNC) callerRoles.add('nucleus_collaborator');

    const body = await req.json();
    const { name, email, password, role, clusterId, nucleusId, activityId } = body;

    if (!name?.trim() || !email?.trim() || !password?.trim() || !role) {
      return json({ error: 'Missing required fields: name, email, password, role' }, 400);
    }

    // Super Admin can never be created via API.
    if (role === 'super_admin') {
      return json({ error: 'Super Admins cannot be created through the application.' }, 403);
    }

    // Caller must be entitled to create THIS role.
    const allowed = ROLE_ASSIGNERS[role];
    if (!allowed) return json({ error: `Unknown role: ${role}` }, 400);
    if (!allowed.some(r => callerRoles.has(r))) {
      return json({ error: `You are not allowed to create users with the '${role}' role.` }, 403);
    }

    // Scope rules.
    if (ROLES_NEEDING_SCOPE.has(role)) {
      if (role === 'cluster_coordinator') {
        if (!clusterId) return json({ error: 'A cluster must be specified for cluster coordinators' }, 400);
        // Cluster Coordinators may only assign within their own cluster.
        if (!isAdmin && isCC && !myClusterIds.includes(clusterId)) {
          return json({ error: 'Cluster is not in your scope' }, 403);
        }
      } else if (role === 'nucleus_collaborator') {
        if (!nucleusId) return json({ error: 'A nucleus must be specified for nucleus coordinators' }, 400);
        if (!isAdmin && isCC) {
          const { data: nucleus } = await supabaseAdmin
            .from('nuclei').select('cluster_id').eq('id', nucleusId).single();
          if (!nucleus || !myClusterIds.includes((nucleus as any).cluster_id)) {
            return json({ error: 'Nucleus is not in your cluster' }, 403);
          }
        }
      } else if (role === 'activity_lead') {
        if (!activityId) return json({ error: 'An activity must be specified for activity leads' }, 400);
        if (!isAdmin) {
          const { data: activity } = await supabaseAdmin
            .from('activities')
            .select('nucleus_id, nuclei(cluster_id)')
            .eq('id', activityId)
            .single();
          const a = activity as any;
          const okByCluster = isCC && myClusterIds.includes(a?.nuclei?.cluster_id);
          const okByNucleus = isNC && myNucleusIds.includes(a?.nucleus_id);
          if (!okByCluster && !okByNucleus) {
            return json({ error: 'Activity is not in your permitted scope' }, 403);
          }
        }
      }
    }

    // Create the auth user.
    const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password: password.trim(),
      user_metadata: { name: name.trim() },
      email_confirm: true,
    });

    if (createError || !newUserData.user) {
      return json({ error: createError?.message ?? 'Failed to create user' }, 400);
    }

    const newUserId = newUserData.user.id;

    // Set profile name + global flags.
    const profileUpdate: Record<string, unknown> = { name: name.trim() };
    if (role === 'admin') profileUpdate.is_admin = true;
    if (role === 'regional_viewer') profileUpdate.is_regional_viewer = true;
    await supabaseAdmin.from('profiles').update(profileUpdate).eq('id', newUserId);

    if (ROLES_NEEDING_SCOPE.has(role)) {
      const permData: Record<string, unknown> = { user_id: newUserId, role };
      if (role === 'cluster_coordinator') permData.cluster_id = clusterId;
      else if (role === 'nucleus_collaborator') permData.nucleus_id = nucleusId;
      else if (role === 'activity_lead') permData.activity_id = activityId;

      const { error: permError } = await supabaseAdmin
        .from('user_permissions')
        .insert(permData);

      if (permError) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        return json({ error: 'Failed to assign permissions: ' + permError.message }, 400);
      }
    }

    return json({ success: true, userId: newUserId });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
