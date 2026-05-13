import React, { useEffect, useMemo, useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { fetchTimelineEvents } from '../lib/db/timeline';
import { fetchActivitiesForNucleus } from '../lib/db/nucleus';
import { computeRecurringOccurrences } from '../lib/timeline/recurringOccurrences';
import type { Activity, TimelineEvent } from '../types';

// The strip is an ambient temporal context: a glanceable ±10-day
// window centered on today. Everything inside ±7 days renders fully
// opaque; the outer three days on each side fade toward transparent
// to communicate that the full timeline continues beyond what's
// shown. The strip itself is the entry point into the full timeline
// workspace at /nucleus/:id/timeline.
const VISIBLE_DAYS_EACH_SIDE = 10;
const OPAQUE_DAYS_EACH_SIDE = 7;
const MS_PER_DAY = 86_400_000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function colorForItem(item: TimelineEvent): string {
  if (item.activityId) return 'bg-blue-500';
  if (item.itemType === 'meeting') return 'bg-amber-500';
  return 'bg-emerald-500';
}

interface Props {
  nucleusId: string;
  onOpen: () => void;
}

export function CompressedTimelineStrip({ nucleusId, onOpen }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  // Anchor today once so a render mid-day doesn't shift positions.
  const today = useMemo(() => startOfDay(new Date()), []);
  const windowStart = useMemo(
    () => new Date(today.getTime() - VISIBLE_DAYS_EACH_SIDE * MS_PER_DAY),
    [today],
  );
  const windowEnd = useMemo(
    () => new Date(today.getTime() + VISIBLE_DAYS_EACH_SIDE * MS_PER_DAY),
    [today],
  );

  useEffect(() => {
    let cancelled = false;
    fetchTimelineEvents({ nucleusId })
      .then(rows => {
        if (!cancelled) setEvents(rows);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    fetchActivitiesForNucleus(nucleusId)
      .then(rows => {
        if (!cancelled) setActivities(rows);
      })
      .catch(() => {
        if (!cancelled) setActivities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [nucleusId]);

  // Mirror NucleusTimeline: synthesize recurring occurrences from
  // activities so weekly study circles etc. appear on the strip
  // without each occurrence needing a persisted row.
  const synthesized = useMemo(
    () =>
      activities.flatMap(a =>
        computeRecurringOccurrences(a, { start: windowStart, end: windowEnd }),
      ),
    [activities, windowStart, windowEnd],
  );

  const totalSpanMs = windowEnd.getTime() - windowStart.getTime();
  const toFraction = (d: Date) =>
    Math.max(
      0,
      Math.min(1, (d.getTime() - windowStart.getTime()) / totalSpanMs),
    );

  // Linear fade from opaque inside ±7 days to transparent at ±10.
  // Anything outside the visible window is dropped before this is
  // called; clamping defends against edge-case rounding.
  const opacityFor = (d: Date): number => {
    const distDays = Math.abs(d.getTime() - today.getTime()) / MS_PER_DAY;
    if (distDays <= OPAQUE_DAYS_EACH_SIDE) return 1;
    if (distDays >= VISIBLE_DAYS_EACH_SIDE) return 0;
    return (
      1 -
      (distDays - OPAQUE_DAYS_EACH_SIDE) /
        (VISIBLE_DAYS_EACH_SIDE - OPAQUE_DAYS_EACH_SIDE)
    );
  };

  const visibleItems = useMemo(() => {
    const startMs = windowStart.getTime();
    const endMs = windowEnd.getTime();
    return [...events, ...synthesized].filter(item => {
      const s = item.startDate.getTime();
      const e = item.endDate ? item.endDate.getTime() : s;
      return e >= startMs && s <= endMs;
    });
  }, [events, synthesized, windowStart, windowEnd]);

  // Day ticks across the window, used both for the faint vertical
  // grid and for the small day-of-week labels under the line.
  const dayTicks = useMemo(() => {
    const ticks: Date[] = [];
    for (let i = 0; i <= VISIBLE_DAYS_EACH_SIDE * 2; i++) {
      ticks.push(new Date(windowStart.getTime() + i * MS_PER_DAY));
    }
    return ticks;
  }, [windowStart]);

  const todayFraction = toFraction(today);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Open nucleus timeline"
      onClick={onOpen}
      onKeyDown={handleKey}
      className="group relative w-full bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl px-5 py-3 shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-300"
    >
      <div className="flex items-center gap-3 mb-2">
        <CalendarIcon className="w-4 h-4 text-indigo-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Timeline
          </p>
        </div>
        <p className="text-[11px] text-gray-400 group-hover:text-blue-500 transition-colors">
          Open full timeline →
        </p>
      </div>

      {/* Strip: fixed-height, never expands. The mask gradient fades
          the line, ticks, and labels in unison toward each edge so
          the dashboard reads as a window into a longer timeline. */}
      <div
        className="relative h-14 select-none"
        style={{
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)',
          maskImage:
            'linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)',
        }}
      >
        {/* Baseline line */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-gray-300" />

        {/* Day ticks (faint) + labels */}
        {dayTicks.map((d, i) => {
          const f = toFraction(d);
          const op = opacityFor(d);
          const isToday = d.getTime() === today.getTime();
          if (isToday) return null;
          return (
            <React.Fragment key={i}>
              <div
                className="absolute top-1/2 -translate-y-1/2 w-px h-2 bg-gray-300"
                style={{ left: `${f * 100}%`, opacity: op }}
              />
              <div
                className="absolute bottom-0 -translate-x-1/2 text-[10px] text-gray-400 font-medium tabular-nums"
                style={{ left: `${f * 100}%`, opacity: op }}
              >
                {d.toLocaleDateString(undefined, { weekday: 'narrow' })}
              </div>
            </React.Fragment>
          );
        })}

        {/* Today marker — stays opaque since it sits at the center. */}
        <div
          className="absolute top-1 bottom-1 w-px bg-blue-500"
          style={{ left: `${todayFraction * 100}%` }}
        />
        <div
          className="absolute -translate-x-1/2 text-[10px] font-semibold text-blue-600 -top-0.5"
          style={{ left: `${todayFraction * 100}%` }}
        >
          Today
        </div>

        {/* Event markers. Multi-day items render as a thin bar; point
            items render as a small dot. Both sit on the baseline so
            the strip never grows vertically. */}
        {visibleItems.map(item => {
          const startF = toFraction(item.startDate);
          const endF = item.endDate ? toFraction(item.endDate) : startF;
          const widthPct = Math.max(0, (endF - startF) * 100);
          const op = opacityFor(item.startDate);
          if (op <= 0) return null;
          const color = colorForItem(item);
          const isRange = item.endDate && endF > startF + 0.005;
          return (
            <div
              key={item.id}
              title={`${item.name} · ${item.startDate.toLocaleDateString()}`}
              className={`absolute top-1/2 -translate-y-1/2 ${color} ${
                isRange ? 'h-1.5 rounded-full' : 'h-2 w-2 rounded-full -translate-x-1/2'
              }`}
              style={{
                left: `${startF * 100}%`,
                width: isRange ? `${widthPct}%` : undefined,
                opacity: op,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
