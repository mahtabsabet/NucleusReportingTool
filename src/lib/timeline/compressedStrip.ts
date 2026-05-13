import type { TimelineEvent } from '../../types';

// Pure helpers for the compressed dashboard timeline strip.
// The strip is an ambient temporal context: a glanceable window
// centered on today. The math lives here so the layout decisions
// (positioning, fading, visibility) can be unit-tested without
// rendering React.

export const VISIBLE_DAYS_EACH_SIDE = 10;
export const OPAQUE_DAYS_EACH_SIDE = 7;
export const MS_PER_DAY = 86_400_000;

export interface StripWindow {
  today: Date;
  start: Date;
  end: Date;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function buildStripWindow(now: Date = new Date()): StripWindow {
  const today = startOfDay(now);
  return {
    today,
    start: new Date(today.getTime() - VISIBLE_DAYS_EACH_SIDE * MS_PER_DAY),
    end: new Date(today.getTime() + VISIBLE_DAYS_EACH_SIDE * MS_PER_DAY),
  };
}

// 0 = window start, 1 = window end. Clamped so callers can rely on
// the result being a valid CSS percentage even when an event extends
// past the visible range.
export function toFraction(d: Date, win: StripWindow): number {
  const span = win.end.getTime() - win.start.getTime();
  if (span <= 0) return 0;
  const raw = (d.getTime() - win.start.getTime()) / span;
  return Math.max(0, Math.min(1, raw));
}

// Linear fade: opaque (1) inside ±OPAQUE_DAYS_EACH_SIDE, transparent
// (0) at/beyond ±VISIBLE_DAYS_EACH_SIDE, linear between. Communicates
// that the full timeline continues beyond the visible window.
export function opacityFor(d: Date, win: StripWindow): number {
  const distDays = Math.abs(d.getTime() - win.today.getTime()) / MS_PER_DAY;
  if (distDays <= OPAQUE_DAYS_EACH_SIDE) return 1;
  if (distDays >= VISIBLE_DAYS_EACH_SIDE) return 0;
  return (
    1 -
    (distDays - OPAQUE_DAYS_EACH_SIDE) /
      (VISIBLE_DAYS_EACH_SIDE - OPAQUE_DAYS_EACH_SIDE)
  );
}

// An item is visible if any part of its [start, end] range overlaps
// the strip window. Single-day items use start as a point.
export function isItemInWindow(
  item: TimelineEvent,
  win: StripWindow,
): boolean {
  const s = item.startDate.getTime();
  const e = item.endDate ? item.endDate.getTime() : s;
  return e >= win.start.getTime() && s <= win.end.getTime();
}

export function colorForItem(item: TimelineEvent): string {
  if (item.activityId) return 'bg-blue-500';
  if (item.itemType === 'meeting') return 'bg-amber-500';
  return 'bg-emerald-500';
}
