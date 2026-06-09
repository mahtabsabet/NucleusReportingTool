import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mirror of src/lib/permissions.ts.  Keep the two in sync.
const ROLE_ASSIGNERS: Record<string, string[]> = {
  admin:                ['super_admin'],
  regional_viewer:      ['super_admin', 'admin'],
  cluster_coordinator:  ['super_admin', 'admin', 'cluster_coordinator'],
  nucleus_collaborator: ['super_admin', 'admin', 'cluster_coordinator'],
  activity_lead:        ['super_admin', 'admin', 'cluster_coordinator', 'nucleus_collaborator'],
  lsa_member:           ['super_admin', 'admin', 'lsa_member'],
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
      .select('is_admin, is_super_admin')
      .eq('id', caller.id)
      .single();

    const callerIsSuperAdmin = (callerProfile as any)?.is_super_admin === true;
    const callerIsAdmin = (callerProfile as any)?.is_admin === true || callerIsSuperAdmin;

    const body = await req.json();
    const { action } = body;

    // ── list-emails ──────────────────────────────────────────────
    // Visible to any caller that has access to the User Management page.
    // The page itself will filter the cards via RLS, but emails sit in
    // auth.users and require the service role to read.
    if (action === 'list-emails') {
      if (!callerIsAdmin) {
        // CC/NC/LSA need emails too in order to render their managed users.
        const { data: ccPerms } = await supabaseAdmin
          .from('user_permissions')
          .select('id')
          .eq('user_id', caller.id)
          .in('role', ['cluster_coordinator', 'nucleus_collaborator', 'lsa_member'])
          .limit(1);
        if (!ccPerms || ccPerms.length === 0) {
          return json({ error: 'Insufficient permissions' }, 403);
        }
      }
      const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (listError) return json({ error: listError.message }, 400);
      const emails: Record<string, string> = {};
      for (const u of (listData?.users ?? [])) {
        if (u.email) emails[u.id] = u.email;
      }
      return json({ emails });
    }

    // Past list-emails, each action sets its own gate. Delete and
    // reset-password stay admin-only. Change-role accepts CC / NC too,
    // with scope validation performed inside the action block.

    // ── delete ───────────────────────────────────────────────────
    if (action === 'delete') {
      const { targetUserId, confirmedEmail } = body;
      if (!targetUserId) return json({ error: 'targetUserId required' }, 400);
      if (targetUserId === caller.id) return json({ error: 'Cannot delete your own account' }, 403);

      // LSA-only callers can also delete peer LSA-only accounts. Gate
      // applies before the admin path: an Admin caller still passes
      // straight through the admin checks below.
      let callerIsLsaOnly = false;
      if (!callerIsAdmin) {
        const { data: callerPerms } = await supabaseAdmin
          .from('user_permissions')
          .select('role')
          .eq('user_id', caller.id);
        const perms = (callerPerms ?? []) as any[];
        const hasLsa = perms.some(p => p.role === 'lsa_member');
        const hasOther = perms.some(p =>
          p.role === 'cluster_coordinator'
          || p.role === 'nucleus_collaborator'
          || p.role === 'activity_lead');
        callerIsLsaOnly = hasLsa && !hasOther;
        if (!callerIsLsaOnly) return json({ error: 'Admin access required' }, 403);
      }

      const { data: { user: targetUser }, error: userErr } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
      if (userErr || !targetUser) return json({ error: 'User not found' }, 404);

      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('is_admin, is_super_admin, is_regional_viewer')
        .eq('id', targetUserId)
        .single();
      const targetIsSuper = (targetProfile as any)?.is_super_admin === true;
      const targetIsAdmin = (targetProfile as any)?.is_admin === true || targetIsSuper;
      const targetIsRegional = (targetProfile as any)?.is_regional_viewer === true;

      if (targetIsSuper) {
        return json({ error: 'Super Admins cannot be deleted through the application.' }, 403);
      }
      if (targetIsAdmin && !callerIsSuperAdmin) {
        return json({ error: 'Only a Super Admin may delete an Administrator.' }, 403);
      }
      if (callerIsLsaOnly) {
        // LSA caller may only delete other LSA-only users.
        if (targetIsAdmin || targetIsRegional) {
          return json({ error: 'LSA members may only delete peer LSA accounts.' }, 403);
        }
        const { data: targetPerms } = await supabaseAdmin
          .from('user_permissions')
          .select('role')
          .eq('user_id', targetUserId);
        const tps = (targetPerms ?? []) as any[];
        const targetHasLsa = tps.some(p => p.role === 'lsa_member');
        const targetHasOther = tps.some(p =>
          p.role === 'cluster_coordinator'
          || p.role === 'nucleus_collaborator'
          || p.role === 'activity_lead');
        if (!targetHasLsa || targetHasOther) {
          return json({ error: 'LSA members may only delete peer LSA accounts.' }, 403);
        }
      }

      if (!confirmedEmail || confirmedEmail.trim().toLowerCase() !== (targetUser.email ?? '').toLowerCase()) {
        return json({ error: 'Email confirmation does not match' }, 400);
      }

      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
      if (deleteError) return json({ error: deleteError.message }, 400);

      try {
        await supabaseAdmin.from('event_log').insert({
          type: 'user_deleted',
          user_id: caller.id,
          description: `Deleted user ${targetUser.email ?? targetUserId}`,
          details: { targetUserId, email: targetUser.email },
        });
      } catch { /* ignore */ }

      return json({ success: true });
    }

    // ── change-role ──────────────────────────────────────────────
    if (action === 'change-role') {
      const { targetUserId, permissionId, newRole, confirmedEmail, clusterId, nucleusId, activityId } = body;
      if (!targetUserId) return json({ error: 'targetUserId required' }, 400);
      if (targetUserId === caller.id) return json({ error: 'Cannot change your own role' }, 403);
      if (!newRole) return json({ error: 'newRole required' }, 400);

      // Block the unsupported / disallowed roles up front.
      if (newRole === 'super_admin') {
        return json({ error: 'Super Admin cannot be assigned through the application.' }, 403);
      }
      const allowed = ROLE_ASSIGNERS[newRole];
      if (!allowed) return json({ error: `Unknown role: ${newRole}` }, 400);

      // Build the caller's effective-roles list for the ROLE_ASSIGNERS
      // check. Admins / Super Admins are determined above; for non-admin
      // callers we also pull their CC / NC grants from user_permissions
      // so a Cluster Coordinator can assign CC / NC / AL and a Nucleus
      // Coordinator can assign AL — matching ROLE_ASSIGNERS in
      // src/lib/permissions.ts.
      const callerRoles: string[] = [];
      if (callerIsSuperAdmin) callerRoles.push('super_admin');
      if (callerIsAdmin) callerRoles.push('admin');
      let myClusterIds: string[] = [];
      let myNucleusIds: string[] = [];
      let myLsaClusterIds: string[] = [];
      if (!callerIsAdmin) {
        const { data: callerPerms } = await supabaseAdmin
          .from('user_permissions')
          .select('role, cluster_id, nucleus_id')
          .eq('user_id', caller.id);
        const perms = (callerPerms ?? []) as any[];
        myClusterIds = perms
          .filter(p => p.role === 'cluster_coordinator' && p.cluster_id)
          .map(p => p.cluster_id);
        myNucleusIds = perms
          .filter(p => p.role === 'nucleus_collaborator' && p.nucleus_id)
          .map(p => p.nucleus_id);
        myLsaClusterIds = perms
          .filter(p => p.role === 'lsa_member' && p.cluster_id)
          .map(p => p.cluster_id);
        if (myClusterIds.length > 0) callerRoles.push('cluster_coordinator');
        if (myNucleusIds.length > 0) callerRoles.push('nucleus_collaborator');
        if (myLsaClusterIds.length > 0) callerRoles.push('lsa_member');
      }
      if (!allowed.some(r => callerRoles.includes(r))) {
        return json({ error: `You are not allowed to assign the '${newRole}' role.` }, 403);
      }

      const { data: { user: targetUser }, error: userErr } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
      if (userErr || !targetUser) return json({ error: 'User not found' }, 404);

      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('is_admin, is_super_admin, is_regional_viewer')
        .eq('id', targetUserId)
        .single();
      const targetIsSuper = (targetProfile as any)?.is_super_admin === true;
      const targetIsAdmin = (targetProfile as any)?.is_admin === true || targetIsSuper;

      // Safeguards from the table.
      if (targetIsSuper) {
        return json({ error: 'Super Admins cannot be demoted through the application.' }, 403);
      }
      if (targetIsAdmin && !callerIsSuperAdmin) {
        return json({ error: 'Only a Super Admin may change an Administrator’s role.' }, 403);
      }

      // For non-admin callers (CC / NC), validate both ends of the move
      // are in their reach: the target's existing permission row (if any)
      // and the new scope.
      if (!callerIsAdmin) {
        // (a) Existing scope — only checked when permissionId is supplied.
        if (permissionId) {
          const { data: existing } = await supabaseAdmin
            .from('user_permissions')
            .select('cluster_id, nucleus_id, activity_id')
            .eq('id', permissionId)
            .eq('user_id', targetUserId)
            .single();
          if (!existing) return json({ error: 'Permission not found' }, 404);
          const e = existing as any;
          let inScope = !!(e.cluster_id && myClusterIds.includes(e.cluster_id));
          if (!inScope && e.nucleus_id && myClusterIds.length > 0) {
            const { data: n } = await supabaseAdmin
              .from('nuclei').select('cluster_id').eq('id', e.nucleus_id).single();
            if (n && myClusterIds.includes((n as any).cluster_id)) inScope = true;
          }
          if (!inScope && e.activity_id && myClusterIds.length > 0) {
            const { data: a } = await supabaseAdmin
              .from('activities').select('nucleus_id, nuclei(cluster_id)').eq('id', e.activity_id).single();
            const cid = (a as any)?.nuclei?.cluster_id;
            if (cid && myClusterIds.includes(cid)) inScope = true;
          }
          if (!inScope && e.nucleus_id && myNucleusIds.includes(e.nucleus_id)) inScope = true;
          if (!inScope && e.activity_id && myNucleusIds.length > 0) {
            const { data: a } = await supabaseAdmin
              .from('activities').select('nucleus_id').eq('id', e.activity_id).single();
            if (a && myNucleusIds.includes((a as any).nucleus_id)) inScope = true;
          }
          if (!inScope) {
            return json({ error: "Target user's existing permission is not in your scope." }, 403);
          }
        }
        // (b) New scope — must be in caller's reach. Mirrors create-user's
        //     scope checks. (newRole === 'admin' / 'regional_viewer' was
        //     already blocked by the ROLE_ASSIGNERS check above.)
        if (newRole === 'cluster_coordinator') {
          if (!clusterId) return json({ error: 'A cluster must be specified for the cluster_coordinator role.' }, 400);
          if (!myClusterIds.includes(clusterId)) {
            return json({ error: 'Cluster is not in your scope.' }, 403);
          }
        } else if (newRole === 'nucleus_collaborator') {
          if (!nucleusId) return json({ error: 'A nucleus must be specified for the nucleus_collaborator role.' }, 400);
          const { data: n } = await supabaseAdmin
            .from('nuclei').select('cluster_id').eq('id', nucleusId).single();
          const ncid = (n as any)?.cluster_id;
          if (!ncid || !myClusterIds.includes(ncid)) {
            return json({ error: 'Nucleus is not in your scope.' }, 403);
          }
        } else if (newRole === 'activity_lead') {
          if (!activityId) return json({ error: 'An activity must be specified for the activity_lead role.' }, 400);
          const { data: a } = await supabaseAdmin
            .from('activities').select('nucleus_id, nuclei(cluster_id)').eq('id', activityId).single();
          const an = (a as any)?.nucleus_id;
          const ac = (a as any)?.nuclei?.cluster_id;
          const okByCluster = !!(ac && myClusterIds.includes(ac));
          const okByNucleus = !!(an && myNucleusIds.includes(an));
          if (!okByCluster && !okByNucleus) {
            return json({ error: 'Activity is not in your scope.' }, 403);
          }
        } else if (newRole === 'lsa_member') {
          if (!clusterId) return json({ error: 'A cluster must be specified for the lsa_member role.' }, 400);
          if (!myLsaClusterIds.includes(clusterId)) {
            return json({ error: 'Cluster is not in your LSA scope.' }, 403);
          }
        }
      }

      if (!confirmedEmail || confirmedEmail.trim().toLowerCase() !== (targetUser.email ?? '').toLowerCase()) {
        return json({ error: 'Email confirmation does not match' }, 400);
      }

      // Apply the change.
      if (newRole === 'admin') {
        await supabaseAdmin.from('profiles')
          .update({ is_admin: true, is_regional_viewer: false })
          .eq('id', targetUserId);
        await supabaseAdmin.from('user_permissions').delete().eq('user_id', targetUserId);
      } else if (newRole === 'regional_viewer') {
        await supabaseAdmin.from('profiles')
          .update({ is_admin: false, is_regional_viewer: true })
          .eq('id', targetUserId);
        await supabaseAdmin.from('user_permissions').delete().eq('user_id', targetUserId);
      } else {
        // Scoped role (cluster_coordinator / nucleus_collaborator / activity_lead).
        // A user_permissions row pins exactly one scope, and the role must
        // match it — so any move to a scoped role is "create the row for the
        // new scope," whether the target is global (no row yet) or scoped
        // (replace the differently-scoped row identified by permissionId).
        const scopeId =
          newRole === 'cluster_coordinator' ? clusterId
          : newRole === 'nucleus_collaborator' ? nucleusId
          : newRole === 'lsa_member' ? clusterId
          : activityId;
        if (!scopeId) {
          const need =
            newRole === 'cluster_coordinator' ? 'cluster'
            : newRole === 'nucleus_collaborator' ? 'nucleus'
            : newRole === 'lsa_member' ? 'cluster'
            : 'activity';
          return json({ error: `A ${need} must be specified for the '${newRole}' role.` }, 400);
        }

        // When replacing an existing permission, verify it belongs to the
        // target before we touch anything.
        if (permissionId) {
          const { data: existing, error: existErr } = await supabaseAdmin
            .from('user_permissions')
            .select('id')
            .eq('id', permissionId)
            .eq('user_id', targetUserId)
            .single();
          if (existErr || !existing) return json({ error: 'Permission not found' }, 404);
        }

        // Drop any global flags that contradict the scoped role.
        await supabaseAdmin.from('profiles')
          .update({ is_admin: false, is_regional_viewer: false })
          .eq('id', targetUserId);

        // Insert the new scoped permission row first; only then remove the
        // old one, so a failure can't leave the user with no permission.
        const permRow: Record<string, unknown> = { user_id: targetUserId, role: newRole };
        if (newRole === 'cluster_coordinator') permRow.cluster_id = scopeId;
        else if (newRole === 'nucleus_collaborator') permRow.nucleus_id = scopeId;
        else if (newRole === 'lsa_member') permRow.cluster_id = scopeId;
        else permRow.activity_id = scopeId;

        const { error: insertErr } = await supabaseAdmin
          .from('user_permissions')
          .insert(permRow);
        if (insertErr) return json({ error: insertErr.message }, 400);

        if (permissionId) {
          const { error: delErr } = await supabaseAdmin
            .from('user_permissions')
            .delete()
            .eq('id', permissionId);
          if (delErr) return json({ error: delErr.message }, 400);
        }
      }

      try {
        await supabaseAdmin.from('event_log').insert({
          type: 'user_role_changed',
          user_id: caller.id,
          description: `Changed role of ${targetUser.email ?? targetUserId} to ${newRole}`,
          details: { targetUserId, newRole, permissionId },
        });
      } catch { /* ignore */ }

      return json({ success: true });
    }

    // ── reset-password ───────────────────────────────────────────
    // Admin / Super Admin sets a new password for another user, or
    // triggers a recovery email so the user sets their own.
    //
    //   mode: 'email'      → admin sends reset email (preferred default)
    //   mode: 'temporary'  → admin sets a temp password; we flip the
    //                        target's must_change_password flag so the
    //                        app forces them to choose a new one on
    //                        their next login.
    if (action === 'reset-password') {
      if (!callerIsAdmin) return json({ error: 'Admin access required' }, 403);
      const { targetUserId, confirmedEmail, mode, temporaryPassword } = body;
      if (!targetUserId) return json({ error: 'targetUserId required' }, 400);
      if (targetUserId === caller.id) {
        return json({ error: 'Use the Change Password flow for your own account' }, 400);
      }
      if (mode !== 'email' && mode !== 'temporary') {
        return json({ error: "mode must be 'email' or 'temporary'" }, 400);
      }

      const { data: { user: targetUser }, error: userErr } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
      if (userErr || !targetUser) return json({ error: 'User not found' }, 404);

      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('is_admin, is_super_admin')
        .eq('id', targetUserId)
        .single();
      const targetIsSuper = (targetProfile as any)?.is_super_admin === true;
      const targetIsAdmin = (targetProfile as any)?.is_admin === true || targetIsSuper;

      // Mirror the safeguards from delete/change-role: only a Super Admin
      // may reset another Admin's password; nobody may reset a Super
      // Admin's via this path (they go through the normal recovery email).
      if (targetIsSuper) {
        return json({ error: "A Super Admin's password cannot be reset through this interface." }, 403);
      }
      if (targetIsAdmin && !callerIsSuperAdmin) {
        return json({ error: "Only a Super Admin may reset an Administrator's password." }, 403);
      }

      if (!confirmedEmail || confirmedEmail.trim().toLowerCase() !== (targetUser.email ?? '').toLowerCase()) {
        return json({ error: 'Email confirmation does not match' }, 400);
      }

      if (mode === 'email') {
        // Triggers Supabase's recovery email (same email the user would get
        // from the "Forgot password" link on the login page). Lands them on
        // the configured recovery redirect; defaults to SITE_URL.
        const siteUrl = Deno.env.get('SITE_URL') ?? '';
        const redirectTo = siteUrl ? `${siteUrl}/reset-password` : undefined;
        const { error: linkErr } = await supabaseAdmin.auth.resetPasswordForEmail(
          targetUser.email!,
          redirectTo ? { redirectTo } : undefined,
        );
        if (linkErr) return json({ error: linkErr.message }, 400);
      } else {
        // Temporary password: must meet minimum length.
        if (!temporaryPassword || typeof temporaryPassword !== 'string' || temporaryPassword.length < 8) {
          return json({ error: 'Temporary password must be at least 8 characters' }, 400);
        }
        const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          password: temporaryPassword,
        });
        if (pwErr) return json({ error: pwErr.message }, 400);
        await supabaseAdmin.from('profiles')
          .update({ must_change_password: true })
          .eq('id', targetUserId);
      }

      try {
        await supabaseAdmin.from('event_log').insert({
          type: 'user_password_reset',
          user_id: caller.id,
          description: `Reset password for ${targetUser.email ?? targetUserId} (${mode})`,
          details: { targetUserId, mode },
        });
      } catch { /* event_log enum may not include this yet; safe to ignore */ }

      return json({ success: true });
    }

    // ── add-nucleus ──────────────────────────────────────────────
    // Adds a second (or further) nucleus_collaborator row for a user who is
    // already a nucleus collaborator, without touching their existing rows.
    if (action === 'add-nucleus') {
      const { targetUserId, nucleusId: newNucleusId } = body;
      if (!targetUserId) return json({ error: 'targetUserId required' }, 400);
      if (targetUserId === caller.id) return json({ error: 'Cannot change your own permissions' }, 403);
      if (!newNucleusId) return json({ error: 'nucleusId required' }, 400);

      const allowed = ROLE_ASSIGNERS['nucleus_collaborator'];
      const callerRoles2: string[] = [];
      if (callerIsSuperAdmin) callerRoles2.push('super_admin');
      if (callerIsAdmin) callerRoles2.push('admin');
      let myClusterIds2: string[] = [];
      if (!callerIsAdmin) {
        const { data: callerPerms2 } = await supabaseAdmin
          .from('user_permissions')
          .select('role, cluster_id, nucleus_id')
          .eq('user_id', caller.id);
        const perms2 = (callerPerms2 ?? []) as any[];
        myClusterIds2 = perms2
          .filter(p => p.role === 'cluster_coordinator' && p.cluster_id)
          .map(p => p.cluster_id);
        if (myClusterIds2.length > 0) callerRoles2.push('cluster_coordinator');
      }
      if (!allowed.some(r => callerRoles2.includes(r))) {
        return json({ error: `You are not allowed to assign the 'nucleus_collaborator' role.` }, 403);
      }

      // Verify the target is already a nucleus collaborator.
      const { data: existingPerms } = await supabaseAdmin
        .from('user_permissions')
        .select('id, nucleus_id')
        .eq('user_id', targetUserId)
        .eq('role', 'nucleus_collaborator');
      if (!existingPerms || existingPerms.length === 0) {
        return json({ error: 'User is not a Nucleus Coordinator.' }, 400);
      }

      // Prevent duplicate assignment.
      const alreadyAssigned = (existingPerms as any[]).some(p => p.nucleus_id === newNucleusId);
      if (alreadyAssigned) {
        return json({ error: 'User is already a Nucleus Coordinator for that nucleus.' }, 400);
      }

      // Scope check for non-admin callers: the nucleus must be in their cluster.
      if (!callerIsAdmin) {
        const { data: n2 } = await supabaseAdmin
          .from('nuclei').select('cluster_id').eq('id', newNucleusId).single();
        const ncid2 = (n2 as any)?.cluster_id;
        if (!ncid2 || !myClusterIds2.includes(ncid2)) {
          return json({ error: 'Nucleus is not in your scope.' }, 403);
        }
      }

      const { data: { user: targetUser2 }, error: userErr2 } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
      if (userErr2 || !targetUser2) return json({ error: 'User not found' }, 404);

      const { error: insertErr2 } = await supabaseAdmin
        .from('user_permissions')
        .insert({ user_id: targetUserId, role: 'nucleus_collaborator', nucleus_id: newNucleusId });
      if (insertErr2) return json({ error: insertErr2.message }, 400);

      try {
        await supabaseAdmin.from('event_log').insert({
          type: 'user_role_changed',
          user_id: caller.id,
          description: `Added nucleus ${newNucleusId} to nucleus_collaborator ${targetUser2.email ?? targetUserId}`,
          details: { targetUserId, newNucleusId },
        });
      } catch { /* ignore */ }

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
