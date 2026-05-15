import { describe, it, expect } from 'vitest';
import {
  type CallerContext,
  type ManagedAction,
  type ManagedUserSummary,
  type PermissionGrant,
  actionPermission,
  canAssignRole,
  canChangeUserRoleDirectly,
  canDeleteUserDirectly,
  canManageClusterTimelineEvents,
  canRequestChangeUserRole,
  canRequestDeleteUser,
  canResetUserPasswordDirectly,
  creatableRoles,
  isRegionalOnly,
  primaryRole,
  roleLabel,
  scopeRequirementFor,
} from '../permissions';

// ---- Fixtures ----------------------------------------------------------

function ctx(overrides: Partial<CallerContext>): CallerContext {
  return {
    userId: overrides.userId ?? 'self',
    isSuperAdmin: false,
    isAdmin: false,
    isRegionalViewer: false,
    grants: [],
    ...overrides,
  };
}

const SUPER = ctx({ isSuperAdmin: true, isAdmin: true });
const ADMIN = ctx({ isAdmin: true });
const REGIONAL = ctx({ isRegionalViewer: true });
const CC = ctx({
  grants: [{ role: 'cluster_coordinator', clusterId: 'C1', nucleusId: null, activityId: null }],
});
const NC = ctx({
  grants: [{ role: 'nucleus_collaborator', clusterId: null, nucleusId: 'N1', activityId: null }],
});
const AL = ctx({
  grants: [{ role: 'activity_lead', clusterId: null, nucleusId: null, activityId: 'A1' }],
});

function summary(overrides: Partial<ManagedUserSummary>): ManagedUserSummary {
  return {
    id: 'u',
    isSuperAdmin: false,
    isAdmin: false,
    isRegionalViewer: false,
    grants: [],
    ...overrides,
  };
}

// ---- creatableRoles per row of the table ------------------------------

describe('creatableRoles', () => {
  it('Super Admin can assign Admin / Regional / CC / NC / AL (no Super Admin)', () => {
    expect(creatableRoles(SUPER)).toEqual([
      'admin', 'regional_viewer', 'cluster_coordinator', 'nucleus_collaborator', 'activity_lead',
    ]);
  });

  it('Admin cannot assign Admin (Super Admin only) but can assign everything else', () => {
    expect(creatableRoles(ADMIN)).toEqual([
      'regional_viewer', 'cluster_coordinator', 'nucleus_collaborator', 'activity_lead',
    ]);
  });

  it('Cluster Coordinator can assign CC / NC / AL only', () => {
    expect(creatableRoles(CC)).toEqual([
      'cluster_coordinator', 'nucleus_collaborator', 'activity_lead',
    ]);
  });

  it('Nucleus Coordinator can assign Activity Lead only', () => {
    expect(creatableRoles(NC)).toEqual(['activity_lead']);
  });

  it('Activity Lead and Regional Viewer cannot assign any role', () => {
    expect(creatableRoles(AL)).toEqual([]);
    expect(creatableRoles(REGIONAL)).toEqual([]);
  });
});

// ---- canAssignRole single-role checks ---------------------------------

describe('canAssignRole', () => {
  it('promotion to Super Admin is impossible for everyone (UI never offers it)', () => {
    // Super Admin isn't a creatable role at all — `canAssignRole` accepts
    // CreatableRole, so just confirm the table entries are correct.
    expect(canAssignRole(SUPER, 'admin')).toBe(true);
    expect(canAssignRole(ADMIN, 'admin')).toBe(false);
  });

  it('NC cannot assign NC, CC, regional, or admin', () => {
    expect(canAssignRole(NC, 'nucleus_collaborator')).toBe(false);
    expect(canAssignRole(NC, 'cluster_coordinator')).toBe(false);
    expect(canAssignRole(NC, 'regional_viewer')).toBe(false);
    expect(canAssignRole(NC, 'admin')).toBe(false);
    expect(canAssignRole(NC, 'activity_lead')).toBe(true);
  });
});

// ---- scopeRequirementFor ----------------------------------------------

describe('scopeRequirementFor', () => {
  it('matches the table', () => {
    expect(scopeRequirementFor('admin')).toBe('none');
    expect(scopeRequirementFor('regional_viewer')).toBe('none');
    expect(scopeRequirementFor('cluster_coordinator')).toBe('cluster');
    expect(scopeRequirementFor('nucleus_collaborator')).toBe('nucleus');
    expect(scopeRequirementFor('activity_lead')).toBe('activity');
  });
});

// ---- actionPermission --------------------------------------------------

describe('actionPermission', () => {
  it('Super Admin / Admin can do everything directly', () => {
    expect(actionPermission(SUPER, 'delete_person', { nucleusId: 'X' })).toBe('direct');
    expect(actionPermission(ADMIN, 'delete_user')).toBe('direct');
  });

  it('Regional Viewer can do nothing', () => {
    expect(actionPermission(REGIONAL, 'delete_person', { nucleusId: 'N1' })).toBe('none');
    expect(actionPermission(REGIONAL, 'create_person', { nucleusId: 'N1' })).toBe('none');
  });

  it('Cluster Coordinator: direct on own cluster, none elsewhere', () => {
    expect(actionPermission(CC, 'delete_nucleus', { clusterId: 'C1' })).toBe('direct');
    expect(actionPermission(CC, 'delete_nucleus', { clusterId: 'OTHER' })).toBe('none');
    expect(actionPermission(CC, 'create_activity', { clusterId: 'C1', nucleusId: 'N1' })).toBe('direct');
  });

  it('Nucleus Coordinator: direct edits in own nucleus, request-only deletes for persons', () => {
    expect(actionPermission(NC, 'edit_concentric_circles', { nucleusId: 'N1' })).toBe('direct');
    expect(actionPermission(NC, 'create_activity', { nucleusId: 'N1' })).toBe('direct');
    expect(actionPermission(NC, 'delete_person', { nucleusId: 'N1' })).toBe('request');
    expect(actionPermission(NC, 'delete_person', { nucleusId: 'OTHER' })).toBe('none');
  });

  it('Activity Lead: edit own activity participants only, no circles, request-only deletes', () => {
    expect(actionPermission(AL, 'create_person', { activityId: 'A1' })).toBe('direct');
    expect(actionPermission(AL, 'edit_concentric_circles', { activityId: 'A1' })).toBe('none');
    expect(actionPermission(AL, 'delete_person', { activityId: 'A1' })).toBe('request');
    expect(actionPermission(AL, 'delete_activity', { activityId: 'A1' })).toBe('request');
    expect(actionPermission(AL, 'delete_activity', { activityId: 'OTHER' })).toBe('none');
  });

  it('CC: full coverage of cluster-scoped write actions', () => {
    expect(actionPermission(CC, 'create_nucleus', { clusterId: 'C1' })).toBe('direct');
    expect(actionPermission(CC, 'create_nucleus', { clusterId: 'OTHER' })).toBe('none');
    expect(actionPermission(CC, 'delete_activity', { clusterId: 'C1' })).toBe('direct');
    expect(actionPermission(CC, 'delete_activity', { clusterId: 'OTHER' })).toBe('none');
    expect(actionPermission(CC, 'create_person', { clusterId: 'C1' })).toBe('direct');
    expect(actionPermission(CC, 'edit_person', { clusterId: 'C1' })).toBe('direct');
    expect(actionPermission(CC, 'edit_person', { clusterId: 'OTHER' })).toBe('none');
    expect(actionPermission(CC, 'edit_concentric_circles', { clusterId: 'C1' })).toBe('direct');
    expect(actionPermission(CC, 'edit_concentric_circles', { clusterId: 'OTHER' })).toBe('none');
    expect(actionPermission(CC, 'edit_network_structure', { clusterId: 'C1' })).toBe('direct');
    expect(actionPermission(CC, 'edit_network_structure', { clusterId: 'OTHER' })).toBe('none');
  });

  it('NC: full coverage of nucleus-scoped write actions', () => {
    expect(actionPermission(NC, 'delete_activity', { nucleusId: 'N1' })).toBe('direct');
    expect(actionPermission(NC, 'delete_activity', { nucleusId: 'OTHER' })).toBe('none');
    expect(actionPermission(NC, 'create_person', { nucleusId: 'N1' })).toBe('direct');
    expect(actionPermission(NC, 'edit_person', { nucleusId: 'N1' })).toBe('direct');
    expect(actionPermission(NC, 'edit_person', { nucleusId: 'OTHER' })).toBe('none');
    expect(actionPermission(NC, 'edit_network_structure', { nucleusId: 'N1' })).toBe('direct');
    expect(actionPermission(NC, 'edit_network_structure', { nucleusId: 'OTHER' })).toBe('none');
    expect(actionPermission(NC, 'create_nucleus', { clusterId: 'C1' })).toBe('none');
  });

  it('AL: edit_person direct in own activity only; edit_network_structure and create_nucleus always none', () => {
    expect(actionPermission(AL, 'edit_person', { activityId: 'A1' })).toBe('direct');
    expect(actionPermission(AL, 'edit_person', { activityId: 'OTHER' })).toBe('none');
    expect(actionPermission(AL, 'edit_person', { nucleusId: 'N1' })).toBe('none');
    expect(actionPermission(AL, 'edit_network_structure', { activityId: 'A1' })).toBe('none');
    expect(actionPermission(AL, 'create_nucleus', { clusterId: 'C1' })).toBe('none');
  });

  it('Regional Viewer: all write actions return none regardless of scope', () => {
    const write: ManagedAction[] = [
      'create_nucleus', 'delete_nucleus', 'create_activity', 'delete_activity',
      'create_person', 'delete_person', 'edit_person',
      'edit_concentric_circles', 'edit_network_structure',
    ];
    const scope = { clusterId: 'X', nucleusId: 'X', activityId: 'X' };
    for (const action of write) {
      expect(actionPermission(REGIONAL, action, scope)).toBe('none');
    }
  });

  it('CC/NC use request flow for delete_user / change_user_permissions', () => {
    expect(actionPermission(CC, 'delete_user')).toBe('request');
    expect(actionPermission(NC, 'change_user_permissions')).toBe('request');
    expect(actionPermission(AL, 'delete_user')).toBe('none');
  });

  it('edit_timeline_cycles: Admin / CC only, cluster-scoped', () => {
    // Globally allowed
    expect(actionPermission(SUPER, 'edit_timeline_cycles')).toBe('direct');
    expect(actionPermission(ADMIN, 'edit_timeline_cycles')).toBe('direct');
    // CC only within own cluster
    expect(actionPermission(CC, 'edit_timeline_cycles', { clusterId: 'C1' })).toBe('direct');
    expect(actionPermission(CC, 'edit_timeline_cycles', { clusterId: 'OTHER' })).toBe('none');
    // NC, AL, Regional: never (cycles are cluster-administrative; a
    // nucleus inherits its parent cluster's cycles, it can't fork them)
    expect(actionPermission(NC, 'edit_timeline_cycles', { clusterId: 'C1', nucleusId: 'N1' })).toBe('none');
    expect(actionPermission(AL, 'edit_timeline_cycles', { clusterId: 'C1' })).toBe('none');
    expect(actionPermission(REGIONAL, 'edit_timeline_cycles')).toBe('none');
  });

  it('manage_timeline_events / _meetings / _notes: CC of cluster OR NC of own nucleus', () => {
    // Globally allowed
    expect(actionPermission(SUPER, 'manage_timeline_events')).toBe('direct');
    expect(actionPermission(ADMIN, 'manage_timeline_meetings')).toBe('direct');
    expect(actionPermission(ADMIN, 'manage_timeline_notes')).toBe('direct');
    // CC within own cluster
    expect(actionPermission(CC, 'manage_timeline_events', { clusterId: 'C1' })).toBe('direct');
    expect(actionPermission(CC, 'manage_timeline_meetings', { clusterId: 'C1' })).toBe('direct');
    expect(actionPermission(CC, 'manage_timeline_notes', { clusterId: 'C1' })).toBe('direct');
    expect(actionPermission(CC, 'manage_timeline_meetings', { clusterId: 'OTHER' })).toBe('none');
    // NC within own nucleus — matches the canManageNucleusTimelineEvents
    // helper and the timeline_events RLS in the 20260512 migration.
    expect(actionPermission(NC, 'manage_timeline_events', { nucleusId: 'N1' })).toBe('direct');
    expect(actionPermission(NC, 'manage_timeline_meetings', { nucleusId: 'N1' })).toBe('direct');
    expect(actionPermission(NC, 'manage_timeline_notes', { nucleusId: 'N1' })).toBe('direct');
    expect(actionPermission(NC, 'manage_timeline_events', { nucleusId: 'OTHER' })).toBe('none');
    // AL, Regional: never
    expect(actionPermission(AL, 'manage_timeline_events', { clusterId: 'C1' })).toBe('none');
    expect(actionPermission(REGIONAL, 'manage_timeline_meetings')).toBe('none');
  });
});

// ---- User-management safeguards ---------------------------------------

describe('user-management safeguards', () => {
  it('no one can delete a Super Admin via UI (incl. another Super Admin)', () => {
    const target = summary({ id: 'other', isSuperAdmin: true, isAdmin: true });
    expect(canDeleteUserDirectly(SUPER, target)).toBe(false);
    expect(canDeleteUserDirectly(ADMIN, target)).toBe(false);
  });

  it('Admin cannot delete another Admin', () => {
    const otherAdmin = summary({ id: 'other', isAdmin: true });
    expect(canDeleteUserDirectly(ADMIN, otherAdmin)).toBe(false);
  });

  it('Super Admin can delete an Admin', () => {
    const otherAdmin = summary({ id: 'other', isAdmin: true });
    expect(canDeleteUserDirectly(SUPER, otherAdmin)).toBe(true);
  });

  it('cannot delete or demote yourself', () => {
    const me = summary({ id: 'self', isAdmin: true });
    expect(canDeleteUserDirectly(ADMIN, me)).toBe(false);
    expect(canChangeUserRoleDirectly(ADMIN, me, 'regional_viewer')).toBe(false);
  });

  it('Admins cannot promote anyone to Super Admin (no creatable Super Admin path)', () => {
    expect(canChangeUserRoleDirectly(ADMIN, summary({ id: 'x' }), 'super_admin' as any)).toBe(false);
    expect(canChangeUserRoleDirectly(SUPER, summary({ id: 'x' }), 'super_admin' as any)).toBe(false);
  });

  it('CC and NC must use request flow for user deletion / role change', () => {
    const target = summary({
      id: 'x',
      grants: [{ role: 'activity_lead', clusterId: null, nucleusId: null, activityId: 'A' } as PermissionGrant],
    });
    expect(canDeleteUserDirectly(CC, target)).toBe(false);
    expect(canRequestDeleteUser(CC, target)).toBe(true);
    expect(canDeleteUserDirectly(NC, target)).toBe(false);
    expect(canRequestDeleteUser(NC, target)).toBe(true);
    expect(canRequestChangeUserRole(CC, target)).toBe(true);
  });

  it('CC/NC cannot even request actions on a Super Admin or Admin target', () => {
    const adminTarget = summary({ id: 'x', isAdmin: true });
    const superTarget = summary({ id: 'x', isAdmin: true, isSuperAdmin: true });
    expect(canRequestDeleteUser(CC, adminTarget)).toBe(false);
    expect(canRequestDeleteUser(CC, superTarget)).toBe(false);
    expect(canRequestChangeUserRole(NC, adminTarget)).toBe(false);
  });

  // Reset-password safeguards mirror delete-user; covered alongside so a
  // change to one rule is loud about the other.
  describe('canResetUserPasswordDirectly', () => {
    it('cannot reset your own password through this path', () => {
      const me = summary({ id: 'self', isAdmin: true });
      expect(canResetUserPasswordDirectly(ADMIN, me)).toBe(false);
    });

    it('no one can reset a Super Admin via the admin UI', () => {
      const target = summary({ id: 'other', isSuperAdmin: true, isAdmin: true });
      expect(canResetUserPasswordDirectly(SUPER, target)).toBe(false);
      expect(canResetUserPasswordDirectly(ADMIN, target)).toBe(false);
    });

    it('Admin can reset a non-admin user', () => {
      const target = summary({ id: 'other' });
      expect(canResetUserPasswordDirectly(ADMIN, target)).toBe(true);
    });

    it('Admin cannot reset another Admin; Super Admin can', () => {
      const otherAdmin = summary({ id: 'other', isAdmin: true });
      expect(canResetUserPasswordDirectly(ADMIN, otherAdmin)).toBe(false);
      expect(canResetUserPasswordDirectly(SUPER, otherAdmin)).toBe(true);
    });

    it('CC/NC/AL/Regional cannot reset anyone through this path', () => {
      const target = summary({ id: 'other' });
      expect(canResetUserPasswordDirectly(CC, target)).toBe(false);
      expect(canResetUserPasswordDirectly(NC, target)).toBe(false);
      expect(canResetUserPasswordDirectly(AL, target)).toBe(false);
      expect(canResetUserPasswordDirectly(REGIONAL, target)).toBe(false);
    });
  });
});

// ---- Misc -------------------------------------------------------------

describe('misc', () => {
  it('primaryRole picks the highest privilege a user holds', () => {
    expect(primaryRole(SUPER)).toBe('super_admin');
    expect(primaryRole(ADMIN)).toBe('admin');
    expect(primaryRole(CC)).toBe('cluster_coordinator');
    expect(primaryRole(NC)).toBe('nucleus_collaborator');
    expect(primaryRole(AL)).toBe('activity_lead');
    expect(primaryRole(REGIONAL)).toBe('regional_viewer');
  });

  it('isRegionalOnly is true only for view-only regional users', () => {
    expect(isRegionalOnly(REGIONAL)).toBe(true);
    expect(isRegionalOnly(SUPER)).toBe(false);
    expect(isRegionalOnly(ADMIN)).toBe(false);
    expect(isRegionalOnly(CC)).toBe(false);
    expect(isRegionalOnly(NC)).toBe(false);
    expect(isRegionalOnly(AL)).toBe(false);
    // A regional viewer who also holds a scoped grant is not view-only.
    const regionalCC = ctx({
      isRegionalViewer: true,
      grants: [{ role: 'cluster_coordinator', clusterId: 'C1', nucleusId: null, activityId: null }],
    });
    expect(isRegionalOnly(regionalCC)).toBe(false);
  });

  it('roleLabel covers every role', () => {
    expect(roleLabel('super_admin')).toBe('Super Admin');
    expect(roleLabel('admin')).toBe('Administrator');
    expect(roleLabel('regional_viewer')).toBe('Regional (View-Only)');
    expect(roleLabel('cluster_coordinator')).toBe('Cluster Coordinator');
    expect(roleLabel('nucleus_collaborator')).toBe('Nucleus Coordinator');
    expect(roleLabel('activity_lead')).toBe('Activity Lead');
  });
});

describe('canManageClusterTimelineEvents', () => {
  it('allows super admins and admins for any cluster', () => {
    expect(canManageClusterTimelineEvents(SUPER, 'C1')).toBe(true);
    expect(canManageClusterTimelineEvents(ADMIN, 'C2')).toBe(true);
    expect(canManageClusterTimelineEvents(SUPER, null)).toBe(true);
  });

  it('allows the cluster coordinator only for their own cluster', () => {
    expect(canManageClusterTimelineEvents(CC, 'C1')).toBe(true);
    expect(canManageClusterTimelineEvents(CC, 'C2')).toBe(false);
    expect(canManageClusterTimelineEvents(CC, null)).toBe(false);
  });

  it('denies regional viewers, nucleus coordinators, and activity leads', () => {
    expect(canManageClusterTimelineEvents(REGIONAL, 'C1')).toBe(false);
    expect(canManageClusterTimelineEvents(NC, 'C1')).toBe(false);
    expect(canManageClusterTimelineEvents(AL, 'C1')).toBe(false);
  });
});
