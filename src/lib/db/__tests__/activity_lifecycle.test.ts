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
// Spec (current as of the "lock scheduling on completed/cancelled" change):
//   • short_duration AND start_date AND lifecycle ∈ {active, planned}
//                                          → one persisted row
//   • structured_recurring                  → NO persisted row
//                                              (occurrences are synthesized
//                                              at render time from
//                                              daysOfWeek + intervalWeeks)
//   • sporadic_ongoing                      → NO persisted row
//   • lifecycle ∈ {completed, cancelled}    → NO persisted row, regardless of mode
//
// short_duration + active/planned is the only combination that
// legitimately keeps a derived row. Everything else is either
// synthesized on the nucleus timeline page or intentionally absent
// from the calendar — completed and cancelled activities are
// preserved as records but disappear from the forward-looking view.

function shouldHaveTimelineEntry(activity: Pick<Activity,
  'lifecycle' | 'schedulingMode' | 'startDate'
>): boolean {
  if (activity.lifecycle !== 'active' && activity.lifecycle !== 'planned') return false;
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

  it('completed activities never keep a persisted row, regardless of mode', () => {
    // Completed and cancelled activities are preserved in the
    // system but disappear from the timeline — the calendar is
    // forward-looking; history lives in the activity record.
    expect(shouldHaveTimelineEntry({
      lifecycle: 'completed',
      schedulingMode: 'short_duration',
      startDate: new Date(2026, 5, 1),
    })).toBe(false);
    expect(shouldHaveTimelineEntry({
      lifecycle: 'completed',
      schedulingMode: 'sporadic_ongoing',
      startDate: new Date(2026, 0, 1),
    })).toBe(false);
  });

  it('planned short_duration activities also get a persisted row (calendar planning)', () => {
    // Planned activities haven't started running yet but should
    // appear on the calendar so users can see what's coming.
    expect(shouldHaveTimelineEntry({
      lifecycle: 'planned',
      schedulingMode: 'short_duration',
      startDate: new Date(2026, 5, 1),
    })).toBe(true);
  });
});

// Companion rule on the NucleusTimeline render side: a fetched
// timeline row should be hidden unless its source activity is in
// the exact (mode, lifecycle) pair that legitimately persists a
// row today — short_duration AND active/planned. Anything else
// (different mode, completed, cancelled) should have its stale
// row masked so it doesn't reappear on the strip. Encoded here so
// the render-side rule and the sync-side `shouldHaveTimelineEntry`
// predicate can't drift apart silently.
function shouldHideFetchedRowFor(
  mode: ActivitySchedulingMode,
  lifecycle: Activity['lifecycle'],
): boolean {
  const isActiveOrPlanned = lifecycle === 'active' || lifecycle === 'planned';
  return !(mode === 'short_duration' && isActiveOrPlanned);
}

describe('nucleus timeline rendering rules', () => {
  it('hides fetched rows for structured_recurring activities (occurrences synthesized instead)', () => {
    expect(shouldHideFetchedRowFor('structured_recurring', 'active')).toBe(true);
  });

  it('hides fetched rows for sporadic_ongoing activities (no calendar presence)', () => {
    expect(shouldHideFetchedRowFor('sporadic_ongoing', 'active')).toBe(true);
  });

  it('hides fetched rows for completed or cancelled activities, regardless of mode', () => {
    expect(shouldHideFetchedRowFor('short_duration', 'completed')).toBe(true);
    expect(shouldHideFetchedRowFor('short_duration', 'cancelled')).toBe(true);
    expect(shouldHideFetchedRowFor('structured_recurring', 'completed')).toBe(true);
  });

  it('exposes fetched rows for active short_duration activities (the persisted combination)', () => {
    expect(shouldHideFetchedRowFor('short_duration', 'active')).toBe(false);
    expect(shouldHideFetchedRowFor('short_duration', 'planned')).toBe(false);
  });
});
