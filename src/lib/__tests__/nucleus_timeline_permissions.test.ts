import { describe, it, expect } from 'vitest';
import {
  type CallerContext,
  canManageNucleusTimelineEvents,
} from '../permissions';

// Fixtures mirror the cluster permissions tests so the two checks
// read consistently — a single source of truth for who's CC of "C1"
// and NC of "N1".
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
const CC_C1 = ctx({
  grants: [{ role: 'cluster_coordinator', clusterId: 'C1', nucleusId: null, activityId: null }],
});
const NC_N1 = ctx({
  grants: [{ role: 'nucleus_collaborator', clusterId: null, nucleusId: 'N1', activityId: null }],
});
const AL_A1 = ctx({
  grants: [{ role: 'activity_lead', clusterId: null, nucleusId: null, activityId: 'A1' }],
});

describe('canManageNucleusTimelineEvents', () => {
  it('Super Admins and Admins manage every nucleus timeline', () => {
    expect(canManageNucleusTimelineEvents(SUPER, { clusterId: 'C1', nucleusId: 'N1' })).toBe(true);
    expect(canManageNucleusTimelineEvents(ADMIN, { clusterId: 'C9', nucleusId: 'N9' })).toBe(true);
  });

  it('Cluster Coordinator manages every nucleus in their cluster', () => {
    expect(canManageNucleusTimelineEvents(CC_C1, { clusterId: 'C1', nucleusId: 'N1' })).toBe(true);
    expect(canManageNucleusTimelineEvents(CC_C1, { clusterId: 'C1', nucleusId: 'N99' })).toBe(true);
  });

  it('Cluster Coordinator cannot manage nuclei in other clusters', () => {
    expect(canManageNucleusTimelineEvents(CC_C1, { clusterId: 'C2', nucleusId: 'N1' })).toBe(false);
  });

  it('Nucleus Coordinator manages their own nucleus regardless of cluster scope', () => {
    expect(canManageNucleusTimelineEvents(NC_N1, { clusterId: 'C9', nucleusId: 'N1' })).toBe(true);
    expect(canManageNucleusTimelineEvents(NC_N1, { clusterId: null, nucleusId: 'N1' })).toBe(true);
  });

  it('Nucleus Coordinator cannot manage other nuclei', () => {
    expect(canManageNucleusTimelineEvents(NC_N1, { clusterId: 'C1', nucleusId: 'N2' })).toBe(false);
  });

  it('Activity Lead and Regional viewers cannot manage nucleus timeline items', () => {
    expect(canManageNucleusTimelineEvents(AL_A1, { clusterId: 'C1', nucleusId: 'N1' })).toBe(false);
    expect(canManageNucleusTimelineEvents(REGIONAL, { clusterId: 'C1', nucleusId: 'N1' })).toBe(false);
  });
});
