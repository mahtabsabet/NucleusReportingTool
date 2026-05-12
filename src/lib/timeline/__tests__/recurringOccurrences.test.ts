import { describe, it, expect } from 'vitest';
import { computeRecurringOccurrences } from '../recurringOccurrences';
import type { Activity } from '../../../types';

function activity(overrides: Partial<Activity>): Activity {
  return {
    id: 'a1',
    nucleusId: 'n1',
    name: 'JY Group',
    type: 'junior-youth',
    participants: {},
    lifecycle: 'active',
    schedulingMode: 'structured_recurring',
    daysOfWeek: [2], // Tuesday
    intervalWeeks: 1,
    startDate: new Date(2026, 0, 6), // 2026-01-06 = Tuesday
    ...overrides,
  };
}

const FAR_WINDOW = { start: new Date(2026, 0, 1), end: new Date(2026, 2, 31) };

describe('computeRecurringOccurrences', () => {
  it('returns empty for sporadic or short-duration activities', () => {
    expect(computeRecurringOccurrences(
      activity({ schedulingMode: 'sporadic_ongoing' }),
      FAR_WINDOW,
    )).toEqual([]);
    expect(computeRecurringOccurrences(
      activity({ schedulingMode: 'short_duration' }),
      FAR_WINDOW,
    )).toEqual([]);
  });

  it('returns empty when no days-of-week are selected', () => {
    expect(computeRecurringOccurrences(
      activity({ daysOfWeek: [] }),
      FAR_WINDOW,
    )).toEqual([]);
  });

  it('returns empty for cancelled activities', () => {
    expect(computeRecurringOccurrences(
      activity({ lifecycle: 'cancelled' }),
      FAR_WINDOW,
    )).toEqual([]);
  });

  it('emits one occurrence per week for weekly recurrence', () => {
    const out = computeRecurringOccurrences(activity({}), {
      start: new Date(2026, 0, 1),
      end: new Date(2026, 0, 31), // January 2026
    });
    // Tuesdays in Jan 2026: 6, 13, 20, 27.
    expect(out.map(o => o.startDate.getDate())).toEqual([6, 13, 20, 27]);
    expect(out.every(o => o.itemType === 'meeting')).toBe(true);
    expect(out.every(o => o.activityId === 'a1')).toBe(true);
  });

  it('respects intervalWeeks=2 (biweekly) anchored on the start date', () => {
    const out = computeRecurringOccurrences(activity({ intervalWeeks: 2 }), {
      start: new Date(2026, 0, 1),
      end: new Date(2026, 1, 28), // through Feb 2026
    });
    // Anchored on Tue Jan 6 — biweekly = Jan 6, Jan 20, Feb 3, Feb 17.
    expect(out.map(o => `${o.startDate.getMonth()}-${o.startDate.getDate()}`))
      .toEqual(['0-6', '0-20', '1-3', '1-17']);
  });

  it('supports multiple days-of-week in the same week', () => {
    const out = computeRecurringOccurrences(
      activity({ daysOfWeek: [2, 4] /* Tue + Thu */ }),
      {
        start: new Date(2026, 0, 1),
        end: new Date(2026, 0, 17),
      },
    );
    // Tue/Thu in Jan 2026 up to the 17th: Tue 6, Thu 8, Tue 13, Thu 15.
    expect(out.map(o => o.startDate.getDate())).toEqual([6, 8, 13, 15]);
  });

  it('stops at endDate for finite-range recurring activities', () => {
    const out = computeRecurringOccurrences(activity({
      endDate: new Date(2026, 0, 13), // stop after the second Tuesday
    }), {
      start: new Date(2026, 0, 1),
      end: new Date(2026, 0, 31),
    });
    expect(out.map(o => o.startDate.getDate())).toEqual([6, 13]);
  });

  it('stops at completedAt when the activity is completed without an explicit end', () => {
    const out = computeRecurringOccurrences(activity({
      lifecycle: 'completed',
      completedAt: new Date(2026, 0, 14),
    }), {
      start: new Date(2026, 0, 1),
      end: new Date(2026, 0, 31),
    });
    expect(out.map(o => o.startDate.getDate())).toEqual([6, 13]);
  });

  it('clamps to the requested window', () => {
    const out = computeRecurringOccurrences(activity({}), {
      start: new Date(2026, 0, 12), // mid-week
      end: new Date(2026, 0, 21),
    });
    // Tuesdays in the window: 13, 20.
    expect(out.map(o => o.startDate.getDate())).toEqual([13, 20]);
  });

  it('handles a start date that is NOT on any selected day-of-week', () => {
    const out = computeRecurringOccurrences(
      activity({
        // Start Sunday Jan 4; meets Tuesdays. First occurrence should
        // be Jan 6 (the Tuesday after Jan 4).
        startDate: new Date(2026, 0, 4),
        daysOfWeek: [2],
      }),
      { start: new Date(2026, 0, 1), end: new Date(2026, 0, 20) },
    );
    expect(out.map(o => o.startDate.getDate())).toEqual([6, 13, 20]);
  });

  it('produces stable synthetic ids per (activity, date)', () => {
    const out = computeRecurringOccurrences(activity({}), {
      start: new Date(2026, 0, 1),
      end: new Date(2026, 0, 31),
    });
    expect(out.map(o => o.id)).toEqual([
      'recur:a1:2026-01-06',
      'recur:a1:2026-01-13',
      'recur:a1:2026-01-20',
      'recur:a1:2026-01-27',
    ]);
  });
});
