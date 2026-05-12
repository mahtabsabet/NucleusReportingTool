import type { Activity, TimelineEvent } from '../../types';

// Synthesizes a TimelineEvent per occurrence of a structured-recurring
// activity within a date window. Used by the nucleus timeline so the
// strip shows every Tuesday (etc.) without persisting hundreds of
// timeline_events rows — a single source-of-truth activity row drives
// all of them, and any schedule edit is immediately reflected on the
// next render.
//
// Returns an empty array unless the activity is genuinely recurring
// (structured_recurring mode, not cancelled, has at least one day-of-
// week selected). Anchoring on `startDate` so biweekly / monthly
// activities fall on the right "every other" week from the start —
// e.g. starting on a Tuesday with intervalWeeks=2 produces occurrences
// on that Tuesday and every Tuesday two weeks later.

export interface RecurringWindow {
  start: Date;
  end: Date;
}

export function computeRecurringOccurrences(
  activity: Activity,
  window: RecurringWindow,
): TimelineEvent[] {
  if (activity.schedulingMode !== 'structured_recurring') return [];
  if (activity.lifecycle === 'cancelled') return [];
  if (!activity.daysOfWeek || activity.daysOfWeek.length === 0) return [];

  // Recurrence anchored on the activity's startDate (or window.start
  // as a defensive fallback). For a completed activity we cap at
  // endDate / completedAt so historical entries stop where they
  // actually stopped.
  const seriesStart = startOfDay(activity.startDate ?? window.start);
  const seriesEnd =
    activity.endDate
      ? startOfDay(activity.endDate)
      : activity.lifecycle === 'completed' && activity.completedAt
        ? startOfDay(activity.completedAt)
        : window.end;

  const iterStart = maxDate(seriesStart, window.start);
  const iterEnd = minDate(seriesEnd, window.end);
  if (iterStart > iterEnd) return [];

  const interval = Math.max(1, activity.intervalWeeks ?? 1);
  const out: TimelineEvent[] = [];

  for (const dow of activity.daysOfWeek) {
    // First occurrence of this day-of-week at or after seriesStart.
    let cursor = nextDayOfWeek(seriesStart, dow);
    // Skip forward in interval-week steps until we're inside the window.
    // Using setDate-based arithmetic keeps DST transitions correct
    // (vs. naïve epoch-ms math, which can drop or duplicate a day).
    while (cursor < iterStart) {
      cursor = addDays(cursor, 7 * interval);
    }
    while (cursor <= iterEnd) {
      out.push(makeOccurrence(activity, cursor));
      cursor = addDays(cursor, 7 * interval);
    }
  }

  out.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  return out;
}

function makeOccurrence(activity: Activity, date: Date): TimelineEvent {
  return {
    // Synthetic id — must be stable across renders so React's keyed
    // diff doesn't rebuild every marker on every pan/zoom. Encoding
    // both the activity id and the calendar date is sufficient.
    id: `recur:${activity.id}:${formatDateKey(date)}`,
    // Render as an event (blue dot above the centre axis) rather than
    // a meeting (amber diamond below) — recurring activities are part
    // of the nucleus's ongoing programme, not one-off meetings, and
    // visually mixing diamonds with the short-duration event bars
    // confused the read.
    itemType: 'event',
    name: activity.name,
    startDate: date,
    startTime: activity.time,
    nucleusId: activity.nucleusId,
    activityId: activity.id,
    attendees: [],
  };
}

function nextDayOfWeek(from: Date, dow: number): Date {
  const out = startOfDay(from);
  const delta = ((dow - out.getDay()) + 7) % 7;
  out.setDate(out.getDate() + delta);
  return out;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function formatDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
