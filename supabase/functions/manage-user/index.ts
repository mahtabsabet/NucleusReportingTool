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

    if (!(callerProfile as any)?.is_admin) {
      return json({ error: 'Admin access required' }, 403);
    }

    const body = await req.json();
    const { action } = body;

    // ── list-emails ──────────────────────────────────────────────
    if (action === 'list-emails') {
      const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (listError) return json({ error: listError.message }, 400);
      const emails: Record<string, string> = {};
      for (const u of (listData?.users ?? [])) {
        if (u.email) emails[u.id] = u.email;
      }
      return json({ emails });
    }

    // ── delete ───────────────────────────────────────────────────
    if (action === 'delete') {
      const { targetUserId, confirmedEmail } = body;
      if (!targetUserId) return json({ error: 'targetUserId required' }, 400);
      if (targetUserId === caller.id) return json({ error: 'Cannot delete your own account' }, 403);

      const { data: { user: targetUser }, error: userErr } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
      if (userErr || !targetUser) return json({ error: 'User not found' }, 404);

      if (!confirmedEmail || confirmedEmail.trim().toLowerCase() !== (targetUser.email ?? '').toLowerCase()) {
        return json({ error: 'Email confirmation does not match' }, 400);
      }

      // Deleting auth user cascades: profiles → user_permissions (CASCADE),
      // clusters.created_by and event_log.user_id become NULL (SET NULL).
      // Person records are untouched.
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
      if (deleteError) return json({ error: deleteError.message }, 400);

      return json({ success: true });
    }

    // ── change-role ──────────────────────────────────────────────
    if (action === 'change-role') {
      const { targetUserId, permissionId, newRole, confirmedEmail } = body;
      if (!targetUserId) return json({ error: 'targetUserId required' }, 400);
      if (targetUserId === caller.id) return json({ error: 'Cannot change your own role' }, 403);
      if (!newRole) return json({ error: 'newRole required' }, 400);

      const { data: { user: targetUser }, error: userErr } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
      if (userErr || !targetUser) return json({ error: 'User not found' }, 404);

      if (!confirmedEmail || confirmedEmail.trim().toLowerCase() !== (targetUser.email ?? '').toLowerCase()) {
        return json({ error: 'Email confirmation does not match' }, 400);
      }

      if (newRole === 'admin') {
        await supabaseAdmin.from('profiles').update({ is_admin: true }).eq('id', targetUserId);
        await supabaseAdmin.from('user_permissions').delete().eq('user_id', targetUserId);
      } else {
        if (!permissionId) return json({ error: 'permissionId required for non-admin role change' }, 400);

        const { data: perm, error: permErr } = await supabaseAdmin
          .from('user_permissions')
          .select('id, cluster_id, nucleus_id, activity_id')
          .eq('id', permissionId)
          .eq('user_id', targetUserId)
          .single();

        if (permErr || !perm) return json({ error: 'Permission not found' }, 404);

        const p = perm as any;
        const validRoles = p.cluster_id
          ? ['cluster_coordinator', 'viewer']
          : p.nucleus_id
          ? ['nucleus_collaborator', 'viewer']
          : ['activity_lead', 'viewer'];

        if (!validRoles.includes(newRole)) {
          return json({ error: `Role '${newRole}' is incompatible with this permission's scope` }, 400);
        }

        const { error: updateErr } = await supabaseAdmin
          .from('user_permissions')
          .update({ role: newRole })
          .eq('id', permissionId);

        if (updateErr) return json({ error: updateErr.message }, 400);
      }

      return json({ success: true });
    }

    return json({ error: 'Unknown action' }, 400);
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
