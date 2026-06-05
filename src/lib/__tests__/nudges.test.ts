import { describe, it, expect } from 'vitest';
import { entryNudge, participantsNeedingReview } from '../nudges';
import { computeActivityAttendance } from '../db/journal';

const d = (iso: string) => new Date(iso);

const weekly = {
  schedulingMode: 'structured_recurring' as const,
  daysOfWeek: [2], // Tuesday
  intervalWeeks: 1,
  time: '18:00',
  startDate: d('2026-05-01T00:00'),
  lifecycle: 'active' as const,
};

describe('entryNudge', () => {
  it('does not nudge non-active activities', () => {
    expect(entryNudge({
      activity: { ...weekly, lifecycle: 'completed' },
      lastEntryAt: null,
      handledDates: [],
      now: d('2026-06-10T09:00'),
    })).toBeNull();
  });

  it('nudges when a scheduled occurrence has passed since the last entry', () => {
    // Last entry Tue May 26; now Wed Jun 3 → Jun 2 occurrence passed.
    const n = entryNudge({
      activity: weekly,
      lastEntryAt: d('2026-05-26T18:00'),
      handledDates: [],
      now: d('2026-06-03T09:00'),
    });
    expect(n).not.toBeNull();
    expect(n!.dismissible).toBe(true);
    expect(n!.occurrenceDate!.getDate()).toBe(2); // Jun 2 Tuesday
    expect(n!.missedCount).toBe(1);
  });

  it('does not nudge on the same day as the occurrence (next-day grace)', () => {
    // Occurrence Tue Jun 2; now is still Jun 2 evening.
    const n = entryNudge({
      activity: weekly,
      lastEntryAt: d('2026-05-26T18:00'),
      handledDates: [],
      now: d('2026-06-02T20:00'),
    });
    expect(n).toBeNull();
  });

  it('counts every missed occurrence since the last entry', () => {
    // Last entry May 5; now Jun 10 → May 12,19,26, Jun 2, Jun 9 missed = 5.
    const n = entryNudge({
      activity: weekly,
      lastEntryAt: d('2026-05-05T18:00'),
      handledDates: [],
      now: d('2026-06-10T09:00'),
    });
    expect(n!.missedCount).toBe(5);
    expect(n!.occurrenceDate!.getDate()).toBe(9); // most recent (Jun 9)
  });

  it('suppresses the nudge once the latest occurrence is handled', () => {
    // Same window, but the Jun 2 occurrence was dismissed.
    const n = entryNudge({
      activity: weekly,
      lastEntryAt: d('2026-05-26T18:00'),
      handledDates: [d('2026-06-02T18:00')],
      now: d('2026-06-03T09:00'),
    });
    expect(n).toBeNull();
  });

  it('re-nudges once a newer occurrence passes after a dismissal', () => {
    // Dismissed Jun 2; now Jun 10 → Jun 9 occurrence is newer.
    const n = entryNudge({
      activity: weekly,
      lastEntryAt: d('2026-05-26T18:00'),
      handledDates: [d('2026-06-02T18:00')],
      now: d('2026-06-10T09:00'),
    });
    expect(n).not.toBeNull();
    expect(n!.occurrenceDate!.getDate()).toBe(9);
  });

  it('gives sporadic activities a steady, non-dismissible reminder', () => {
    const n = entryNudge({
      activity: { schedulingMode: 'sporadic_ongoing', lifecycle: 'active' },
      lastEntryAt: d('2026-05-01T00:00'),
      handledDates: [],
      now: d('2026-06-10T09:00'),
    });
    expect(n).not.toBeNull();
    expect(n!.dismissible).toBe(false);
    expect(n!.occurrenceDate).toBeNull();
  });
});

describe('participantsNeedingReview', () => {
  // Build attendance: weekly sessions, Alice attends throughout, Bob
  // stopped coming after the first session.
  const sessions = [
    { date: d('2026-03-03T18:00'), presentIds: ['alice', 'bob'] },
    { date: d('2026-04-07T18:00'), presentIds: ['alice'] },
    { date: d('2026-05-26T18:00'), presentIds: ['alice'] },
  ];
  const attendance = computeActivityAttendance(sessions);

  it('flags someone who attended before but not in 60 days', () => {
    const out = participantsNeedingReview({
      lifecycle: 'active',
      attendance,
      participantIds: ['alice', 'bob'],
      reviewedAt: {},
      now: d('2026-06-02T09:00'),
    });
    expect(out).toEqual(['bob']);
  });

  it('does not flag a recently reviewed person', () => {
    const out = participantsNeedingReview({
      lifecycle: 'active',
      attendance,
      participantIds: ['alice', 'bob'],
      reviewedAt: { bob: d('2026-05-20T09:00') },
      now: d('2026-06-02T09:00'),
    });
    expect(out).toEqual([]);
  });

  it('flags nobody when the activity itself has gone quiet', () => {
    const out = participantsNeedingReview({
      lifecycle: 'active',
      attendance,
      participantIds: ['alice', 'bob'],
      reviewedAt: {},
      now: d('2026-09-01T09:00'), // last session was May 26
    });
    expect(out).toEqual([]);
  });

  it('never flags a participant who has never attended', () => {
    const out = participantsNeedingReview({
      lifecycle: 'active',
      attendance,
      participantIds: ['alice', 'bob', 'newcomer'],
      reviewedAt: {},
      now: d('2026-06-02T09:00'),
    });
    expect(out).toEqual(['bob']);
  });
});
