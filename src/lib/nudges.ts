import type { ActivityLifecycle } from '../types';
import type { ActivityAttendance } from './db/journal';
import { expectedOccurrences, type ScheduleShape } from './schedule';

const DAY_MS = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Don't look back further than this when reconstructing missed
// occurrences for an activity that has never been logged, so the loop
// stays bounded and we don't surface an unbounded historical backlog.
const MAX_LOOKBACK_DAYS = 365;

// ─── Nudge 1: "log an entry" ─────────────────────────────────

export interface EntryNudge {
  kind: 'log_entry';
  // The most recent un-logged scheduled occurrence (absent for
  // sporadic activities, which have no derivable schedule).
  occurrenceDate: Date | null;
  // How many scheduled occurrences have passed unlogged since the last
  // entry / last handled occurrence.
  missedCount: number;
  // Most recent activity entry date, if any.
  lastEntryAt: Date | null;
  // Sporadic activities show a steady, non-dismissible reminder; for
  // scheduled activities the lead can dismiss or mark "didn't happen".
  dismissible: boolean;
}

export interface EntryNudgeInputs {
  activity: ScheduleShape & { lifecycle: ActivityLifecycle };
  // occurred_at of the most recent activity notebook entry, or null.
  lastEntryAt: Date | null;
  // Dates of occurrences the lead has already handled (dismissed or
  // confirmed didn't happen). Only the most recent one matters.
  handledDates: Date[];
  now: Date;
}

// Decide whether to prompt the activity's lead/collaborator to log an
// entry. Only `active` activities are nudged. Returns null when nothing
// is owed.
export function entryNudge({ activity, lastEntryAt, handledDates, now }: EntryNudgeInputs): EntryNudge | null {
  if (activity.lifecycle !== 'active') return null;

  // Sporadic: no schedule to miss — a steady, gentle reminder to log
  // whenever the group has met. Not dismissible.
  if (activity.schedulingMode === 'sporadic_ongoing') {
    return {
      kind: 'log_entry',
      occurrenceDate: null,
      missedCount: 0,
      lastEntryAt,
      dismissible: false,
    };
  }

  // Scheduled (structured_recurring / short_duration): nudge only once a
  // scheduled occurrence has fully passed (grace = the next day) and
  // hasn't been logged or handled.
  const handledMax = handledDates.length
    ? new Date(Math.max(...handledDates.map(d => d.getTime())))
    : null;
  const cutoffMs = Math.max(
    lastEntryAt ? startOfDay(lastEntryAt).getTime() : 0,
    handledMax ? startOfDay(handledMax).getTime() : 0,
  );

  const today = startOfDay(now);
  const from = new Date(
    Math.max(cutoffMs || 0, today.getTime() - MAX_LOOKBACK_DAYS * DAY_MS),
  );

  const occ = expectedOccurrences(activity, from, now)
    // Grace: only occurrences on an earlier calendar day than today.
    .filter(d => startOfDay(d).getTime() < today.getTime())
    // Strictly after whatever we've already logged/handled.
    .filter(d => startOfDay(d).getTime() > cutoffMs);

  if (occ.length === 0) return null;

  return {
    kind: 'log_entry',
    occurrenceDate: occ[occ.length - 1],
    missedCount: occ.length,
    lastEntryAt,
    dismissible: true,
  };
}

// ─── Nudge 2: lapsed participants ────────────────────────────

export interface LapsedReviewInputs {
  lifecycle: ActivityLifecycle;
  attendance: ActivityAttendance;
  // Active (non-inactive, non-removed) participant ids to consider.
  participantIds: string[];
  // last_reviewed_at per person, so a "Keep" decision snoozes the prompt.
  reviewedAt: Record<string, Date | null>;
  now: Date;
  days?: number; // inactivity threshold, default 60
}

// Person ids who've attended before but not in `days`, on an activity
// that is still being logged. Newly-added people who've never attended
// are deliberately not flagged (we can't tell a fresh add from a
// genuine no-show without a join date), and a dormant activity whose
// whole roster has gone quiet is a "log an entry" problem, not a
// per-person one — so we require a recent session before flagging.
export function participantsNeedingReview({
  lifecycle,
  attendance,
  participantIds,
  reviewedAt,
  now,
  days = 60,
}: LapsedReviewInputs): string[] {
  if (lifecycle !== 'active') return [];

  const dates = attendance.recentSessionDates;
  const latestSession = dates.length ? dates[dates.length - 1] : null;
  if (!latestSession || now.getTime() - latestSession.getTime() > days * DAY_MS) {
    return []; // activity itself has gone quiet
  }

  const cutoff = now.getTime() - days * DAY_MS;
  return participantIds.filter(pid => {
    const la = attendance.byPerson[pid]?.lastAttended ?? null;
    if (!la || la.getTime() > cutoff) return false; // never attended, or attended recently
    const reviewed = reviewedAt[pid];
    if (reviewed && reviewed.getTime() > cutoff) return false; // recently reviewed → snoozed
    return true;
  });
}
