// Date-range utilities shared across timeline scopes (cluster / nucleus /
// region). Pure functions only — no React, no DOM.

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

/** Return a new Date offset from `d` by `days` (can be negative). */
export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

/** Position of `date` within [rangeStart, rangeEnd] as a 0..100 percentage. */
export function getDatePercent(date: Date, rangeStart: Date, rangeEnd: Date): number {
  const total = rangeEnd.getTime() - rangeStart.getTime();
  if (total <= 0) return 0;
  return Math.max(
    0,
    Math.min(100, ((date.getTime() - rangeStart.getTime()) / total) * 100),
  );
}

/** Subdivide [start, end] into calendar months, clipped to the bounds. */
export function monthsInRange(start: Date, end: Date): DateRange[] {
  const out: DateRange[] = [];
  let curr = new Date(start);
  while (curr <= end) {
    const monthEnd = new Date(curr.getFullYear(), curr.getMonth() + 1, 0);
    const actualEnd = monthEnd > end ? end : monthEnd;
    out.push({
      start: new Date(curr),
      end: new Date(actualEnd),
      label: curr.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    });
    curr = new Date(curr.getFullYear(), curr.getMonth() + 1, 1);
  }
  return out;
}

/**
 * Subdivide [start, end] into 7-day chunks, clipped to the bounds.
 *
 * Each chunk is labeled by which week of its calendar month it falls in,
 * computed from the chunk's start day-of-month: 1–7 → Week 1, 8–14 → Week 2,
 * 15–21 → Week 3, 22–28 → Week 4, 29+ → Week 5.
 *
 * This is the user-facing rule: when a cycle starts mid-month (e.g. Jan
 * 20–31), the visible chunks should be labeled "Week 3" and "Week 4" —
 * their position in the WHOLE month — not "Week 1" / "Week 2". For months
 * that begin on day 1 the labels are 1..N, matching what a running counter
 * would have produced.
 */
export function weeksInRange(start: Date, end: Date): DateRange[] {
  const out: DateRange[] = [];
  let curr = new Date(start);
  while (curr <= end) {
    const weekEnd = new Date(curr);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const actualEnd = weekEnd > end ? end : weekEnd;
    const weekNum = Math.floor((curr.getDate() - 1) / 7) + 1;
    out.push({
      start: new Date(curr),
      end: new Date(actualEnd),
      label: `Week ${weekNum}`,
    });
    curr = new Date(actualEnd);
    curr.setDate(curr.getDate() + 1);
  }
  return out;
}

export function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
