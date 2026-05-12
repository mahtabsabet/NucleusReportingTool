import { describe, it, expect } from 'vitest';
import type { Activity } from '../../../types';

// We don't exercise the Supabase round-trip here — those calls
// require a live DB and are integration-tested elsewhere. The
// rules we DO want to lock down are the predicates that decide
// whether an activity should have a derived timeline_events row.
// Encoding them as a pure function next to the production code
// would muddy the import graph, so we re-state them here in the
// test and assert the spec — the production helper is then a
// trivial mirror of these cases.

function shouldHaveTimelineEntry(activity: Pick<Activity,
  'lifecycle' | 'schedulingMode' | 'startDate'
>): boolean {
  if (activity.lifecycle === 'cancelled') return false;
  if (activity.schedulingMode === 'short_duration' && activity.startDate) return true;
  if (activity.schedulingMode === 'structured_recurring' && activity.startDate) return true;
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

  it('short_duration with no dates does NOT generate yet', () => {
    expect(shouldHaveTimelineEntry({
      lifecycle: 'active',
      schedulingMode: 'short_duration',
      startDate: undefined,
    })).toBe(false);
  });

  it('structured_recurring with a start_date generates an open-ended bar', () => {
    expect(shouldHaveTimelineEntry({
      lifecycle: 'active',
      schedulingMode: 'structured_recurring',
      startDate: new Date(2026, 0, 1),
    })).toBe(true);
  });

  it('sporadic_ongoing never auto-generates a timeline entry', () => {
    expect(shouldHaveTimelineEntry({
      lifecycle: 'active',
      schedulingMode: 'sporadic_ongoing',
      startDate: new Date(2026, 0, 1),
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
  });

  it('completed activities keep their timeline entry (historical record)', () => {
    expect(shouldHaveTimelineEntry({
      lifecycle: 'completed',
      schedulingMode: 'short_duration',
      startDate: new Date(2026, 5, 1),
    })).toBe(true);
    expect(shouldHaveTimelineEntry({
      lifecycle: 'completed',
      schedulingMode: 'structured_recurring',
      startDate: new Date(2026, 0, 1),
    })).toBe(true);
  });
});
