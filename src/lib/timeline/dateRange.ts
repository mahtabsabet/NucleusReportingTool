// Date-range utilities shared across timeline scopes (cluster / nucleus /
// region). Pure functions only — no React, no DOM.

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
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

/** Subdivide [start, end] into 7-day weeks, clipped to the bounds. */
export function weeksInRange(start: Date, end: Date): DateRange[] {
  const out: DateRange[] = [];
  let curr = new Date(start);
  let weekNum = 1;
  while (curr <= end) {
    const weekEnd = new Date(curr);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const actualEnd = weekEnd > end ? end : weekEnd;
    out.push({
      start: new Date(curr),
      end: new Date(actualEnd),
      label: `Week ${weekNum}`,
    });
    curr = new Date(actualEnd);
    curr.setDate(curr.getDate() + 1);
    weekNum++;
  }
  return out;
}

export function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
