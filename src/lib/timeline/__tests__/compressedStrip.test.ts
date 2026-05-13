import { describe, expect, it } from 'vitest';
import {
  buildStripWindow,
  colorForItem,
  isItemInWindow,
  MS_PER_DAY,
  OPAQUE_DAYS_EACH_SIDE,
  opacityFor,
  startOfDay,
  toFraction,
  VISIBLE_DAYS_EACH_SIDE,
} from '../compressedStrip';
import type { TimelineEvent } from '../../../types';

function eventAt(start: Date, end?: Date): TimelineEvent {
  return {
    id: `e-${start.getTime()}-${end?.getTime() ?? 'p'}`,
    itemType: 'event',
    name: 'fixture',
    startDate: start,
    endDate: end,
    attendees: [],
  };
}

const NOW = new Date(2026, 4, 13, 14, 32, 17, 500);

describe('buildStripWindow', () => {
  it('anchors today at midnight and spans ±VISIBLE_DAYS_EACH_SIDE around it', () => {
    const w = buildStripWindow(NOW);
    expect(w.today).toEqual(startOfDay(NOW));
    expect(w.start.getTime()).toEqual(
      w.today.getTime() - VISIBLE_DAYS_EACH_SIDE * MS_PER_DAY,
    );
    expect(w.end.getTime()).toEqual(
      w.today.getTime() + VISIBLE_DAYS_EACH_SIDE * MS_PER_DAY,
    );
  });
});

describe('toFraction', () => {
  const win = buildStripWindow(NOW);

  it('maps today to the middle of the strip', () => {
    expect(toFraction(win.today, win)).toBeCloseTo(0.5, 10);
  });

  it('maps window edges to 0 and 1', () => {
    expect(toFraction(win.start, win)).toBe(0);
    expect(toFraction(win.end, win)).toBe(1);
  });

  it('clamps points outside the window into [0, 1]', () => {
    const wayBefore = new Date(win.start.getTime() - 5 * MS_PER_DAY);
    const wayAfter = new Date(win.end.getTime() + 5 * MS_PER_DAY);
    expect(toFraction(wayBefore, win)).toBe(0);
    expect(toFraction(wayAfter, win)).toBe(1);
  });
});

describe('opacityFor', () => {
  const win = buildStripWindow(NOW);

  it('is fully opaque inside the ±OPAQUE_DAYS_EACH_SIDE core', () => {
    expect(opacityFor(win.today, win)).toBe(1);
    const inside = new Date(
      win.today.getTime() + OPAQUE_DAYS_EACH_SIDE * MS_PER_DAY,
    );
    expect(opacityFor(inside, win)).toBe(1);
  });

  it('fully transparent at and beyond the visible edge', () => {
    expect(opacityFor(win.start, win)).toBe(0);
    expect(opacityFor(win.end, win)).toBe(0);
    const wayPast = new Date(win.start.getTime() - 30 * MS_PER_DAY);
    expect(opacityFor(wayPast, win)).toBe(0);
  });

  it('fades linearly between the opaque core and the visible edge', () => {
    const span = VISIBLE_DAYS_EACH_SIDE - OPAQUE_DAYS_EACH_SIDE;
    // Halfway through the fade band on each side should be ~0.5.
    const halfwayFuture = new Date(
      win.today.getTime() +
        (OPAQUE_DAYS_EACH_SIDE + span / 2) * MS_PER_DAY,
    );
    const halfwayPast = new Date(
      win.today.getTime() -
        (OPAQUE_DAYS_EACH_SIDE + span / 2) * MS_PER_DAY,
    );
    expect(opacityFor(halfwayFuture, win)).toBeCloseTo(0.5, 10);
    expect(opacityFor(halfwayPast, win)).toBeCloseTo(0.5, 10);
  });
});

describe('isItemInWindow', () => {
  const win = buildStripWindow(NOW);

  it('keeps a point event sitting on today', () => {
    expect(isItemInWindow(eventAt(win.today), win)).toBe(true);
  });

  it('drops events that ended before the window started', () => {
    const before = new Date(win.start.getTime() - 2 * MS_PER_DAY);
    expect(isItemInWindow(eventAt(before), win)).toBe(false);
  });

  it('drops events that start after the window ends', () => {
    const after = new Date(win.end.getTime() + 2 * MS_PER_DAY);
    expect(isItemInWindow(eventAt(after), win)).toBe(false);
  });

  it('keeps multi-day events whose range overlaps the window edge', () => {
    const start = new Date(win.start.getTime() - 3 * MS_PER_DAY);
    const end = new Date(win.start.getTime() + 1 * MS_PER_DAY);
    expect(isItemInWindow(eventAt(start, end), win)).toBe(true);
  });
});

describe('colorForItem', () => {
  it('uses blue for activity-derived rows', () => {
    const item: TimelineEvent = {
      id: 'a',
      itemType: 'event',
      name: 'study circle',
      startDate: NOW,
      activityId: 'act-1',
      attendees: [],
    };
    expect(colorForItem(item)).toBe('bg-blue-500');
  });

  it('uses amber for standalone meetings', () => {
    const item: TimelineEvent = {
      id: 'b',
      itemType: 'meeting',
      name: 'cluster meeting',
      startDate: NOW,
      attendees: [],
    };
    expect(colorForItem(item)).toBe('bg-amber-500');
  });

  it('uses emerald for standalone events', () => {
    const item: TimelineEvent = {
      id: 'c',
      itemType: 'event',
      name: 'community gathering',
      startDate: NOW,
      attendees: [],
    };
    expect(colorForItem(item)).toBe('bg-emerald-500');
  });
});
