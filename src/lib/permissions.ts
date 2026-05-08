// ============================================================
// Central permissions model.
//
// Single source of truth for what each role can do, where it
// can be applied, and which roles are allowed to assign others.
// Both the UI (option lists, hidden buttons) and the action
// helpers consume this module so that the rules cannot drift.
//
// IMPORTANT: matching server-side enforcement lives in:
//   - supabase/schema.sql + migrations          (RLS)
//   - supabase/functions/create-user            (Edge fn)
//   - supabase/functions/manage-user            (Edge fn)
//
// Any rule change here must be mirrored in the edge functions
// and the RLS policies. This file is the canonical version.
// ============================================================

export type Role =
  | 'super_admin'         // profiles.is_super_admin
  | 'admin'               // profiles.is_admin (and not super)
  | 'regional_viewer'     // profiles.is_regional_viewer
  | 'cluster_coordinator' // user_permissions.role
  | 'nucleus_collaborator'// user_permissions.role  (label: "Nucleus Coordinator")
  | 'activity_lead';      // user_permissions.role

// Roles that are stored in the user_permissions table (need a scope).
export type ScopedRole =
  | 'cluster_coordinator'
  | 'nucleus_collaborator'
  | 'activity_lead';

// Roles a user-creation form can offer. Super Admin is intentionally
// not creatable through the UI — only the initial bootstrap assigns it.
export type CreatableRole = Exclude<Role, 'super_admin'>;

// Display labels — single source of truth.
const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrator',
  regional_viewer: 'Regional (View-Only)',
  cluster_coordinator: 'Cluster Coordinator',
  nucleus_collaborator: 'Nucleus Coordinator',
  activity_lead: 'Activity Lead',
};

export function roleLabel(role: Role | string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? String(role);
}

// Per-role badge classes (used by UserManagement card chips, etc.).
export const ROLE_BADGE_CLASSES: Record<string, string> = {
  super_admin: 'bg-rose-100 text-rose-800',
  admin: 'bg-purple-100 text-purple-800',
  regional_viewer: 'bg-slate-100 text-slate-700',
  cluster_coordinator: 'bg-blue-100 text-blue-800',
  nucleus_collaborator: 'bg-emerald-100 text-emerald-800',
  activity_lead: 'bg-amber-100 text-amber-800',
  viewer: 'bg-gray-100 text-gray-600', // legacy
};

// What scope a creatable role requires.
export type ScopeRequirement = 'none' | 'cluster' | 'nucleus' | 'activity';

export function scopeRequirementFor(role: CreatableRole): ScopeRequirement {
  switch (role) {
    case 'admin':
    case 'regional_viewer':
      return 'none';
    case 'cluster_coordinator':
      return 'cluster';
    case 'nucleus_collaborator':
      return 'nucleus';
    case 'activity_lead':
      return 'activity';
  }
}

// ============================================================
// Caller context — derived from the signed-in user.
// ============================================================

export interface PermissionGrant {
  role: ScopedRole;
  clusterId: string | null;
  nucleusId: string | null;
  activityId: string | null;
}

export interface CallerContext {
  userId: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;             // includes super admins
  isRegionalViewer: boolean;
  grants: PermissionGrant[];
}

// Convenience derivations.
export function coordinatorClusterIds(ctx: CallerContext): string[] {
  return ctx.grants
    .filter(g => g.role === 'cluster_coordinator' && g.clusterId)
    .map(g => g.clusterId as string);
}
export function collaboratorNucleusIds(ctx: CallerContext): string[] {
  return ctx.grants
    .filter(g => g.role === 'nucleus_collaborator' && g.nucleusId)
    .map(g => g.nucleusId as string);
}
export function activityLeadActivityIds(ctx: CallerContext): string[] {
  return ctx.grants
    .filter(g => g.role === 'activity_lead' && g.activityId)
    .map(g => g.activityId as string);
}
export function isClusterCoordinator(ctx: CallerContext): boolean {
  return coordinatorClusterIds(ctx).length > 0;
}
// True if the user is permitted to create a nucleus in *any* cluster — used
// to decide whether to render the "New Nucleus" affordance at all (vs. the
// per-cluster `create_nucleus` check, which gates the action itself).
export function canCreateAnyNucleus(ctx: CallerContext): boolean {
  return ctx.isSuperAdmin || ctx.isAdmin || isClusterCoordinator(ctx);
}
export function isNucleusCollaborator(ctx: CallerContext): boolean {
  return collaboratorNucleusIds(ctx).length > 0;
}
export function isActivityLead(ctx: CallerContext): boolean {
  return activityLeadActivityIds(ctx).length > 0;
}

// True when the caller is a Regional (View-Only) user with no elevated grants.
// Used by the UI to hide affordances that would otherwise hint at edit
// capabilities the user doesn't actually have.
export function isRegionalOnly(ctx: CallerContext): boolean {
  if (ctx.isSuperAdmin || ctx.isAdmin) return false;
  if (isClusterCoordinator(ctx) || isNucleusCollaborator(ctx) || isActivityLead(ctx)) {
    return false;
  }
  return ctx.isRegionalViewer;
}

// The "primary" role of a caller, picked top-down for display purposes.
export function primaryRole(ctx: CallerContext): Role {
  if (ctx.isSuperAdmin) return 'super_admin';
  if (ctx.isAdmin) return 'admin';
  if (isClusterCoordinator(ctx)) return 'cluster_coordinator';
  if (isNucleusCollaborator(ctx)) return 'nucleus_collaborator';
  if (isActivityLead(ctx)) return 'activity_lead';
  if (ctx.isRegionalViewer) return 'regional_viewer';
  // Default — no role assigned. Treat as least-privileged viewer.
  return 'regional_viewer';
}

// ============================================================
// Role assignment rules — driven by the permissions table.
// ============================================================

// Who is allowed to create / promote-to / demote-to each role.
// (Mirrors the "Can create/promote to this role" row of the table.)
const ROLE_ASSIGNERS: Record<CreatableRole, Role[]> = {
  // "Super Admin only"
  admin:               ['super_admin'],
  // "Super Admin or Admin"
  regional_viewer:     ['super_admin', 'admin'],
  // "Super Admin, Admin, or Cluster Coordinator"
  cluster_coordinator: ['super_admin', 'admin', 'cluster_coordinator'],
  nucleus_collaborator:['super_admin', 'admin', 'cluster_coordinator'],
  // "Super Admin, Admin, Cluster Coordinator, or Nucleus Coordinator"
  activity_lead:       ['super_admin', 'admin', 'cluster_coordinator', 'nucleus_collaborator'],
};

export function canAssignRole(ctx: CallerContext, target: CreatableRole): boolean {
  const allowed = ROLE_ASSIGNERS[target] ?? [];
  if (ctx.isSuperAdmin && allowed.includes('super_admin')) return true;
  if (ctx.isAdmin && allowed.includes('admin')) return true;
  if (isClusterCoordinator(ctx) && allowed.includes('cluster_coordinator')) return true;
  if (isNucleusCollaborator(ctx) && allowed.includes('nucleus_collaborator')) return true;
  return false;
}

// The set of roles this user can offer in a "create user" or "change role"
// dropdown. Order is hierarchy-descending so the UI lists naturally.
export function creatableRoles(ctx: CallerContext): CreatableRole[] {
  const all: CreatableRole[] = [
    'admin',
    'regional_viewer',
    'cluster_coordinator',
    'nucleus_collaborator',
    'activity_lead',
  ];
  return all.filter(r => canAssignRole(ctx, r));
}

export function canCreateUsers(ctx: CallerContext): boolean {
  return creatableRoles(ctx).length > 0;
}

// ============================================================
// Scope filters — "given this caller, which clusters/nuclei/
// activities may they assign as the scope of a new user?"
// ============================================================

export interface AssignableScopes {
  clusterIds: string[] | 'all'; // 'all' means no restriction
  nucleusIds: string[] | 'all';
  activityIds: string[] | 'all';
}

export function assignableScopes(ctx: CallerContext): AssignableScopes {
  if (ctx.isSuperAdmin || ctx.isAdmin) {
    return { clusterIds: 'all', nucleusIds: 'all', activityIds: 'all' };
  }
  if (isClusterCoordinator(ctx)) {
    return {
      clusterIds: coordinatorClusterIds(ctx),
      // nuclei + activities are filtered by membership in those clusters,
      // resolved in the data-loading layer (we don't list ids here without DB hits).
      nucleusIds: 'all',
      activityIds: 'all',
    };
  }
  if (isNucleusCollaborator(ctx)) {
    return {
      clusterIds: [],
      nucleusIds: collaboratorNucleusIds(ctx),
      activityIds: 'all',
    };
  }
  return { clusterIds: [], nucleusIds: [], activityIds: [] };
}

// ============================================================
// Action permission table.
//
// `direct` ⇒ user can perform the action directly.
// `request` ⇒ user can submit a request to a higher-level
//             reviewer; the action itself is not executed.
// `none`  ⇒ neither.
// ============================================================

export type ActionPermission = 'direct' | 'request' | 'none';

export type ManagedAction =
  | 'create_nucleus'
  | 'delete_nucleus'
  | 'create_activity'
  | 'delete_activity'
  | 'create_person'
  | 'delete_person'
  | 'edit_person'
  | 'edit_concentric_circles'
  | 'edit_network_structure'
  | 'edit_timeline_cycles'      // Edit Cluster Cycle Dates (timeline view)
  | 'manage_timeline_events'    // Add / Edit Cluster events (timeline view)
  | 'create_user'
  | 'delete_user'
  | 'change_user_permissions';

export interface ActionTarget {
  clusterId?: string | null;
  nucleusId?: string | null;
  activityId?: string | null;
}

// Cluster-level timeline events: super_admins, admins, and the cluster's
// coordinator(s) can create/edit/delete events. This mirrors the RLS policy
// "Cluster coordinators manage timeline events" in supabase/schema.sql.
// Nucleus-level timelines will get their own helper when that scope ships.
export function canManageClusterTimelineEvents(
  ctx: CallerContext,
  clusterId: string | null,
): boolean {
  if (ctx.isAdmin || ctx.isSuperAdmin) return true;
  if (!clusterId) return false;
  return coordinatorClusterIds(ctx).includes(clusterId);
}

// In-scope helpers.
function inOwnCluster(ctx: CallerContext, t: ActionTarget): boolean {
  if (!t.clusterId) return false;
  return coordinatorClusterIds(ctx).includes(t.clusterId);
}
function inOwnNucleus(ctx: CallerContext, t: ActionTarget): boolean {
  if (!t.nucleusId) return false;
  return collaboratorNucleusIds(ctx).includes(t.nucleusId);
}
function inOwnActivity(ctx: CallerContext, t: ActionTarget): boolean {
  if (!t.activityId) return false;
  return activityLeadActivityIds(ctx).includes(t.activityId);
}

// The big one. Returns 'direct' | 'request' | 'none'.
//
// `target` describes the entity being acted on:
//   - clusterId: cluster the action takes place in
//   - nucleusId: nucleus the action takes place in (if relevant)
//   - activityId: activity the action takes place in (if relevant)
//
// Callers should pass as much scope as they have — `inOwn*` helpers
// require the scope id to be present to evaluate ownership.
export function actionPermission(
  ctx: CallerContext,
  action: ManagedAction,
  target: ActionTarget = {}
): ActionPermission {
  // Super Admin / Admin: direct on everything (subject to safeguards
  // enforced separately for change_user_permissions / delete_user).
  if (ctx.isSuperAdmin || ctx.isAdmin) return 'direct';

  // Regional (View-Only): nothing.
  if (ctx.isRegionalViewer && !isClusterCoordinator(ctx)
      && !isNucleusCollaborator(ctx) && !isActivityLead(ctx)) {
    return 'none';
  }

  switch (action) {
    case 'create_nucleus':
      return inOwnCluster(ctx, target) ? 'direct' : 'none';

    case 'delete_nucleus':
      return inOwnCluster(ctx, target) ? 'direct' : 'none';

    case 'create_activity':
      if (inOwnCluster(ctx, target)) return 'direct';
      if (inOwnNucleus(ctx, target)) return 'direct';
      return 'none';

    case 'delete_activity':
      if (inOwnCluster(ctx, target)) return 'direct';
      if (inOwnNucleus(ctx, target)) return 'direct';
      // Activity Lead: request only (own activity)
      if (inOwnActivity(ctx, target)) return 'request';
      return 'none';

    case 'create_person':
      if (inOwnCluster(ctx, target)) return 'direct';
      if (inOwnNucleus(ctx, target)) return 'direct';
      if (inOwnActivity(ctx, target)) return 'direct';
      return 'none';

    case 'delete_person':
      if (inOwnCluster(ctx, target)) return 'direct';
      // Nucleus Coordinator: request only
      if (inOwnNucleus(ctx, target)) return 'request';
      // Activity Lead: request only (own activity)
      if (inOwnActivity(ctx, target)) return 'request';
      return 'none';

    case 'edit_person':
      if (inOwnCluster(ctx, target)) return 'direct';
      if (inOwnNucleus(ctx, target)) return 'direct';
      // Activity Lead: only participants in own activity (caller must
      // have already verified the person is on this activity's roster).
      if (inOwnActivity(ctx, target)) return 'direct';
      return 'none';

    case 'edit_concentric_circles':
    case 'edit_network_structure':
      if (inOwnCluster(ctx, target)) return 'direct';
      if (inOwnNucleus(ctx, target)) return 'direct';
      // Activity Lead: forbidden.
      return 'none';

    case 'edit_timeline_cycles':
    case 'manage_timeline_events':
      // Table: Super Admin / Admin / Cluster Coordinator only.
      // CCs are scoped to their own cluster; the timeline UI must filter
      // displayed cycles/events to the caller's cluster scope before
      // offering edits — handled in the Timeline component.
      if (inOwnCluster(ctx, target)) return 'direct';
      return 'none';

    case 'create_user':
      return canCreateUsers(ctx) ? 'direct' : 'none';

    case 'delete_user':
    case 'change_user_permissions':
      // CC and NC may submit a request, but not execute.
      if (isClusterCoordinator(ctx) || isNucleusCollaborator(ctx)) return 'request';
      return 'none';
  }
}

// Convenience wrappers used by call sites.
export function canDirectly(
  ctx: CallerContext, action: ManagedAction, target: ActionTarget = {}
): boolean {
  return actionPermission(ctx, action, target) === 'direct';
}
export function canRequest(
  ctx: CallerContext, action: ManagedAction, target: ActionTarget = {}
): boolean {
  return actionPermission(ctx, action, target) === 'request';
}

// ============================================================
// User-management safeguards (mirrors "Special Safeguards"
// and the constraints in "Delete users" / "Change permissions").
// ============================================================

export interface ManagedUserSummary {
  id: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isRegionalViewer: boolean;
  // The user_permissions rows attached to this user. May be empty
  // for global-only users (Super Admin / Admin / Regional).
  grants: PermissionGrant[];
}

function highestRole(u: ManagedUserSummary): Role {
  if (u.isSuperAdmin) return 'super_admin';
  if (u.isAdmin) return 'admin';
  if (u.grants.some(g => g.role === 'cluster_coordinator')) return 'cluster_coordinator';
  if (u.grants.some(g => g.role === 'nucleus_collaborator')) return 'nucleus_collaborator';
  if (u.grants.some(g => g.role === 'activity_lead')) return 'activity_lead';
  if (u.isRegionalViewer) return 'regional_viewer';
  return 'regional_viewer';
}

// "Cannot delete or demote themselves."
// "Admin: cannot delete Super Admins." / "Admin: cannot delete Admins."
export function canDeleteUserDirectly(ctx: CallerContext, target: ManagedUserSummary): boolean {
  if (target.id === ctx.userId) return false;             // self-safeguard
  if (target.isSuperAdmin) return false;                  // no one deletes a Super Admin via UI
  if (ctx.isSuperAdmin) return true;                       // Super deletes anyone (except self/super)
  if (ctx.isAdmin) return !target.isAdmin;                 // Admin can't delete other Admins
  return false;                                            // CC/NC/AL cannot delete directly
}

export function canRequestDeleteUser(ctx: CallerContext, target: ManagedUserSummary): boolean {
  if (target.id === ctx.userId) return false;
  // CC/NC may not target Super Admins or Admins even via the request flow.
  if (target.isSuperAdmin || target.isAdmin) return false;
  return isClusterCoordinator(ctx) || isNucleusCollaborator(ctx);
}

// "Change permissions" rules:
//   Super Admin: yes, except cannot demote Super Admins.
//   Admin: yes, except cannot demote Super Admins/Admins, and cannot promote anyone to Super Admin.
//   CC/NC: request only.
export function canChangeUserRoleDirectly(
  ctx: CallerContext,
  target: ManagedUserSummary,
  newRole: CreatableRole
): boolean {
  if (target.id === ctx.userId) return false;
  // No one can promote to super_admin via UI.
  if ((newRole as string) === 'super_admin') return false;

  // Caller must be allowed to assign `newRole` at all.
  if (!canAssignRole(ctx, newRole)) return false;

  if (ctx.isSuperAdmin) {
    // Super Admin can change anyone except cannot demote a Super Admin
    // (that would be self-implied; we already block self above and there
    // is at most one Super Admin in normal operation).
    if (target.isSuperAdmin) return false;
    return true;
  }

  if (ctx.isAdmin) {
    // Admins can't touch Super Admins or other Admins.
    if (target.isSuperAdmin || target.isAdmin) return false;
    return true;
  }

  return false; // CC/NC must use request flow
}

export function canRequestChangeUserRole(ctx: CallerContext, target: ManagedUserSummary): boolean {
  if (target.id === ctx.userId) return false;
  if (target.isSuperAdmin || target.isAdmin) return false; // out of CC/NC's reach even via request
  return isClusterCoordinator(ctx) || isNucleusCollaborator(ctx);
}

// Re-exported helper for badges/labels at call sites.
export { highestRole };
