import React, { useEffect, useMemo, useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { fetchTimelineEvents } from '../lib/db/timeline';
import { fetchActivitiesForNucleus } from '../lib/db/nucleus';
import { computeRecurringOccurrences } from '../lib/timeline/recurringOccurrences';
import {
  buildStripWindow,
  colorForItem,
  isItemInWindow,
  MS_PER_DAY,
  opacityFor,
  toFraction,
  VISIBLE_DAYS_EACH_SIDE,
} from '../lib/timeline/compressedStrip';
import type { Activity, TimelineEvent } from '../types';

interface Props {
  nucleusId: string;
  onOpen: () => void;
}

export function CompressedTimelineStrip({ nucleusId, onOpen }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  // Anchor today once so a render mid-day doesn't shift positions.
  const win = useMemo(() => buildStripWindow(), []);

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
        computeRecurringOccurrences(a, { start: win.start, end: win.end }),
      ),
    [activities, win],
  );

  const visibleItems = useMemo(
    () => [...events, ...synthesized].filter(item => isItemInWindow(item, win)),
    [events, synthesized, win],
  );

  // Day ticks across the window, used both for the faint vertical
  // grid and for the small day-of-week labels under the line.
  const dayTicks = useMemo(() => {
    const ticks: Date[] = [];
    for (let i = 0; i <= VISIBLE_DAYS_EACH_SIDE * 2; i++) {
      ticks.push(new Date(win.start.getTime() + i * MS_PER_DAY));
    }
    return ticks;
  }, [win]);

  const todayFraction = toFraction(win.today, win);

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
          const f = toFraction(d, win);
          const op = opacityFor(d, win);
          const isToday = d.getTime() === win.today.getTime();
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
          const startF = toFraction(item.startDate, win);
          const endF = item.endDate ? toFraction(item.endDate, win) : startF;
          const widthPct = Math.max(0, (endF - startF) * 100);
          const op = opacityFor(item.startDate, win);
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
