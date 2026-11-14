// Shared milestone palette for the map: neighbourhood shading and
// nucleus pins use the same colour per stage. One distinct hue each
// (shades of a single colour were too hard to tell apart).
export type MilestoneLevel = 0 | 1 | 2 | 3;

export const MILESTONE_COLOR: Record<MilestoneLevel, string> = {
  0: '#ec4899', 1: '#f59e0b', 2: '#10b981', 3: '#6366f1',
};
export const MILESTONES = [0, 1, 2, 3] as const;
