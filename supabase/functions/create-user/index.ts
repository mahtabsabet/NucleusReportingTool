import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    if (!authHeader) {
      return json({ error: 'Missing authorization header' }, 401);
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !caller) return json({ error: 'Unauthorized' }, 401);

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', caller.id)
      .single();

    const { data: callerPerms } = await supabaseAdmin
      .from('user_permissions')
      .select('role, cluster_id, nucleus_id, activity_id')
      .eq('user_id', caller.id);

    const isAdmin = (callerProfile as any)?.is_admin ?? false;
    const perms: any[] = (callerPerms as any[]) ?? [];
    const isCC = perms.some(p => p.role === 'cluster_coordinator');
    const isNC = perms.some(p => p.role === 'nucleus_collaborator');

    if (!isAdmin && !isCC && !isNC) {
      return json({ error: 'Insufficient permissions to create users' }, 403);
    }

    const body = await req.json();
    const { name, email, password, role, clusterId, nucleusId, activityId } = body;

    if (!name?.trim() || !email?.trim() || !password?.trim() || !role) {
      return json({ error: 'Missing required fields: name, email, password, role' }, 400);
    }

    // Validate role-based permissions
    if (role === 'admin' && !isAdmin) {
      return json({ error: 'Only admins can create admin users' }, 403);
    }

    if (!isAdmin) {
      if (isNC && !isCC) {
        if (role !== 'activity_lead') {
          return json({ error: 'Nucleus coordinators can only create activity leads' }, 403);
        }
        if (activityId) {
          const { data: activity } = await supabaseAdmin
            .from('activities')
            .select('nucleus_id')
            .eq('id', activityId)
            .single();
          const myNucleusIds = perms
            .filter(p => p.role === 'nucleus_collaborator')
            .map(p => p.nucleus_id);
          if (!activity || !myNucleusIds.includes((activity as any).nucleus_id)) {
            return json({ error: 'Activity is not in your nucleus' }, 403);
          }
        }
      }

      if (isCC) {
        const myClusterIds = perms
          .filter(p => p.role === 'cluster_coordinator')
          .map(p => p.cluster_id);

        if (role === 'cluster_coordinator') {
          if (!clusterId || !myClusterIds.includes(clusterId)) {
            return json({ error: 'Cluster is not in your scope' }, 403);
          }
        } else if (role === 'nucleus_collaborator') {
          if (nucleusId) {
            const { data: nucleus } = await supabaseAdmin
              .from('nuclei')
              .select('cluster_id')
              .eq('id', nucleusId)
              .single();
            if (!nucleus || !myClusterIds.includes((nucleus as any).cluster_id)) {
              return json({ error: 'Nucleus is not in your cluster' }, 403);
            }
          }
        } else if (role === 'activity_lead') {
          if (activityId) {
            const { data: activity } = await supabaseAdmin
              .from('activities')
              .select('nuclei(cluster_id)')
              .eq('id', activityId)
              .single();
            const clusterIdForActivity = (activity as any)?.nuclei?.cluster_id;
            if (!clusterIdForActivity || !myClusterIds.includes(clusterIdForActivity)) {
              return json({ error: 'Activity is not in your cluster' }, 403);
            }
          }
        }
      }
    }

    // Validate that non-admin roles have the required scope
    if (role === 'cluster_coordinator' && !clusterId) {
      return json({ error: 'A cluster must be specified for cluster coordinators' }, 400);
    }
    if (role === 'nucleus_collaborator' && !nucleusId) {
      return json({ error: 'A nucleus must be specified for nucleus coordinators' }, 400);
    }
    if (role === 'activity_lead' && !activityId) {
      return json({ error: 'An activity must be specified for activity leads' }, 400);
    }

    // Create the auth user (email_confirm: true skips the confirmation email)
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

    // Ensure profile name is set correctly (trigger may use email prefix)
    await supabaseAdmin
      .from('profiles')
      .update({ name: name.trim() })
      .eq('id', newUserId);

    if (role === 'admin') {
      await supabaseAdmin
        .from('profiles')
        .update({ is_admin: true })
        .eq('id', newUserId);
    } else {
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
