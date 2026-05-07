import React, { useEffect, useMemo, useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { ChevronRightIcon, PlusIcon, MinusIcon, XIcon } from 'lucide-react';
import {
  fetchTimelineCycles,
  fetchTimelineEvents,
  updateCycleBoundary,
  insertCycleOverride,
  addTimelineEvent,
} from '../lib/db/timeline';
import { TimelineCycle, TimelineEvent } from '../types';
import {
  buildCycleSchedule,
  ComputedCycle,
} from '../lib/timeline/cycles';
import {
  formatShortDate,
  getDatePercent,
  monthsInRange,
  weeksInRange,
} from '../lib/timeline/dateRange';
import { assignLanes } from '../lib/timeline/lanes';

type TimelineCycleOverride = TimelineCycle;
type ZoomLevel = 'multi-year' | 'year' | 'cycle' | 'month';

// Cluster timelines display calendar years 2026..2030. When nucleus / regional
// timelines are added they will reuse buildCycleSchedule with their own
// scope-specific overrides.
const TIMELINE_START_YEAR = 2026;
const TIMELINE_END_YEAR = 2030;

interface TimelineProps {
  clusterId: string | null;
}

export function Timeline({ clusterId }: TimelineProps) {
  const [overrides, setOverrides] = useState<TimelineCycleOverride[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('multi-year');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<ComputedCycle | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<{ start: Date; end: Date; label: string } | null>(null);
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newEventLocation, setNewEventLocation] = useState('');
  const [panelHeight, setPanelHeight] = useState(256);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Cycles = computed default schedule with DB rows applied as overrides.
  // The computed schedule is the source of truth for cycle boundaries until
  // an admin edits one — guarantees the timeline always renders.
  const cycles = useMemo<ComputedCycle[]>(
    () => buildCycleSchedule({
      fromYear: TIMELINE_START_YEAR,
      toYear: TIMELINE_END_YEAR,
      overrides,
    }),
    [overrides],
  );

  const loadData = () => {
    fetchTimelineCycles({ clusterId: clusterId ?? undefined })
      .then(setOverrides)
      .catch(() => setOverrides([]));
    fetchTimelineEvents({ clusterId: clusterId ?? undefined }).then(setEvents).catch(() => {});
  };

  useEffect(() => { loadData(); }, [clusterId]);

  // Persist a single cycle's edited boundary. If the cycle has never been
  // edited (still computed) we INSERT a new override row; subsequent edits
  // UPDATE that row by id. Callers handle previous/next coordination.
  const persistCycleEdit = async (
    cycle: ComputedCycle,
    patch: { startDate?: Date; endDate?: Date },
  ): Promise<TimelineCycleOverride> => {
    const startDate = patch.startDate ?? cycle.startDate;
    const endDate = patch.endDate ?? cycle.endDate;
    if (cycle.isOverride) {
      await updateCycleBoundary(cycle.id, patch.startDate, patch.endDate);
      return { id: cycle.id, label: cycle.label, startDate, endDate };
    }
    return insertCycleOverride({
      label: cycle.label,
      startDate,
      endDate,
      clusterId: clusterId ?? null,
    });
  };

  // Apply an edit to local override state without waiting for the network.
  // Existing override rows are mutated in place; computed cycles get a
  // synthetic-id override that the next refetch will replace.
  const applyOverrideLocally = (
    list: TimelineCycleOverride[],
    cycle: ComputedCycle,
    patch: { startDate?: Date; endDate?: Date },
  ): TimelineCycleOverride[] => {
    if (cycle.isOverride) {
      return list.map(o => (o.id === cycle.id ? { ...o, ...patch } : o));
    }
    return [
      ...list,
      {
        id: cycle.id,
        label: cycle.label,
        startDate: patch.startDate ?? cycle.startDate,
        endDate: patch.endDate ?? cycle.endDate,
      },
    ];
  };

  // Move the boundary that sits at `cycle.startDate` by ±1 day.
  // This is a single boundary edit that must touch BOTH cycles so there are
  // no gaps or overlaps:
  //   • cycle.startDate += days
  //   • prevCycle.endDate = cycle.startDate - 1
  // If there's no previous cycle (very first cycle in the schedule) the
  // boundary just slides without a partner to update.
  const shiftCycleStart = async (cycle: ComputedCycle, days: number) => {
    const idx = cycles.findIndex(c => c.id === cycle.id);
    if (idx === -1) return;
    const newStart = new Date(cycle.startDate);
    newStart.setDate(newStart.getDate() + days);

    // Don't squash this cycle below 7 days.
    const maxStart = new Date(cycle.endDate);
    maxStart.setDate(maxStart.getDate() - 7);
    if (newStart > maxStart) return;

    const prev = idx > 0 ? cycles[idx - 1] : null;
    let newPrevEnd: Date | null = null;
    if (prev) {
      newPrevEnd = new Date(newStart);
      newPrevEnd.setDate(newPrevEnd.getDate() - 1);
      // Don't squash the previous cycle below 7 days either.
      const prevMinEnd = new Date(prev.startDate);
      prevMinEnd.setDate(prevMinEnd.getDate() + 7);
      if (newPrevEnd < prevMinEnd) return;
    }

    // Optimistic local update.
    setOverrides(curr => {
      let next = applyOverrideLocally(curr, cycle, { startDate: newStart });
      if (prev && newPrevEnd) {
        next = applyOverrideLocally(next, prev, { endDate: newPrevEnd });
      }
      return next;
    });

    // Persist, then refetch so synthetic ids are replaced with real DB ids.
    try {
      await persistCycleEdit(cycle, { startDate: newStart });
      if (prev && newPrevEnd) {
        await persistCycleEdit(prev, { endDate: newPrevEnd });
      }
      const fresh = await fetchTimelineCycles({ clusterId: clusterId ?? undefined });
      setOverrides(fresh);
    } catch (err) {
      console.error('Failed to adjust cycle boundary:', err);
      // Recover by reloading from server.
      fetchTimelineCycles({ clusterId: clusterId ?? undefined })
        .then(setOverrides)
        .catch(() => {});
    }
  };

  // Distinct Gregorian years between TIMELINE_START_YEAR and TIMELINE_END_YEAR
  // that any cycle starts in. Each year contains at most 4 cycles in
  // chronological order (Cycle 4 → 1 → 2 → 3 when fully populated, since
  // Cycle 4 belongs to the prior Bahá’í year).
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const c of cycles) {
      const y = c.startDate.getFullYear();
      if (y >= TIMELINE_START_YEAR && y <= TIMELINE_END_YEAR) set.add(y);
    }
    return [...set].sort((a, b) => a - b);
  }, [cycles]);

  const handleAddEvent = async () => {
    if (!newEventName.trim() || !newEventDate) return;
    const date = new Date(newEventDate);
    date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
    try {
      const newEvent = await addTimelineEvent({
        name: newEventName.trim(),
        startDate: date,
        clusterId: clusterId ?? undefined,
        location: newEventLocation.trim() || undefined,
      });
      setEvents(prev => [...prev, newEvent]);
      setIsAddingEvent(false);
      setNewEventName('');
      setNewEventDate('');
      setNewEventLocation('');
    } catch (err) {
      console.error('Failed to add event:', err);
    }
  };

  const formatDateRange = (e: TimelineEvent) =>
    e.endDate ? `${formatShortDate(e.startDate)} – ${formatShortDate(e.endDate)}` : formatShortDate(e.startDate);

  const [hoveredEvent, setHoveredEvent] = useState<{ event: TimelineEvent; x: number; y: number } | null>(null);

  const renderEvents = (start: Date, end: Date) => {
    const rangeEvents = events.filter(e => {
      const evtEnd = e.endDate || e.startDate;
      return evtEnd >= start && e.startDate <= end;
    });
    if (rangeEvents.length === 0) return null;

    const sorted = [...rangeEvents].sort((a, b) => {
      const diff = a.startDate.getTime() - b.startDate.getTime();
      if (diff !== 0) return diff;
      const aDur = (a.endDate || a.startDate).getTime() - a.startDate.getTime();
      const bDur = (b.endDate || b.startDate).getTime() - b.startDate.getTime();
      return bDur - aDur;
    });

    const intervals = sorted.map(evt => {
      const evtStart = getDatePercent(evt.startDate, start, end);
      const evtEnd = evt.endDate ? getDatePercent(evt.endDate, start, end) : evtStart + 1.5;
      return { start: evtStart, end: evtEnd };
    });
    const { lanes, laneCount } = assignLanes(intervals);

    return (
      <div className="absolute left-0 right-0 bottom-[55%]" style={{ height: `${laneCount * 14 + 4}px` }}>
        {sorted.map((e, i) => {
          const isBar = e.endDate && e.endDate.getTime() > e.startDate.getTime();
          const leftPct = getDatePercent(e.startDate, start, end);
          const rightPct = isBar ? getDatePercent(e.endDate!, start, end) : leftPct;
          const row = lanes[i];
          const bottomOffset = row * 14 + 2;
          if (isBar) {
            return (
              <div
                key={e.id}
                className="absolute cursor-help"
                style={{ left: `${leftPct}%`, width: `${Math.max(rightPct - leftPct, 1)}%`, bottom: `${bottomOffset}px`, height: '10px' }}
                onMouseEnter={ev => {
                  const rect = ev.currentTarget.getBoundingClientRect();
                  setHoveredEvent({ event: e, x: rect.left + rect.width / 2, y: rect.top });
                }}
                onMouseLeave={() => setHoveredEvent(null)}
              >
                <div className="w-full h-full bg-blue-400/80 rounded-sm border border-blue-500/50" />
              </div>
            );
          }
          return (
            <div
              key={e.id}
              className="absolute w-2.5 h-2.5 rounded-full bg-blue-500 cursor-help"
              style={{ left: `${leftPct}%`, bottom: `${bottomOffset}px`, transform: 'translateX(-50%)' }}
              onMouseEnter={ev => {
                const rect = ev.currentTarget.getBoundingClientRect();
                setHoveredEvent({ event: e, x: rect.left + rect.width / 2, y: rect.top });
              }}
              onMouseLeave={() => setHoveredEvent(null)}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] flex flex-col font-sans relative z-40"
      style={{ height: `${panelHeight}px` }}
    >
      {/* Resize handle */}
      <div
        className="flex items-center justify-center gap-2 py-1 border-b border-gray-100 bg-gray-50/30 cursor-row-resize select-none"
        onMouseDown={e => {
          e.preventDefault();
          const startY = e.clientY;
          const startH = panelHeight;
          const onMove = (ev: MouseEvent) => setPanelHeight(Math.max(150, Math.min(500, startH - (ev.clientY - startY))));
          const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
      >
        <div className="w-8 h-1 rounded-full bg-gray-300" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-2 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-600">
          <button onClick={() => setZoomLevel('multi-year')} className={`hover:text-blue-600 transition-colors ${zoomLevel === 'multi-year' ? 'text-gray-900' : ''}`}>
            All Years
          </button>
          {zoomLevel !== 'multi-year' && selectedYear && (
            <>
              <ChevronRightIcon className="w-4 h-4 text-gray-400" />
              <button onClick={() => setZoomLevel('year')} className={`hover:text-blue-600 transition-colors ${zoomLevel === 'year' ? 'text-gray-900' : ''}`}>
                {selectedYear}
              </button>
            </>
          )}
          {(zoomLevel === 'cycle' || zoomLevel === 'month') && selectedCycle && (
            <>
              <ChevronRightIcon className="w-4 h-4 text-gray-400" />
              <button onClick={() => setZoomLevel('cycle')} className={`hover:text-blue-600 transition-colors ${zoomLevel === 'cycle' ? 'text-gray-900' : ''}`}>
                {selectedCycle.label}
              </button>
            </>
          )}
          {zoomLevel === 'month' && selectedMonth && (
            <>
              <ChevronRightIcon className="w-4 h-4 text-gray-400" />
              <span className="text-gray-900">{selectedMonth.label}</span>
            </>
          )}
        </div>
        <button
          onClick={() => setIsAddingEvent(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Add Event
        </button>
      </div>

      {/* Timeline Content */}
      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden relative p-8 flex items-center">
        <div className="min-w-max w-full flex items-center h-full relative px-8">
          <div className="absolute left-8 right-8 h-0.5 bg-gray-300 top-1/2 -translate-y-1/2" />

          {cycles.length === 0 && (
            <div className="text-sm text-gray-400 italic mx-auto">
              No timeline cycles available.
            </div>
          )}

          {/* MULTI-YEAR VIEW */}
          {zoomLevel === 'multi-year' && years.map(year => {
            const yearCycles = cycles.filter(c => c.startDate.getFullYear() === year);
            if (yearCycles.length === 0) return null;
            const yearStart = yearCycles[0].startDate;
            const yearEnd = yearCycles[yearCycles.length - 1].endDate;
            return (
              <div key={year} className="flex-1 min-w-[300px] relative h-full flex flex-col justify-center group cursor-pointer" onClick={() => { setSelectedYear(year); setZoomLevel('year'); }}>
                <div className="absolute top-1/2 -translate-y-1/2 left-0 w-0.5 h-4 bg-gray-400" />
                <div className="absolute -top-8 left-2 font-bold text-gray-900 text-lg group-hover:text-blue-600 transition-colors">{year}</div>
                <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-around">
                  {yearCycles.map(cycle => (
                    <div key={cycle.id} className="bg-white px-2 text-xs font-medium text-gray-500 group-hover:text-blue-500 z-10">{cycle.label}</div>
                  ))}
                </div>
                {renderEvents(yearStart, yearEnd)}
              </div>
            );
          })}

          {/* YEAR VIEW
              Each cycle gets a single date label at its LEFT boundary —
              this is the cycle's start date. The right-pointing chevron and
              the label being anchored flush-left of the tick make it visually
              clear that "Apr 20" belongs to the cycle to the right, not the
              cycle to the left. The +/- buttons shift this same boundary,
              which means cycle.startDate AND prevCycle.endDate move together
              so cycles stay contiguous (no gaps, no overlaps). The very last
              cycle in the year also gets an end-date marker on its right
              edge so the year visually closes. */}
          {zoomLevel === 'year' && selectedYear && (() => {
            const yearCycles = cycles.filter(c => c.startDate.getFullYear() === selectedYear);
            return yearCycles.map((cycle, i) => {
              const isLast = i === yearCycles.length - 1;
              return (
                <div key={cycle.id} className="flex-1 min-w-[250px] relative h-full flex flex-col justify-center group">
                  {/* Boundary tick at the cycle start */}
                  <div className="absolute top-1/2 -translate-y-1/2 left-0 w-0.5 h-6 bg-gray-400" />
                  {/* Start-date label, anchored flush-left of the tick with a
                      right-pointing chevron, so it reads as the START of the
                      cycle to its right. */}
                  <div className="absolute top-1/2 mt-3 left-0 ml-1 flex items-center gap-0.5 text-xs font-medium text-gray-600 whitespace-nowrap">
                    <ChevronRightIcon className="w-3 h-3 text-gray-400" />
                    <span>{formatShortDate(cycle.startDate)}</span>
                  </div>
                  {/* Boundary +/- buttons under the start date — shift the
                      whole boundary, updating both this cycle's start and
                      the previous cycle's end. */}
                  <div className="absolute top-1/2 mt-9 left-0 ml-1 flex items-center gap-0.5 z-20">
                    <button
                      onClick={e => { e.stopPropagation(); shiftCycleStart(cycle, -1); }}
                      className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-600 transition-colors"
                      title="Move boundary 1 day earlier"
                    >
                      <MinusIcon className="w-3 h-3" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); shiftCycleStart(cycle, 1); }}
                      className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-gray-500 hover:text-blue-600 transition-colors"
                      title="Move boundary 1 day later"
                    >
                      <PlusIcon className="w-3 h-3" />
                    </button>
                  </div>
                  {/* Closing end-date marker on the last cycle of the year */}
                  {isLast && (
                    <>
                      <div className="absolute top-1/2 -translate-y-1/2 right-0 w-0.5 h-6 bg-gray-400 z-20" />
                      <div className="absolute top-1/2 mt-3 right-0 mr-1 text-xs font-medium text-gray-500 whitespace-nowrap">
                        ends {formatShortDate(cycle.endDate)}
                      </div>
                    </>
                  )}
                  <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-center cursor-pointer" onClick={() => { setSelectedCycle(cycle); setZoomLevel('cycle'); }}>
                    <div className="bg-white px-3 py-1 text-sm font-bold text-gray-900 group-hover:text-blue-600 z-10 border border-transparent group-hover:border-blue-100 rounded-full transition-all">
                      {cycle.label}
                    </div>
                  </div>
                  {renderEvents(cycle.startDate, cycle.endDate)}
                </div>
              );
            });
          })()}

          {/* CYCLE VIEW */}
          {zoomLevel === 'cycle' && selectedCycle && (() => {
            const months = monthsInRange(selectedCycle.startDate, selectedCycle.endDate);
            return months.map((month, index) => (
              <div key={index} className="flex-1 min-w-[200px] relative h-full flex flex-col justify-center group cursor-pointer" onClick={() => { setSelectedMonth(month); setZoomLevel('month'); }}>
                <div className="absolute top-1/2 -translate-y-1/2 left-0 w-0.5 h-4 bg-gray-400" />
                <div className="absolute top-1/2 mt-3 left-0 -translate-x-1/2 text-xs font-medium text-gray-500">{formatShortDate(month.start)}</div>
                {index === months.length - 1 && <div className="absolute top-1/2 mt-3 right-0 translate-x-1/2 text-xs font-medium text-gray-500">{formatShortDate(month.end)}</div>}
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 font-bold text-gray-900 text-sm group-hover:text-blue-600 bg-white px-2 z-10">{month.label}</div>
                {renderEvents(month.start, month.end)}
              </div>
            ));
          })()}

          {/* MONTH VIEW */}
          {zoomLevel === 'month' && selectedMonth && (() => {
            const weeks = weeksInRange(selectedMonth.start, selectedMonth.end);
            return weeks.map((week, index) => (
              <div key={index} className="flex-1 min-w-[150px] relative h-full flex flex-col justify-center">
                <div className="absolute top-1/2 -translate-y-1/2 left-0 w-0.5 h-3 bg-gray-400" />
                <div className="absolute top-1/2 mt-2 left-0 -translate-x-1/2 text-[10px] font-medium text-gray-400">{formatShortDate(week.start)}</div>
                {index === weeks.length - 1 && <div className="absolute top-1/2 mt-2 right-0 translate-x-1/2 text-[10px] font-medium text-gray-400">{formatShortDate(week.end)}</div>}
                <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 bg-white px-2 text-xs font-semibold text-gray-700 z-10">{week.label}</div>
                {renderEvents(week.start, week.end)}
              </div>
            ));
          })()}
        </div>
      </div>

      {/* Tooltip */}
      {hoveredEvent && (
        <div className="fixed pointer-events-none" style={{ left: hoveredEvent.x, top: hoveredEvent.y - 8, transform: 'translate(-50%, -100%)', zIndex: 9999 }}>
          <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap max-w-[300px]">
            <div className="font-bold">{hoveredEvent.event.name}</div>
            <div className="text-gray-300 mt-0.5">{formatDateRange(hoveredEvent.event)}</div>
            {hoveredEvent.event.location && <div className="text-gray-400 mt-0.5">📍 {hoveredEvent.event.location}</div>}
          </div>
        </div>
      )}

      {/* Add Event Modal */}
      {isAddingEvent && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 10000 }} onClick={e => { if (e.target === e.currentTarget) setIsAddingEvent(false); }}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-gray-900">Add Timeline Event</h3>
              <button onClick={() => setIsAddingEvent(false)} className="text-gray-400 hover:text-gray-600"><XIcon className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Event Name</label>
                <input type="text" value={newEventName} onChange={e => setNewEventName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" placeholder="e.g. Expansion Phase" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Date</label>
                <input type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Location <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" value={newEventLocation} onChange={e => setNewEventLocation(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" placeholder="e.g. Community Centre" />
              </div>
              <div className="pt-2 flex gap-3">
                <button onClick={() => setIsAddingEvent(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50">Cancel</button>
                <button onClick={handleAddEvent} disabled={!newEventName.trim() || !newEventDate} className="flex-1 px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">Save Event</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
