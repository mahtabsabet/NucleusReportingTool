// Lane assignment for stacking overlapping events on a single track.
// Generic over the event shape; consumers project events to a {start,end}
// percentage interval before calling.

export interface LaneInterval {
  start: number; // percent 0..100
  end: number;   // percent 0..100
}

/**
 * Greedy lane packer. Returns an array `lanes[i]` giving the lane index for
 * the i-th input interval, plus the total number of lanes used. Inputs are
 * assumed to be sorted by start (longest-first as a tie-break is the
 * caller's responsibility).
 *
 * `gap` is the minimum percentage gap required between two intervals on the
 * same lane — prevents single-day events visually colliding.
 */
export function assignLanes(intervals: LaneInterval[], gap = 0.5): {
  lanes: number[];
  laneCount: number;
} {
  const rowEnds: number[] = [];
  const lanes: number[] = [];
  for (const iv of intervals) {
    let placed = false;
    for (let r = 0; r < rowEnds.length; r++) {
      if (iv.start >= rowEnds[r] + gap) {
        rowEnds[r] = iv.end;
        lanes.push(r);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rowEnds.push(iv.end);
      lanes.push(rowEnds.length - 1);
    }
  }
  return { lanes, laneCount: rowEnds.length };
}
