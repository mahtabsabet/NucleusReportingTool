import { describe, it, expect } from 'vitest';
import {
  buildCycleSchedule,
  classifyByStartDate,
  computeCycle,
  computeCyclesInGregorianYear,
  gregorianYearsCovered,
} from '../cycles';

describe('computeCycle', () => {
  it('places Cycle 1 of Bahá’í year 2026 on the Apr 20 anchor', () => {
    const c = computeCycle(2026, 1);
    expect(c.startDate.toISOString().slice(0, 10)).toBe('2026-04-20');
    expect(c.endDate.toISOString().slice(0, 10)).toBe('2026-07-19');
    expect(c.label).toBe('Cycle 1');
  });

  it('chains cycles 1→2→3→4 contiguously across Bahá’í year boundary', () => {
    const c1 = computeCycle(2026, 1);
    const c2 = computeCycle(2026, 2);
    const c3 = computeCycle(2026, 3);
    const c4 = computeCycle(2026, 4);
    const c1Next = computeCycle(2027, 1);
    expect(c2.startDate.toISOString().slice(0, 10)).toBe('2026-07-20');
    expect(c3.startDate.toISOString().slice(0, 10)).toBe('2026-10-20');
    expect(c4.startDate.toISOString().slice(0, 10)).toBe('2027-01-20');
    expect(c1.endDate < c2.startDate).toBe(true);
    expect(c4.endDate < c1Next.startDate).toBe(true);
  });
});

describe('computeCyclesInGregorianYear', () => {
  it('returns Cycle 4 → 1 → 2 → 3 in calendar order for a full year', () => {
    const cycles = computeCyclesInGregorianYear(2027);
    expect(cycles.map(c => c.cycleNumber)).toEqual([4, 1, 2, 3]);
    // Cycle 4 here is from the *prior* Bahá’í year.
    expect(cycles[0].bahaiYear).toBe(2026);
    expect(cycles[1].bahaiYear).toBe(2027);
  });

  it('also produces 4 cycles for the anchor year (2026) by including prior Cycle 4', () => {
    const cycles = computeCyclesInGregorianYear(2026);
    expect(cycles.map(c => c.cycleNumber)).toEqual([4, 1, 2, 3]);
  });

  it('produces 4 cycles for 2030', () => {
    const cycles = computeCyclesInGregorianYear(2030);
    expect(cycles).toHaveLength(4);
    expect(cycles.map(c => c.cycleNumber)).toEqual([4, 1, 2, 3]);
  });
});

describe('buildCycleSchedule', () => {
  it('falls back to computed cycles when no overrides are provided', () => {
    const schedule = buildCycleSchedule({ toYear: 2030 });
    expect(schedule.every(c => c.isOverride === false)).toBe(true);
    expect(gregorianYearsCovered(schedule)).toContain(2030);
    expect(gregorianYearsCovered(schedule)).toContain(2026);
  });

  it('substitutes a DB override into the matching slot and keeps the rest computed', () => {
    const customStart = new Date(2027, 3, 21); // 1 day after default Cycle 1, 2027
    const customEnd = new Date(2027, 6, 25);
    const schedule = buildCycleSchedule({
      toYear: 2028,
      overrides: [{
        id: 'db-uuid-1',
        label: 'Cycle 1 (custom)',
        startDate: customStart,
        endDate: customEnd,
      }],
    });
    const overridden = schedule.find(c => c.bahaiYear === 2027 && c.cycleNumber === 1);
    expect(overridden).toBeDefined();
    expect(overridden!.id).toBe('db-uuid-1');
    expect(overridden!.isOverride).toBe(true);
    expect(overridden!.startDate.getTime()).toBe(customStart.getTime());
    // Adjacent cycles remain computed.
    const adjacent = schedule.find(c => c.bahaiYear === 2027 && c.cycleNumber === 2);
    expect(adjacent!.isOverride).toBe(false);
  });
});

describe('classifyByStartDate', () => {
  it('snaps a near-anchor date to the correct (bahaiYear, cycleNumber) slot', () => {
    expect(classifyByStartDate(new Date(2027, 3, 21))).toEqual({
      bahaiYear: 2027, cycleNumber: 1,
    });
    expect(classifyByStartDate(new Date(2027, 0, 22))).toEqual({
      bahaiYear: 2026, cycleNumber: 4,
    });
  });
});
