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
 * A real chronological Sunday→Saturday week, projected onto a visible
 * window (typically a calendar month or a cycle's clip of one).
 *
 * `weekStart` / `weekEnd` are the TRUE week boundaries (always 7 days
 * apart). `visibleStart` / `visibleEnd` are clipped to the input range.
 * `partialAt` tells the renderer which side(s) of the week were clipped
 * so it can fade those edges to indicate the week continues into the
 * adjacent month / outside the cycle.
 */
export interface ContinuousWeek {
  weekStart: Date;
  weekEnd: Date;
  visibleStart: Date;
  visibleEnd: Date;
  visibleDays: number;
  partialAt: 'none' | 'start' | 'end' | 'both';
  label: string;
}

/**
 * Continuous Sunday→Saturday weeks that intersect a visible window inside
 * a single calendar month.
 *
 * Behavior:
 *   • Weeks are NEVER reset at the first of the month — calendar weeks are
 *     globally continuous, the month-view is just a window onto them.
 *   • The result is numbered 1..N by position within the calendar month
 *     containing the visible window: the first Sun-Sat week that touches
 *     any day of that month is "Week 1", regardless of whether its Sunday
 *     falls in the previous month.
 *   • A week is included only if it intersects [visibleStart, visibleEnd];
 *     when the visible window is a partial-cycle clip (e.g. Jan 20–31)
 *     the early weeks are filtered out but their numbers are preserved,
 *     so a partial January in Cycle 4 reports Week 4 and Week 5 rather
 *     than restarting at 1.
 *   • Each week reports its true Sun-Sat span AND the clipped visible
 *     span, so the renderer can size the column proportional to the
 *     visible portion (a 3-day partial week is ~3/7 the width of a full
 *     week) and fade the clipped edge.
 *
 * The calendar month is inferred from `visibleStart.getMonth()` /
 * `getFullYear()`. Callers that want continuous weeks across a multi-month
 * range should call this once per month and concatenate.
 */
export function continuousWeeksInMonth(
  visibleStart: Date,
  visibleEnd: Date,
): ContinuousWeek[] {
  const monthStart = new Date(visibleStart.getFullYear(), visibleStart.getMonth(), 1);
  const monthEnd = new Date(visibleStart.getFullYear(), visibleStart.getMonth() + 1, 0);

  // First Sunday on or before the 1st of the month — that's the Sunday of
  // "Week 1" of this month, even if it falls in the previous month.
  const firstSunday = new Date(monthStart);
  firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay());

  const out: ContinuousWeek[] = [];
  let weekNum = 1;
  let cursor = new Date(firstSunday);
  while (cursor <= monthEnd) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);

    if (weekEnd >= visibleStart && weekStart <= visibleEnd) {
      const vStart = weekStart < visibleStart ? new Date(visibleStart) : new Date(weekStart);
      const vEnd = weekEnd > visibleEnd ? new Date(visibleEnd) : new Date(weekEnd);
      const visibleDays =
        Math.round((vEnd.getTime() - vStart.getTime()) / 86400000) + 1;
      const clippedAtStart = weekStart < visibleStart;
      const clippedAtEnd = weekEnd > visibleEnd;
      const partialAt: ContinuousWeek['partialAt'] =
        clippedAtStart && clippedAtEnd
          ? 'both'
          : clippedAtStart
            ? 'start'
            : clippedAtEnd
              ? 'end'
              : 'none';
      out.push({
        weekStart,
        weekEnd,
        visibleStart: vStart,
        visibleEnd: vEnd,
        visibleDays,
        partialAt,
        label: `Week ${weekNum}`,
      });
    }

    weekNum++;
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
  }

  return out;
}

export function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
