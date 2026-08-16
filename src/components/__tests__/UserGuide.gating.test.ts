import { describe, it, expect } from 'vitest';
import type { CallerContext, PermissionGrant } from '../../lib/permissions';
import {
  GUIDE_SECTIONS,
  seesNucleusLevel,
  seesClusterLevel,
  seesRolesAndPermissions,
  seesLsaHouseholds,
} from '../UserGuide';

function ctx(overrides: Partial<CallerContext> & { grants?: PermissionGrant[] } = {}): CallerContext {
  return {
    userId: 'u1',
    isSuperAdmin: false,
    isAdmin: false,
    isRegionalViewer: false,
    grants: [],
    ...overrides,
  };
}

const grant = (role: PermissionGrant['role'], scope: Partial<PermissionGrant> = {}): PermissionGrant => ({
  role,
  clusterId: null,
  nucleusId: null,
  activityId: null,
  ...scope,
});

const activityLead = ctx({ grants: [grant('activity_lead', { activityId: 'a1' })] });
const nucleusCoordinator = ctx({ grants: [grant('nucleus_collaborator', { nucleusId: 'n1' })] });
const clusterCoordinator = ctx({ grants: [grant('cluster_coordinator', { clusterId: 'c1' })] });
const regionalViewer = ctx({ isRegionalViewer: true });
const lsaMember = ctx({ grants: [grant('lsa_member', { clusterId: 'c1' })] });
const admin = ctx({ isAdmin: true });
const superAdmin = ctx({ isSuperAdmin: true, isAdmin: true });

describe('Guide section visibility predicates', () => {
  it('Nucleus level: visible to NC and above, not to Activity Lead', () => {
    expect(seesNucleusLevel(activityLead)).toBe(false);
    expect(seesNucleusLevel(nucleusCoordinator)).toBe(true);
    expect(seesNucleusLevel(clusterCoordinator)).toBe(true);
    expect(seesNucleusLevel(regionalViewer)).toBe(true);
    expect(seesNucleusLevel(lsaMember)).toBe(true);
    expect(seesNucleusLevel(admin)).toBe(true);
    expect(seesNucleusLevel(superAdmin)).toBe(true);
  });

  it('Cluster level: visible to CC and up, not to NC or Activity Lead', () => {
    expect(seesClusterLevel(activityLead)).toBe(false);
    expect(seesClusterLevel(nucleusCoordinator)).toBe(false);
    expect(seesClusterLevel(clusterCoordinator)).toBe(true);
    expect(seesClusterLevel(regionalViewer)).toBe(true);
    expect(seesClusterLevel(lsaMember)).toBe(true);
    expect(seesClusterLevel(admin)).toBe(true);
    expect(seesClusterLevel(superAdmin)).toBe(true);
  });

  it('Roles & permissions: Admin, Super Admin, and Regional Viewer only', () => {
    expect(seesRolesAndPermissions(activityLead)).toBe(false);
    expect(seesRolesAndPermissions(nucleusCoordinator)).toBe(false);
    expect(seesRolesAndPermissions(clusterCoordinator)).toBe(false);
    expect(seesRolesAndPermissions(lsaMember)).toBe(false);
    expect(seesRolesAndPermissions(regionalViewer)).toBe(true);
    expect(seesRolesAndPermissions(admin)).toBe(true);
    expect(seesRolesAndPermissions(superAdmin)).toBe(true);
  });

  it('LSA households: Super Admin + LSA Member only, plain Admin excluded', () => {
    expect(seesLsaHouseholds(admin)).toBe(false);
    expect(seesLsaHouseholds(superAdmin)).toBe(true);
    expect(seesLsaHouseholds(lsaMember)).toBe(true);
    expect(seesLsaHouseholds(clusterCoordinator)).toBe(false);
    expect(seesLsaHouseholds(regionalViewer)).toBe(false);
  });

  function visibleSectionIds(c: CallerContext): string[] {
    return GUIDE_SECTIONS.filter(s => !s.visibleTo || s.visibleTo(c)).map(s => s.id);
  }

  it('Activity Lead sees only the universal sections', () => {
    expect(visibleSectionIds(activityLead)).toEqual([
      'getting-around', 'activities', 'people', 'account',
    ]);
  });

  it('Nucleus Coordinator additionally sees Nucleus, but not Cluster/Roles/LSA', () => {
    const ids = visibleSectionIds(nucleusCoordinator);
    expect(ids).toContain('nucleus');
    expect(ids).not.toContain('cluster');
    expect(ids).not.toContain('roles');
    expect(ids).not.toContain('lsa');
  });

  it('Cluster Coordinator additionally sees Cluster, but not Roles/LSA', () => {
    const ids = visibleSectionIds(clusterCoordinator);
    expect(ids).toContain('nucleus');
    expect(ids).toContain('cluster');
    expect(ids).not.toContain('roles');
    expect(ids).not.toContain('lsa');
  });

  it('Regional Viewer sees everything except LSA households', () => {
    const ids = visibleSectionIds(regionalViewer);
    expect(ids).toContain('nucleus');
    expect(ids).toContain('cluster');
    expect(ids).toContain('roles');
    expect(ids).not.toContain('lsa');
  });

  it('LSA Member sees LSA households plus the ordinary read-only layers, not Roles', () => {
    const ids = visibleSectionIds(lsaMember);
    expect(ids).toContain('nucleus');
    expect(ids).toContain('cluster');
    expect(ids).toContain('lsa');
    expect(ids).not.toContain('roles');
  });

  it('Super Admin sees every section, including LSA households', () => {
    const allIds = GUIDE_SECTIONS.map(s => s.id);
    expect(visibleSectionIds(superAdmin)).toEqual(allIds);
  });

  it('plain Admin sees everything except LSA households', () => {
    const allIds = GUIDE_SECTIONS.map(s => s.id);
    expect(visibleSectionIds(admin)).toEqual(allIds.filter(id => id !== 'lsa'));
  });
});
