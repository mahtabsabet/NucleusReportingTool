// Centralized cycle math for the timeline system.
//
// Cycle definitions are authoritative administrative objects scoped by
// governance level (cluster / nucleus-inherited / regional). The DB persists
// edited boundaries as overrides; this module produces the default schedule
// and merges DB overrides on top, so a timeline always renders even when the
// timeline_cycles table is empty.
//
// One Bahá'í-style year = 4 cycles of ~3 months each. Within a Gregorian
// year the chronological order is therefore:
//   Cycle 4 (of prior Bahá'í year) → Cycle 1 → Cycle 2 → Cycle 3.

import type { TimelineCycle } from '../../types';

// Default anchor: Cycle 1 of Bahá'í year 2026 starts Apr 20, 2026.
// (Matches the original Magic Patterns prototype.)
export const DEFAULT_CYCLE_ANCHOR = { year: 2026, month: 3, day: 20 } as const;
export const CYCLE_LENGTH_MONTHS = 3;
export const CYCLES_PER_YEAR = 4;

export interface CycleScope {
  /** Bahá'í year the cycle 1 anchor falls in (Gregorian year of Naw-Rúz). */
  bahaiYear: number;
  /** 1..4 within the Bahá'í year. */
  cycleNumber: 1 | 2 | 3 | 4;
}

export interface ComputedCycle extends TimelineCycle, CycleScope {
  /** Stable synthetic id; replaced by DB id when an override exists. */
  id: string;
  isOverride: boolean;
}

function anchorDate(bahaiYear: number): Date {
  // Cycle 1 of Bahá'í year B starts on the anchor month/day in Gregorian year B.
  return new Date(bahaiYear, DEFAULT_CYCLE_ANCHOR.month, DEFAULT_CYCLE_ANCHOR.day);
}

/** Compute the default boundaries for a single cycle. */
export function computeCycle(bahaiYear: number, cycleNumber: 1 | 2 | 3 | 4): ComputedCycle {
  const start = anchorDate(bahaiYear);
  start.setMonth(start.getMonth() + (cycleNumber - 1) * CYCLE_LENGTH_MONTHS);
  const end = new Date(start);
  end.setMonth(end.getMonth() + CYCLE_LENGTH_MONTHS);
  end.setDate(end.getDate() - 1);
  return {
    id: synthCycleId(bahaiYear, cycleNumber),
    bahaiYear,
    cycleNumber,
    label: `Cycle ${cycleNumber}`,
    startDate: start,
    endDate: end,
    isOverride: false,
  };
}

export function synthCycleId(bahaiYear: number, cycleNumber: 1 | 2 | 3 | 4): string {
  return `computed-${bahaiYear}-c${cycleNumber}`;
}

/**
 * Generate the full set of cycles whose date range intersects [from, to],
 * sorted chronologically. Naturally yields the 4 → 1 → 2 → 3 ordering when
 * grouped by Gregorian year.
 */
export function computeCyclesInRange(from: Date, to: Date): ComputedCycle[] {
  const fromYear = from.getFullYear();
  const toYear = to.getFullYear();
  // A given Gregorian year contains: Cycle 4 of (Y-1) and Cycles 1..3 of Y.
  // Walk a generous Bahá'í-year range to make sure the calendar bounds are
  // covered on both ends.
  const cycles: ComputedCycle[] = [];
  for (let by = fromYear - 1; by <= toYear + 1; by++) {
    for (const n of [1, 2, 3, 4] as const) {
      const c = computeCycle(by, n);
      if (c.endDate >= from && c.startDate <= to) cycles.push(c);
    }
  }
  cycles.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  return cycles;
}

/**
 * Return the cycles whose start date falls in Gregorian year `year`, sorted
 * chronologically. For any year fully within the schedule this returns 4
 * cycles in Cycle 4 → 1 → 2 → 3 order (because Cycle 4 of Bahá’í year B-1
 * starts in the same Gregorian year as Cycle 1 of B).
 */
export function computeCyclesInGregorianYear(year: number): ComputedCycle[] {
  return computeCyclesInRange(
    new Date(year, 0, 1),
    new Date(year, 11, 31),
  ).filter(c => c.startDate.getFullYear() === year);
}

/** Distinct Gregorian years touched by the cycle set, ascending. */
export function gregorianYearsCovered(cycles: TimelineCycle[]): number[] {
  const years = new Set<number>();
  for (const c of cycles) {
    const y0 = c.startDate.getFullYear();
    const y1 = c.endDate.getFullYear();
    for (let y = y0; y <= y1; y++) years.add(y);
  }
  return [...years].sort((a, b) => a - b);
}

export interface CycleScheduleOptions {
  /** Earliest year to include. Defaults to the anchor year. */
  fromYear?: number;
  /** Latest year to include (inclusive). */
  toYear: number;
  /** DB-backed cycle rows that override the computed schedule. */
  overrides?: TimelineCycle[];
}

/**
 * Produce the canonical cycle list for a timeline view.
 *
 * Order of precedence:
 *   1. If overrides are provided, prefer the override row whose date range
 *      best matches a computed slot (matched by Bahá'í year + cycle number,
 *      detected from the override's start date).
 *   2. Otherwise the computed default is used.
 *
 * This lets admins edit cycle boundaries via the database while the timeline
 * keeps rendering even on a fresh deployment with no seeded rows.
 */
export function buildCycleSchedule(opts: CycleScheduleOptions): ComputedCycle[] {
  const fromYear = opts.fromYear ?? DEFAULT_CYCLE_ANCHOR.year;
  const computed = computeCyclesInRange(
    new Date(fromYear, 0, 1),
    new Date(opts.toYear, 11, 31),
  );

  if (!opts.overrides || opts.overrides.length === 0) return computed;

  // Index overrides by classifying their start date into (bahaiYear, cycleNumber).
  const byKey = new Map<string, TimelineCycle>();
  for (const o of opts.overrides) {
    const slot = classifyByStartDate(o.startDate);
    if (!slot) continue;
    byKey.set(slotKey(slot.bahaiYear, slot.cycleNumber), o);
  }

  return computed.map(c => {
    const o = byKey.get(slotKey(c.bahaiYear, c.cycleNumber));
    if (!o) return c;
    return {
      ...c,
      id: o.id,
      label: o.label || c.label,
      startDate: o.startDate,
      endDate: o.endDate,
      isOverride: true,
    };
  });
}

function slotKey(bahaiYear: number, cycleNumber: number): string {
  return `${bahaiYear}-${cycleNumber}`;
}

/**
 * Best-effort mapping from a start date to a (bahaiYear, cycleNumber) slot.
 * Picks the computed slot whose start date is closest.
 */
export function classifyByStartDate(start: Date): CycleScope | null {
  const year = start.getFullYear();
  const candidates: ComputedCycle[] = [];
  for (const by of [year - 1, year, year + 1]) {
    for (const n of [1, 2, 3, 4] as const) {
      candidates.push(computeCycle(by, n));
    }
  }
  let best: ComputedCycle | null = null;
  let bestDelta = Infinity;
  for (const c of candidates) {
    const d = Math.abs(c.startDate.getTime() - start.getTime());
    if (d < bestDelta) {
      bestDelta = d;
      best = c;
    }
  }
  if (!best) return null;
  return { bahaiYear: best.bahaiYear, cycleNumber: best.cycleNumber };
}
