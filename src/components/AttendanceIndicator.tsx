import React from 'react';
import { recencyTone, type RecencyTone, type PersonAttendance } from '../lib/db/journal';

const DOT_CLASS: Record<RecencyTone, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-400',
  grey: 'bg-gray-300',
};

const TONE_LABEL: Record<RecencyTone, string> = {
  green: 'Attended the most recent session',
  amber: 'Attended recently, but not the last session',
  grey: 'Has not attended the last few sessions',
};

function relativeDays(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}wk ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

function recentFor(data: PersonAttendance | undefined, recentCount: number): boolean[] {
  return data?.recent ?? new Array(recentCount).fill(false);
}

interface Props {
  data?: PersonAttendance;
  // Sessions in the activity's recent window. Zero ⇒ no recorded
  // attendance yet, so the indicators render nothing.
  recentCount: number;
}

// Leading status bullet: how recently this person showed up.
export function RecencyDot({ data, recentCount }: Props) {
  if (recentCount === 0) return null;
  const tone = recencyTone(recentFor(data, recentCount));
  return (
    <span
      className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_CLASS[tone]}`}
      title={TONE_LABEL[tone]}
      aria-label={TONE_LABEL[tone]}
    />
  );
}

// Trailing strip of the last N sessions (filled = attended) plus a
// total count.
export function AttendanceStrip({ data, recentCount }: Props) {
  if (recentCount === 0) return null;
  const recent = recentFor(data, recentCount);
  const count = data?.attendedCount ?? 0;
  const title =
    count === 0
      ? 'No recorded attendance yet'
      : `Attended ${count} session${count === 1 ? '' : 's'}` +
        (data?.lastAttended ? ` · last seen ${relativeDays(data.lastAttended)}` : '');

  return (
    <span className="inline-flex items-center gap-1.5" title={title}>
      <span className="inline-flex items-center gap-[3px]">
        {recent.map((present, i) => (
          <span
            key={i}
            className={
              present
                ? 'w-1.5 h-1.5 rounded-full bg-stone-600'
                : 'w-1.5 h-1.5 rounded-full ring-1 ring-inset ring-gray-300'
            }
          />
        ))}
      </span>
      <span className="text-xs font-medium text-gray-500 tabular-nums">{count}×</span>
    </span>
  );
}
