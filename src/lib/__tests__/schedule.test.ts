import { describe, it, expect } from 'vitest';
import { expectedOccurrences, type ScheduleShape } from '../schedule';

// Dates use local time to match the module (which builds occurrences in
// local time). 2026-06-02 is a Tuesday.
const d = (iso: string) => new Date(iso);

describe('expectedOccurrences', () => {
  it('returns nothing for sporadic activities', () => {
    const s: ScheduleShape = { schedulingMode: 'sporadic_ongoing', daysOfWeek: [2], time: '18:00' };
    expect(expectedOccurrences(s, d('2026-01-01T00:00'), d('2026-12-31T00:00'))).toEqual([]);
  });

  it('generates weekly occurrences on the scheduled day', () => {
    const s: ScheduleShape = {
      schedulingMode: 'structured_recurring',
      daysOfWeek: [2], // Tuesday
      intervalWeeks: 1,
      time: '18:00',
      startDate: d('2026-05-01T00:00'),
    };
    const occ = expectedOccurrences(s, d('2026-05-01T00:00'), d('2026-05-31T23:59'));
    // Tuesdays in May 2026: 5, 12, 19, 26.
    expect(occ.map(o => o.getDate())).toEqual([5, 12, 19, 26]);
    expect(occ[0].getHours()).toBe(18);
  });

  it('respects a biweekly interval anchored to the start date', () => {
    const s: ScheduleShape = {
      schedulingMode: 'structured_recurring',
      daysOfWeek: [2],
      intervalWeeks: 2,
      time: '18:00',
      startDate: d('2026-05-05T00:00'), // Tue
    };
    const occ = expectedOccurrences(s, d('2026-05-01T00:00'), d('2026-06-30T23:59'));
    // Every other Tuesday from May 5: 5, 19, Jun 2, 16, 30.
    expect(occ.map(o => `${o.getMonth() + 1}/${o.getDate()}`)).toEqual([
      '5/5', '5/19', '6/2', '6/16', '6/30',
    ]);
  });

  it('emits one occurrence per listed day for multi-day activities', () => {
    const s: ScheduleShape = {
      schedulingMode: 'structured_recurring',
      daysOfWeek: [2, 4], // Tue + Thu
      intervalWeeks: 1,
      time: '17:00',
      startDate: d('2026-05-01T00:00'),
    };
    const occ = expectedOccurrences(s, d('2026-05-04T00:00'), d('2026-05-10T23:59'));
    // Week of May 4: Tue 5, Thu 7.
    expect(occ.map(o => o.getDate())).toEqual([5, 7]);
  });

  it('clamps to the activity end date', () => {
    const s: ScheduleShape = {
      schedulingMode: 'short_duration',
      daysOfWeek: [2],
      intervalWeeks: 1,
      time: '18:00',
      startDate: d('2026-05-01T00:00'),
      endDate: d('2026-05-15T00:00'),
    };
    const occ = expectedOccurrences(s, d('2026-05-01T00:00'), d('2026-12-31T23:59'));
    // Tuesdays up to and including May 15: 5, 12.
    expect(occ.map(o => o.getDate())).toEqual([5, 12]);
  });

  it('treats a day-less short activity as a single dated occurrence', () => {
    const s: ScheduleShape = {
      schedulingMode: 'short_duration',
      time: '09:00',
      startDate: d('2026-07-04T00:00'),
    };
    const occ = expectedOccurrences(s, d('2026-01-01T00:00'), d('2026-12-31T23:59'));
    expect(occ).toHaveLength(1);
    expect(occ[0].getMonth() + 1).toBe(7);
    expect(occ[0].getDate()).toBe(4);
  });
});
