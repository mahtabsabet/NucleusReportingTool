import { describe, it, expect } from 'vitest';
import { continuousWeeksInMonth } from '../dateRange';

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d);

function summary(w: ReturnType<typeof continuousWeeksInMonth>[number]) {
  return {
    label: w.label,
    weekStart: w.weekStart.toDateString(),
    weekEnd: w.weekEnd.toDateString(),
    visibleStart: w.visibleStart.toDateString(),
    visibleEnd: w.visibleEnd.toDateString(),
    visibleDays: w.visibleDays,
    partialAt: w.partialAt,
  };
}

describe('continuousWeeksInMonth', () => {
  it('returns 5 Sun-Sat weeks for full June 2026, with partial start and partial end', () => {
    // Jun 1, 2026 is a Monday. Week 1 = May 31–Jun 6 (visible Jun 1–6).
    // Week 5 = Jun 28–Jul 4 (visible Jun 28–30).
    const weeks = continuousWeeksInMonth(D(2026, 6, 1), D(2026, 6, 30));
    expect(weeks).toHaveLength(5);
    expect(summary(weeks[0])).toEqual({
      label: 'Week 1',
      weekStart: D(2026, 5, 31).toDateString(),
      weekEnd: D(2026, 6, 6).toDateString(),
      visibleStart: D(2026, 6, 1).toDateString(),
      visibleEnd: D(2026, 6, 6).toDateString(),
      visibleDays: 6,
      partialAt: 'start',
    });
    expect(weeks[1].partialAt).toBe('none');
    expect(weeks[1].visibleDays).toBe(7);
    expect(summary(weeks[4])).toEqual({
      label: 'Week 5',
      weekStart: D(2026, 6, 28).toDateString(),
      weekEnd: D(2026, 7, 4).toDateString(),
      visibleStart: D(2026, 6, 28).toDateString(),
      visibleEnd: D(2026, 6, 30).toDateString(),
      visibleDays: 3,
      partialAt: 'end',
    });
  });

  it('starts cleanly when month begins on Sunday (no partial-start)', () => {
    // Feb 1, 2026 is a Sunday.
    const weeks = continuousWeeksInMonth(D(2026, 2, 1), D(2026, 2, 28));
    expect(weeks[0].partialAt).toBe('none');
    expect(weeks[0].visibleDays).toBe(7);
    expect(weeks[0].weekStart.getDate()).toBe(1);
  });

  it('preserves week numbering when the visible window is a partial-cycle clip of January 2026', () => {
    // Cycle 4 covers Jan 20–Apr 19, 2026; in month-view of January we only
    // see Jan 20–31. Globally continuous weeks intersecting January are:
    //   Week 1: Dec 28–Jan 3
    //   Week 2: Jan 4–Jan 10
    //   Week 3: Jan 11–Jan 17
    //   Week 4: Jan 18–Jan 24  ← visible (Jan 20–24)
    //   Week 5: Jan 25–Jan 31  ← visible (full)
    const weeks = continuousWeeksInMonth(D(2026, 1, 20), D(2026, 1, 31));
    expect(weeks.map(w => w.label)).toEqual(['Week 4', 'Week 5']);
    expect(weeks[0].partialAt).toBe('start');
    expect(weeks[0].visibleStart.getDate()).toBe(20);
    expect(weeks[0].visibleDays).toBe(5);
    expect(weeks[1].partialAt).toBe('none');
    expect(weeks[1].visibleDays).toBe(7);
  });

  it('handles cross-month continuity: the same calendar week appears as Week N in one month-view and Week 1 in the next', () => {
    // June's last week and July's first week are the SAME chronological
    // week (Jun 28–Jul 4). When the user navigates to July they should
    // see its continuation, not a different week starting fresh.
    const juneTail = continuousWeeksInMonth(D(2026, 6, 1), D(2026, 6, 30));
    const julyHead = continuousWeeksInMonth(D(2026, 7, 1), D(2026, 7, 31));
    const lastJune = juneTail[juneTail.length - 1];
    const firstJuly = julyHead[0];
    expect(lastJune.weekStart.toDateString()).toBe(firstJuly.weekStart.toDateString());
    expect(lastJune.weekEnd.toDateString()).toBe(firstJuly.weekEnd.toDateString());
    expect(lastJune.visibleEnd.toDateString()).toBe(D(2026, 6, 30).toDateString());
    expect(firstJuly.visibleStart.toDateString()).toBe(D(2026, 7, 1).toDateString());
    expect(lastJune.partialAt).toBe('end');
    expect(firstJuly.partialAt).toBe('start');
  });

  it('returns a single both-sides-clipped week when the visible window is interior and short', () => {
    // Visible window entirely inside one continuous week.
    const weeks = continuousWeeksInMonth(D(2026, 6, 9), D(2026, 6, 11));
    expect(weeks).toHaveLength(1);
    expect(weeks[0].partialAt).toBe('both');
    expect(weeks[0].visibleDays).toBe(3);
    expect(weeks[0].label).toBe('Week 2');
  });
});
