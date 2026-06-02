import type { ActivitySchedulingMode } from '../types';

// Everything the occurrence math needs from an activity. Kept as a
// plain shape (not the full Activity) so this module stays pure and
// trivially unit-testable.
export interface ScheduleShape {
  schedulingMode: ActivitySchedulingMode;
  daysOfWeek?: number[];     // 0 = Sunday … 6 = Saturday
  intervalWeeks?: number;    // 1 = weekly, 2 = biweekly, 4 ≈ monthly
  time?: string;             // "HH:MM" or "HH:MM:SS" (24-hour)
  startDate?: Date;
  endDate?: Date;
}

const DAY_MS = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Sunday-anchored start of the week containing `d`.
function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  return new Date(s.getTime() - s.getDay() * DAY_MS);
}

function wholeWeeksBetween(a: Date, b: Date): number {
  return Math.round((startOfWeek(b).getTime() - startOfWeek(a).getTime()) / (7 * DAY_MS));
}

// Apply an "HH:MM"/"HH:MM:SS" time to a date. Missing/invalid time
// falls back to end-of-day so an occurrence only reads as "in the past"
// once that whole day has elapsed.
function applyTime(day: Date, time?: string): Date {
  const out = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const m = time?.match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    out.setHours(Number(m[1]), Number(m[2]), 0, 0);
  } else {
    out.setHours(23, 59, 0, 0);
  }
  return out;
}

// Expected occurrence datetimes in [from, to], derived purely from the
// schedule. Only `structured_recurring` and `short_duration` have a
// derivable cadence; `sporadic_ongoing` returns none (callers prompt
// on a steady basis instead).
//
// Recurrence aligns to whole weeks from the activity's start date (its
// anchor), stepping by `intervalWeeks`. Multi-day activities yield one
// occurrence per listed day in each active week. Results are clamped to
// [startDate, endDate] when those are set.
export function expectedOccurrences(s: ScheduleShape, from: Date, to: Date): Date[] {
  if (s.schedulingMode === 'sporadic_ongoing') return [];

  const days = s.daysOfWeek ?? [];
  const interval = s.intervalWeeks && s.intervalWeeks > 0 ? s.intervalWeeks : 1;

  const lower = s.startDate && s.startDate > from ? s.startDate : from;
  const upperRaw = s.endDate && s.endDate < to ? s.endDate : to;
  // endDate is a date with no time; treat it as inclusive of that whole day.
  const upper = s.endDate && s.endDate <= upperRaw ? applyTime(s.endDate, '23:59') : upperRaw;
  if (lower > upper) return [];

  // No weekly pattern: a single dated occurrence (e.g. a one-off
  // short-duration event keyed off its start date).
  if (days.length === 0) {
    const anchorDay = s.startDate ?? s.endDate;
    if (!anchorDay) return [];
    const occ = applyTime(anchorDay, s.time);
    return occ >= lower && occ <= upper ? [occ] : [];
  }

  const anchorWeek = startOfWeek(s.startDate ?? from);
  // First interval-aligned week at or after the lower bound.
  const weeksToLower = Math.max(0, wholeWeeksBetween(anchorWeek, lower));
  let k = weeksToLower % interval === 0
    ? weeksToLower
    : weeksToLower + (interval - (weeksToLower % interval));

  const out: Date[] = [];
  // Guard against pathological ranges; callers pass bounded windows.
  for (let guard = 0; guard < 1000; guard++) {
    const weekStart = new Date(anchorWeek.getTime() + k * 7 * DAY_MS);
    if (weekStart > upper) break;
    for (const dow of [...days].sort((a, b) => a - b)) {
      const day = new Date(weekStart.getTime() + dow * DAY_MS);
      const occ = applyTime(day, s.time);
      if (occ >= lower && occ <= upper) out.push(occ);
    }
    k += interval;
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}
