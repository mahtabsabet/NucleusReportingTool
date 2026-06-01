import { describe, it, expect } from 'vitest';
import { computeActivityAttendance, recencyTone } from '../journal';

const d = (s: string) => new Date(`${s}T12:00:00`);

describe('computeActivityAttendance', () => {
  it('counts attendance, finds last-attended, and builds the recent strip', () => {
    const sessions = [
      { date: d('2026-05-01'), presentIds: ['a', 'b'] },
      { date: d('2026-05-08'), presentIds: ['a'] },
      { date: d('2026-05-15'), presentIds: ['a', 'b', 'c'] },
    ];
    const res = computeActivityAttendance(sessions);

    expect(res.sessionCount).toBe(3);
    expect(res.recentSessionDates).toEqual([d('2026-05-01'), d('2026-05-08'), d('2026-05-15')]);

    expect(res.byPerson['a']).toEqual({
      attendedCount: 3,
      lastAttended: d('2026-05-15'),
      recent: [true, true, true],
    });
    // b missed the middle session
    expect(res.byPerson['b'].recent).toEqual([true, false, true]);
    expect(res.byPerson['b'].attendedCount).toBe(2);
    // c only showed up at the last session
    expect(res.byPerson['c'].recent).toEqual([false, false, true]);
    expect(res.byPerson['c'].lastAttended).toEqual(d('2026-05-15'));
  });

  it('only keeps the most recent `window` sessions in the strip', () => {
    const sessions = Array.from({ length: 10 }, (_, i) => ({
      date: d(`2026-05-${String(i + 1).padStart(2, '0')}`),
      presentIds: ['a'],
    }));
    const res = computeActivityAttendance(sessions, 8);

    expect(res.sessionCount).toBe(10);           // full history counted
    expect(res.recentSessionDates).toHaveLength(8); // strip is windowed
    expect(res.byPerson['a'].attendedCount).toBe(10);
    expect(res.byPerson['a'].recent).toHaveLength(8);
  });

  it('handles no sessions', () => {
    const res = computeActivityAttendance([]);
    expect(res.sessionCount).toBe(0);
    expect(res.recentSessionDates).toEqual([]);
    expect(res.byPerson).toEqual({});
  });

  it('dedupes nothing extra and ignores people with no presence', () => {
    const res = computeActivityAttendance([
      { date: d('2026-05-01'), presentIds: ['a'] },
    ]);
    expect(Object.keys(res.byPerson)).toEqual(['a']);
  });
});

describe('recencyTone', () => {
  it('green when present at the most recent session', () => {
    expect(recencyTone([false, false, true])).toBe('green');
  });
  it('amber when absent last but present within the last 3', () => {
    expect(recencyTone([true, true, false])).toBe('amber');
    expect(recencyTone([true, false, false])).toBe('amber');
  });
  it('grey when absent across the last 3', () => {
    expect(recencyTone([true, false, false, false])).toBe('grey');
  });
  it('grey for an empty strip (no history)', () => {
    expect(recencyTone([])).toBe('grey');
  });
});
