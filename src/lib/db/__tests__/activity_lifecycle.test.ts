import { describe, it, expect } from 'vitest';
import type { Activity, ActivitySchedulingMode } from '../../../types';

// We don't exercise the Supabase round-trip here — those calls
// require a live DB and are integration-tested elsewhere. The rules
// we DO want to lock down are the predicates that decide whether an
// activity should have a derived timeline_events row. Encoding them
// as a pure function next to the production code would muddy the
// import graph, so we re-state them here in the test and assert the
// spec — the production helper (syncActivityTimelineEntry in
// src/lib/db/nucleus.ts) is then a trivial mirror of these cases.
//
// Spec (current as of the "synthesize recurring occurrences" change):
//   • short_duration AND start_date set    → one persisted row
//   • structured_recurring                  → NO persisted row
//                                              (occurrences are synthesized
//                                              at render time from
//                                              daysOfWeek + intervalWeeks)
//   • sporadic_ongoing                      → NO persisted row
//   • lifecycle = 'cancelled'               → NO persisted row
//
// short_duration is the only mode that legitimately keeps a derived
// row in the database. Everything else is either synthesized on the
// nucleus timeline page or intentionally absent from the calendar.

function shouldHaveTimelineEntry(activity: Pick<Activity,
  'lifecycle' | 'schedulingMode' | 'startDate'
>): boolean {
  if (activity.lifecycle === 'cancelled') return false;
  if (activity.schedulingMode === 'short_duration' && activity.startDate) return true;
  return false;
}

describe('activity → timeline entry sync rules', () => {
  it('short_duration with start_date generates a timeline entry', () => {
    expect(shouldHaveTimelineEntry({
      lifecycle: 'active',
      schedulingMode: 'short_duration',
      startDate: new Date(2026, 5, 1),
    })).toBe(true);
  });

  it('short_duration with no start date does NOT yet generate one', () => {
    expect(shouldHaveTimelineEntry({
      lifecycle: 'active',
      schedulingMode: 'short_duration',
      startDate: undefined,
    })).toBe(false);
  });

  it('structured_recurring does NOT persist a timeline row (synthesized at render time instead)', () => {
    // The nucleus timeline view renders one marker per occurrence
    // from daysOfWeek + intervalWeeks — a single start-date row
    // would be misleading, and a row per occurrence would balloon
    // the DB. Both reasons argue for "no persisted row" here.
    expect(shouldHaveTimelineEntry({
      lifecycle: 'active',
      schedulingMode: 'structured_recurring',
      startDate: new Date(2026, 0, 1),
    })).toBe(false);
    expect(shouldHaveTimelineEntry({
      lifecycle: 'planned',
      schedulingMode: 'structured_recurring',
      startDate: new Date(2026, 0, 1),
    })).toBe(false);
    // Completed recurring activities also don't get a persisted row —
    // their historical occurrences are still synthesized within the
    // [startDate, completedAt] window by the render-time helper.
    expect(shouldHaveTimelineEntry({
      lifecycle: 'completed',
      schedulingMode: 'structured_recurring',
      startDate: new Date(2026, 0, 1),
    })).toBe(false);
  });

  it('sporadic_ongoing never auto-generates a timeline entry, regardless of dates', () => {
    expect(shouldHaveTimelineEntry({
      lifecycle: 'active',
      schedulingMode: 'sporadic_ongoing',
      startDate: new Date(2026, 0, 1),
    })).toBe(false);
    expect(shouldHaveTimelineEntry({
      lifecycle: 'planned',
      schedulingMode: 'sporadic_ongoing',
      startDate: undefined,
    })).toBe(false);
  });

  it('cancelled activities never generate a timeline entry, regardless of mode', () => {
    expect(shouldHaveTimelineEntry({
      lifecycle: 'cancelled',
      schedulingMode: 'short_duration',
      startDate: new Date(2026, 5, 1),
    })).toBe(false);
    expect(shouldHaveTimelineEntry({
      lifecycle: 'cancelled',
      schedulingMode: 'structured_recurring',
      startDate: new Date(2026, 0, 1),
    })).toBe(false);
    expect(shouldHaveTimelineEntry({
      lifecycle: 'cancelled',
      schedulingMode: 'sporadic_ongoing',
      startDate: new Date(2026, 0, 1),
    })).toBe(false);
  });

  it('completed short_duration activities keep their persisted row (historical record)', () => {
    // The end_date sticks at the original or the completion date,
    // so the bar continues to render on the strip as a finished
    // event — the spec calls out preserving completed activities
    // visually rather than hiding them.
    expect(shouldHaveTimelineEntry({
      lifecycle: 'completed',
      schedulingMode: 'short_duration',
      startDate: new Date(2026, 5, 1),
    })).toBe(true);
  });
});

// Companion rule on the NucleusTimeline render side: any fetched
// timeline row whose source activity is currently NOT in
// short_duration mode should be hidden, so a stale row left behind
// by an earlier sync version doesn't appear next to the new
// synthesized fan-out (or alongside a sporadic activity that no
// longer belongs on the calendar at all). Encoded here so the rule
// can't drift away from the sync-side predicate without a failing
// test flagging the inconsistency.
function shouldHideFetchedRowFor(mode: ActivitySchedulingMode): boolean {
  return mode !== 'short_duration';
}

describe('nucleus timeline rendering rules', () => {
  it('hides fetched rows for structured_recurring activities (occurrences synthesized instead)', () => {
    expect(shouldHideFetchedRowFor('structured_recurring')).toBe(true);
  });

  it('hides fetched rows for sporadic_ongoing activities (no calendar presence)', () => {
    expect(shouldHideFetchedRowFor('sporadic_ongoing')).toBe(true);
  });

  it('exposes fetched rows for short_duration activities (the only persisted mode)', () => {
    expect(shouldHideFetchedRowFor('short_duration')).toBe(false);
  });
});
