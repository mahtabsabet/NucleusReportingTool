import React, { useState } from 'react';
import { ChevronDownIcon, CheckIcon, XIcon } from 'lucide-react';
import { recencyTone, type RecencyTone, type PersonAttendance } from '../lib/db/journal';

const DOT_CLASS: Record<RecencyTone, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-400',
  grey: 'bg-gray-300',
};

// Plain-language meaning of each tone, shared by the dot tooltip and
// the legend.
const TONE_LABEL: Record<RecencyTone, string> = {
  green: 'Recently attended',
  amber: 'Uneven attendance',
  grey: "Hasn't attended in a while",
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

function formatSessionDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function recentFor(data: PersonAttendance | undefined, recentCount: number): boolean[] {
  return data?.recent ?? new Array(recentCount).fill(false);
}

function summaryTitle(data: PersonAttendance | undefined): string {
  const count = data?.attendedCount ?? 0;
  if (count === 0) return 'No recorded attendance yet';
  return (
    `Attended ${count} session${count === 1 ? '' : 's'}` +
    (data?.lastAttended ? ` · last seen ${relativeDays(data.lastAttended)}` : '')
  );
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

  return (
    <span className="inline-flex items-center gap-1.5" title={summaryTitle(data)}>
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

// Explains what each datum means. Rendered once near a roster/section
// header so the dots, strip, and count are self-documenting.
export function AttendanceLegend({ recentCount }: { recentCount: number }) {
  if (recentCount === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
      <span className="inline-flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-emerald-500" /> recently attended
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-amber-400" /> uneven attendance
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-gray-300" /> hasn't attended in a while
      </span>
      <span className="text-gray-300">·</span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-flex items-center gap-[3px]">
          <span className="w-1.5 h-1.5 rounded-full bg-stone-600" />
          <span className="w-1.5 h-1.5 rounded-full ring-1 ring-inset ring-gray-300" />
        </span>
        last {recentCount} session{recentCount === 1 ? '' : 's'} (filled = attended)
      </span>
      <span className="text-gray-300">·</span>
      <span><span className="tabular-nums">12×</span> total attended</span>
    </div>
  );
}

// Clickable badge (dot + strip + count) that expands to a per-session
// breakdown. Used on the individual profile, next to each activity.
export function AttendanceBadge({
  data,
  recentSessionDates,
}: {
  data?: PersonAttendance;
  recentSessionDates: Date[];
}) {
  const [open, setOpen] = useState(false);
  const recentCount = recentSessionDates.length;
  if (recentCount === 0) return null;

  const recent = recentFor(data, recentCount);
  const tone = recencyTone(recent);
  // Newest session first in the breakdown.
  const rows = recentSessionDates
    .map((date, i) => ({ date, present: recent[i] }))
    .reverse();

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 rounded-lg px-1.5 py-1 -ml-1.5 hover:bg-gray-50 transition-colors"
        aria-expanded={open}
        title={summaryTitle(data)}
      >
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_CLASS[tone]}`}
          aria-label={TONE_LABEL[tone]}
        />
        <AttendanceStrip data={data} recentCount={recentCount} />
        <ChevronDownIcon
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3 text-xs shadow-sm">
          <p className="font-medium text-gray-700 mb-2">{summaryTitle(data)}</p>
          <ul className="space-y-1">
            {rows.map(({ date, present }, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="text-gray-600">{formatSessionDate(date)}</span>
                {present ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                    <CheckIcon className="w-3.5 h-3.5" /> attended
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-gray-400">
                    <XIcon className="w-3.5 h-3.5" /> missed
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 pt-2 border-t border-gray-100 text-gray-400">
            Showing the last {recentCount} recorded session{recentCount === 1 ? '' : 's'}.
          </p>
        </div>
      )}
    </div>
  );
}
