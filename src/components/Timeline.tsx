import React, { useEffect, useMemo, useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
  ChevronRightIcon,
  PlusIcon,
  MinusIcon,
  XIcon,
  CheckIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  fetchTimelineCycles,
  fetchTimelineEvents,
  updateCycleBoundary,
  insertCycleOverride,
  addTimelineEvent,
  updateTimelineEvent,
  deleteTimelineEvent,
} from '../lib/db/timeline';
import { TimelineCycle, TimelineEvent } from '../types';
import { buildCycleSchedule, ComputedCycle } from '../lib/timeline/cycles';
import {
  addDays,
  formatShortDate,
  getDatePercent,
  monthsInRange,
  weeksInRange,
} from '../lib/timeline/dateRange';
import { assignLanes } from '../lib/timeline/lanes';
import { getCallerContext } from '../lib/db/users';
import {
  type CallerContext,
  canManageClusterTimelineEvents,
} from '../lib/permissions';

type TimelineCycleOverride = TimelineCycle;
type ZoomLevel = 'multi-year' | 'year' | 'cycle' | 'month';

// Cluster timelines display calendar years 2026..2030. Nucleus / regional
// timelines will reuse buildCycleSchedule with their own scope-specific
// overrides when those scopes ship.
const TIMELINE_START_YEAR = 2026;
const TIMELINE_END_YEAR = 2030;

// Reference month length used to compute proportional widths in the cycle
// view. Using a fixed 30 keeps Feb and a 31-day month visually equivalent
// when both are fully contained — only partial months at the cycle's edges
// look shorter.
const STANDARD_MONTH_DAYS = 30;
const CYCLE_VIEW_MONTH_MIN_PX_PER_FACTOR = 200;
const CYCLE_VIEW_MONTH_MIN_PX_FLOOR = 80;

interface TimelineProps {
  clusterId: string | null;
}

interface CycleSlot {
  bahaiYear: number;
  cycleNumber: 1 | 2 | 3 | 4;
}

type EventModalState =
  | { mode: 'add' }
  | { mode: 'edit'; event: TimelineEvent };

export function Timeline({ clusterId }: TimelineProps) {
  const [overrides, setOverrides] = useState<TimelineCycleOverride[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [callerCtx, setCallerCtx] = useState<CallerContext | null>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('multi-year');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedCycleSlot, setSelectedCycleSlot] = useState<CycleSlot | null>(null);
  const [selectedMonth, setSelectedMonth] =
    useState<{ start: Date; end: Date; label: string } | null>(null);
  const [panelHeight, setPanelHeight] = useState(256);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ───── Pending boundary shifts ────────────────────────────────────────
  // Edits to cycle dates accumulate locally in `pendingShifts` (keyed by
  // cycle id, value = days shifted from the persisted boundary). They only
  // hit the database when the user clicks "Save changes" in the
  // confirmation banner. "Discard" clears them. This lets users hold the +
  // button down to walk a boundary by many days without confirming each
  // step.
  const [pendingShifts, setPendingShifts] = useState<Record<string, number>>({});

  // ───── Event editor modal ─────────────────────────────────────────────
  const [eventModal, setEventModal] = useState<EventModalState | null>(null);
  const [formName, setFormName] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formLocation, setFormLocation] = useState('');

  const canManageEvents = useMemo(
    () => (callerCtx ? canManageClusterTimelineEvents(callerCtx, clusterId) : false),
    [callerCtx, clusterId],
  );

  // ───── Data loading ───────────────────────────────────────────────────
  const reloadCycles = () =>
    fetchTimelineCycles({ clusterId: clusterId ?? undefined })
      .then(setOverrides)
      .catch(() => setOverrides([]));

  const reloadEvents = () =>
    fetchTimelineEvents({ clusterId: clusterId ?? undefined })
      .then(setEvents)
      .catch(() => {});

  useEffect(() => {
    reloadCycles();
    reloadEvents();
    // Reset state that's tied to the cluster scope.
    setPendingShifts({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId]);

  useEffect(() => {
    getCallerContext().then(setCallerCtx).catch(() => setCallerCtx(null));
  }, []);

  // ───── Cycle schedule derivation ──────────────────────────────────────
  // 1. Computed defaults (with DB overrides applied) → `cycles`.
  // 2. Pending boundary shifts overlaid → `displayedCycles`. These are
  //    what the UI renders at every zoom level so the user sees their
  //    in-flight edits reflected before they confirm.
  const cycles = useMemo<ComputedCycle[]>(
    () =>
      buildCycleSchedule({
        fromYear: TIMELINE_START_YEAR,
        toYear: TIMELINE_END_YEAR,
        overrides,
      }),
    [overrides],
  );

  const displayedCycles = useMemo<ComputedCycle[]>(() => {
    if (Object.keys(pendingShifts).length === 0) return cycles;
    return cycles.map((c, i) => {
      const myShift = pendingShifts[c.id] ?? 0;
      const next = i + 1 < cycles.length ? cycles[i + 1] : null;
      const nextShift = next ? pendingShifts[next.id] ?? 0 : 0;
      const newStart = myShift !== 0 ? addDays(c.startDate, myShift) : c.startDate;
      const newEnd =
        next && nextShift !== 0 ? addDays(c.endDate, nextShift) : c.endDate;
      return { ...c, startDate: newStart, endDate: newEnd };
    });
  }, [cycles, pendingShifts]);

  const hasPendingShifts = Object.keys(pendingShifts).length > 0;

  // Distinct Gregorian years between TIMELINE_START_YEAR and
  // TIMELINE_END_YEAR. Each year contains at most 4 cycles in chronological
  // order (Cycle 4 → 1 → 2 → 3 when fully populated).
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const c of displayedCycles) {
      const y = c.startDate.getFullYear();
      if (y >= TIMELINE_START_YEAR && y <= TIMELINE_END_YEAR) set.add(y);
    }
    return [...set].sort((a, b) => a - b);
  }, [displayedCycles]);

  const selectedCycle = useMemo<ComputedCycle | null>(() => {
    if (!selectedCycleSlot) return null;
    return (
      displayedCycles.find(
        c =>
          c.bahaiYear === selectedCycleSlot.bahaiYear &&
          c.cycleNumber === selectedCycleSlot.cycleNumber,
      ) ?? null
    );
  }, [displayedCycles, selectedCycleSlot]);

  // ───── Boundary shift requests (no DB write — stages a pending change) ─
  const requestShift = (cycle: ComputedCycle, days: number) => {
    const idx = displayedCycles.findIndex(c => c.id === cycle.id);
    if (idx === -1) return;
    const dCycle = displayedCycles[idx];
    const tentativeStart = addDays(dCycle.startDate, days);

    // This cycle must remain at least 7 days long.
    if (addDays(tentativeStart, 6) > dCycle.endDate) return;

    // Previous cycle (if any) must also remain at least 7 days long.
    const prev = idx > 0 ? displayedCycles[idx - 1] : null;
    if (prev) {
      const tentativePrevEnd = addDays(tentativeStart, -1);
      if (addDays(prev.startDate, 6) > tentativePrevEnd) return;
    }

    setPendingShifts(s => {
      const newShift = (s[cycle.id] ?? 0) + days;
      if (newShift === 0) {
        const { [cycle.id]: _drop, ...rest } = s;
        return rest;
      }
      return { ...s, [cycle.id]: newShift };
    });
  };

  const confirmPendingShifts = async () => {
    if (!hasPendingShifts) return;

    // Collect per-cycle final dates. A boundary shift between cycle A and
    // B updates A.endDate AND B.startDate together, so a cycle can appear
    // in the update set with both fields set if BOTH of its boundaries
    // were touched.
    const updates = new Map<
      string,
      { cycle: ComputedCycle; newStart?: Date; newEnd?: Date }
    >();
    cycles.forEach((c, i) => {
      const shift = pendingShifts[c.id] ?? 0;
      if (shift === 0) return;
      const newStart = addDays(c.startDate, shift);
      const u = updates.get(c.id) ?? { cycle: c };
      u.newStart = newStart;
      updates.set(c.id, u);
      if (i > 0) {
        const prev = cycles[i - 1];
        const newPrevEnd = addDays(newStart, -1);
        const pu = updates.get(prev.id) ?? { cycle: prev };
        pu.newEnd = newPrevEnd;
        updates.set(prev.id, pu);
      }
    });

    try {
      for (const [, u] of updates) {
        await persistCycleEdit(u.cycle, {
          startDate: u.newStart,
          endDate: u.newEnd,
        });
      }
      setPendingShifts({});
      await reloadCycles();
    } catch (err) {
      console.error('Failed to save cycle date changes:', err);
      // Recover from server.
      await reloadCycles();
    }
  };

  const discardPendingShifts = () => setPendingShifts({});

  // ───── Cycle persistence helper ───────────────────────────────────────
  // INSERT a new override row for never-edited (computed) cycles, UPDATE
  // an existing override row otherwise. Caller passes the boundary patch.
  const persistCycleEdit = async (
    cycle: ComputedCycle,
    patch: { startDate?: Date; endDate?: Date },
  ): Promise<void> => {
    const startDate = patch.startDate ?? cycle.startDate;
    const endDate = patch.endDate ?? cycle.endDate;
    if (cycle.isOverride) {
      await updateCycleBoundary(cycle.id, patch.startDate, patch.endDate);
      return;
    }
    await insertCycleOverride({
      label: cycle.label,
      startDate,
      endDate,
      clusterId: clusterId ?? null,
    });
  };

  // ───── Event modal helpers ────────────────────────────────────────────
  const openAddEvent = (defaultStart?: Date) => {
    if (!canManageEvents) return;
    setFormName('');
    setFormStart(defaultStart ? toDateInputValue(defaultStart) : '');
    setFormEnd('');
    setFormLocation('');
    setEventModal({ mode: 'add' });
  };

  const openEditEvent = (event: TimelineEvent) => {
    if (!canManageEvents) return;
    setFormName(event.name);
    setFormStart(toDateInputValue(event.startDate));
    setFormEnd(event.endDate ? toDateInputValue(event.endDate) : '');
    setFormLocation(event.location ?? '');
    setEventModal({ mode: 'edit', event });
  };

  const closeEventModal = () => setEventModal(null);

  const saveEvent = async () => {
    if (!eventModal) return;
    if (!formName.trim() || !formStart) return;
    const startDate = parseDateInput(formStart);
    const endDate = formEnd ? parseDateInput(formEnd) : null;
    if (endDate && endDate < startDate) return;
    const location = formLocation.trim() || null;
    try {
      if (eventModal.mode === 'add') {
        const newEvent = await addTimelineEvent({
          name: formName.trim(),
          startDate,
          endDate: endDate ?? undefined,
          clusterId: clusterId ?? undefined,
          location: location ?? undefined,
        });
        setEvents(prev => [...prev, newEvent]);
      } else {
        const updated = await updateTimelineEvent(eventModal.event.id, {
          name: formName.trim(),
          startDate,
          endDate,
          location,
        });
        setEvents(prev => prev.map(e => (e.id === updated.id ? updated : e)));
      }
      closeEventModal();
    } catch (err) {
      console.error('Failed to save event:', err);
    }
  };

  const deleteEvent = async () => {
    if (!eventModal || eventModal.mode !== 'edit') return;
    const id = eventModal.event.id;
    try {
      await deleteTimelineEvent(id);
      setEvents(prev => prev.filter(e => e.id !== id));
      closeEventModal();
    } catch (err) {
      console.error('Failed to delete event:', err);
    }
  };

  // ───── Event rendering ────────────────────────────────────────────────
  const formatDateRange = (e: TimelineEvent) =>
    e.endDate
      ? `${formatShortDate(e.startDate)} – ${formatShortDate(e.endDate)}`
      : formatShortDate(e.startDate);

  const [hoveredEvent, setHoveredEvent] =
    useState<{ event: TimelineEvent; x: number; y: number } | null>(null);

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
      const evtEnd = evt.endDate
        ? getDatePercent(evt.endDate, start, end)
        : evtStart + 1.5;
      return { start: evtStart, end: evtEnd };
    });
    const { lanes, laneCount } = assignLanes(intervals);

    const onEventClick = canManageEvents
      ? (e: TimelineEvent) => openEditEvent(e)
      : undefined;
    const interactionClass = onEventClick ? 'cursor-pointer' : 'cursor-help';

    return (
      <div
        className="absolute left-0 right-0 bottom-[55%]"
        style={{ height: `${laneCount * 14 + 4}px` }}
      >
        {sorted.map((e, i) => {
          const isBar = e.endDate && e.endDate.getTime() > e.startDate.getTime();
          const leftPct = getDatePercent(e.startDate, start, end);
          const rightPct = isBar
            ? getDatePercent(e.endDate!, start, end)
            : leftPct;
          const row = lanes[i];
          const bottomOffset = row * 14 + 2;
          const onMouseEnter = (ev: React.MouseEvent) => {
            const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
            setHoveredEvent({
              event: e,
              x: rect.left + rect.width / 2,
              y: rect.top,
            });
          };
          const onMouseLeave = () => setHoveredEvent(null);
          if (isBar) {
            return (
              <div
                key={e.id}
                className={`absolute ${interactionClass}`}
                style={{
                  left: `${leftPct}%`,
                  width: `${Math.max(rightPct - leftPct, 1)}%`,
                  bottom: `${bottomOffset}px`,
                  height: '10px',
                }}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onClick={onEventClick ? () => onEventClick(e) : undefined}
              >
                <div className="w-full h-full bg-blue-400/80 rounded-sm border border-blue-500/50 hover:bg-blue-500/90 transition-colors" />
              </div>
            );
          }
          return (
            <div
              key={e.id}
              className={`absolute w-2.5 h-2.5 rounded-full bg-blue-500 hover:bg-blue-600 transition-colors ${interactionClass}`}
              style={{
                left: `${leftPct}%`,
                bottom: `${bottomOffset}px`,
                transform: 'translateX(-50%)',
              }}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              onClick={onEventClick ? () => onEventClick(e) : undefined}
            />
          );
        })}
      </div>
    );
  };

  // ───── Render ────────────────────────────────────────────────────────
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
          const onMove = (ev: MouseEvent) =>
            setPanelHeight(
              Math.max(150, Math.min(500, startH - (ev.clientY - startY))),
            );
          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
      >
        <div className="w-8 h-1 rounded-full bg-gray-300" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-2 border-b border-gray-100 bg-gray-50/50 gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-600 min-w-0">
          <button
            onClick={() => setZoomLevel('multi-year')}
            className={`hover:text-blue-600 transition-colors ${
              zoomLevel === 'multi-year' ? 'text-gray-900' : ''
            }`}
          >
            All Years
          </button>
          {zoomLevel !== 'multi-year' && selectedYear && (
            <>
              <ChevronRightIcon className="w-4 h-4 text-gray-400" />
              <button
                onClick={() => setZoomLevel('year')}
                className={`hover:text-blue-600 transition-colors ${
                  zoomLevel === 'year' ? 'text-gray-900' : ''
                }`}
              >
                {selectedYear}
              </button>
            </>
          )}
          {(zoomLevel === 'cycle' || zoomLevel === 'month') && selectedCycle && (
            <>
              <ChevronRightIcon className="w-4 h-4 text-gray-400" />
              <button
                onClick={() => setZoomLevel('cycle')}
                className={`hover:text-blue-600 transition-colors ${
                  zoomLevel === 'cycle' ? 'text-gray-900' : ''
                }`}
              >
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
        <div className="flex items-center gap-2">
          {/* Pending boundary changes — sticky banner that doesn't block
              further +/- presses; user confirms only after they're done
              walking the boundary by however many days they need. */}
          {hasPendingShifts && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-xs font-semibold text-amber-900 whitespace-nowrap">
                Confirm cycle date change?
              </span>
              <button
                onClick={confirmPendingShifts}
                className="flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white text-xs font-bold rounded-md hover:bg-emerald-700 transition-colors"
                title="Save changes"
              >
                <CheckIcon className="w-3 h-3" />
                Yes
              </button>
              <button
                onClick={discardPendingShifts}
                className="flex items-center gap-1 px-2 py-1 bg-white text-gray-700 border border-gray-300 text-xs font-bold rounded-md hover:bg-gray-50 transition-colors"
                title="Discard changes"
              >
                <XIcon className="w-3 h-3" />
                No
              </button>
            </div>
          )}
          {canManageEvents && (
            <button
              onClick={() => openAddEvent()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add Event
            </button>
          )}
        </div>
      </div>

      {/* Timeline Content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden relative p-8 flex items-center"
      >
        <div className="min-w-max w-full flex items-center h-full relative px-8">
          <div className="absolute left-8 right-8 h-0.5 bg-gray-300 top-1/2 -translate-y-1/2" />

          {displayedCycles.length === 0 && (
            <div className="text-sm text-gray-400 italic mx-auto">
              No timeline cycles available.
            </div>
          )}

          {/* MULTI-YEAR VIEW */}
          {zoomLevel === 'multi-year' &&
            years.map(year => {
              const yearCycles = displayedCycles.filter(
                c => c.startDate.getFullYear() === year,
              );
              if (yearCycles.length === 0) return null;
              const yearStart = yearCycles[0].startDate;
              const yearEnd = yearCycles[yearCycles.length - 1].endDate;
              return (
                <div
                  key={year}
                  className="flex-1 min-w-[300px] relative h-full flex flex-col justify-center group cursor-pointer"
                  onClick={() => {
                    setSelectedYear(year);
                    setZoomLevel('year');
                  }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 left-0 w-0.5 h-4 bg-gray-400" />
                  <div className="absolute -top-8 left-2 font-bold text-gray-900 text-lg group-hover:text-blue-600 transition-colors">
                    {year}
                  </div>
                  <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-around">
                    {yearCycles.map(cycle => (
                      <div
                        key={cycle.id}
                        className="bg-white px-2 text-xs font-medium text-gray-500 group-hover:text-blue-500 z-10"
                      >
                        {cycle.label}
                      </div>
                    ))}
                  </div>
                  {renderEvents(yearStart, yearEnd)}
                </div>
              );
            })}

          {/* YEAR VIEW
              Each cycle gets a single date label at its LEFT boundary —
              that's the cycle's start date. The right-pointing chevron and
              flush-left placement make it visually clear the date belongs
              to the cycle on the right (a starting boundary, not an ending
              one). +/- buttons under the date stage a pending shift that
              moves the boundary itself: cycle.startDate AND
              prevCycle.endDate move together so cycles stay contiguous (no
              gaps, no overlaps). The very last cycle of the year also gets
              a closing "ends <date>" marker on its right edge so the year
              visually completes. Pending changes are highlighted in amber
              and only persist after the user confirms in the header. */}
          {zoomLevel === 'year' &&
            selectedYear &&
            (() => {
              const yearCycles = displayedCycles.filter(
                c => c.startDate.getFullYear() === selectedYear,
              );
              return yearCycles.map((cycle, i) => {
                const isLast = i === yearCycles.length - 1;
                const pending = (pendingShifts[cycle.id] ?? 0) !== 0;
                const dateChipClass = pending
                  ? 'text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded'
                  : 'text-gray-600';
                return (
                  <div
                    key={cycle.id}
                    className="flex-1 min-w-[250px] relative h-full flex flex-col justify-center group"
                  >
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 left-0 w-0.5 h-6 ${
                        pending ? 'bg-amber-400' : 'bg-gray-400'
                      }`}
                    />
                    <div className="absolute top-1/2 mt-3 left-0 ml-1 flex items-center gap-0.5 text-xs font-medium whitespace-nowrap">
                      <ChevronRightIcon className="w-3 h-3 text-gray-400" />
                      <span className={dateChipClass}>
                        {formatShortDate(cycle.startDate)}
                      </span>
                    </div>
                    {/* Boundary +/- buttons: stage pending shifts, no DB
                        write until user confirms in the header. Only shown
                        to admins (matches the timeline_cycles RLS policy). */}
                    {callerCtx?.isAdmin && (
                      <div className="absolute top-1/2 mt-9 left-0 ml-1 flex items-center gap-0.5 z-20">
                        <button
                          onClick={ev => {
                            ev.stopPropagation();
                            requestShift(cycle, -1);
                          }}
                          className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-600 transition-colors"
                          title="Move boundary 1 day earlier"
                        >
                          <MinusIcon className="w-3 h-3" />
                        </button>
                        <button
                          onClick={ev => {
                            ev.stopPropagation();
                            requestShift(cycle, 1);
                          }}
                          className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-gray-500 hover:text-blue-600 transition-colors"
                          title="Move boundary 1 day later"
                        >
                          <PlusIcon className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    {isLast &&
                      (() => {
                        // The closing edge is the start of the *next*
                        // cycle in the schedule, minus one day. Show its
                        // pending state too.
                        const nextIdx = displayedCycles.indexOf(cycle) + 1;
                        const next =
                          nextIdx < displayedCycles.length
                            ? displayedCycles[nextIdx]
                            : null;
                        const nextPending = next
                          ? (pendingShifts[next.id] ?? 0) !== 0
                          : false;
                        return (
                          <>
                            <div
                              className={`absolute top-1/2 -translate-y-1/2 right-0 w-0.5 h-6 z-20 ${
                                nextPending ? 'bg-amber-400' : 'bg-gray-400'
                              }`}
                            />
                            <div className="absolute top-1/2 mt-3 right-0 mr-1 text-xs font-medium text-gray-500 whitespace-nowrap">
                              ends{' '}
                              <span
                                className={
                                  nextPending
                                    ? 'text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded'
                                    : ''
                                }
                              >
                                {formatShortDate(cycle.endDate)}
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-center cursor-pointer"
                      onClick={() => {
                        setSelectedCycleSlot({
                          bahaiYear: cycle.bahaiYear,
                          cycleNumber: cycle.cycleNumber,
                        });
                        setZoomLevel('cycle');
                      }}
                    >
                      <div className="bg-white px-3 py-1 text-sm font-bold text-gray-900 group-hover:text-blue-600 z-10 border border-transparent group-hover:border-blue-100 rounded-full transition-all">
                        {cycle.label}
                      </div>
                    </div>
                    {renderEvents(cycle.startDate, cycle.endDate)}
                  </div>
                );
              });
            })()}

          {/* CYCLE VIEW
              Months are drawn with a width proportional to how much of the
              cycle they cover. A fully-included month gets factor 1.0; a
              partial month at the cycle's edge gets daysIncluded /
              STANDARD_MONTH_DAYS. Using a fixed 30 keeps Feb and a 31-day
              month visually identical when both are full — only the
              partials look "short". */}
          {zoomLevel === 'cycle' &&
            selectedCycle &&
            (() => {
              const months = monthsInRange(
                selectedCycle.startDate,
                selectedCycle.endDate,
              );
              return months.map((month, index) => {
                const lastDayOfMonth = new Date(
                  month.start.getFullYear(),
                  month.start.getMonth() + 1,
                  0,
                ).getDate();
                const isFullMonth =
                  month.start.getDate() === 1 &&
                  month.end.getDate() === lastDayOfMonth;
                const daysIncluded =
                  Math.round(
                    (month.end.getTime() - month.start.getTime()) /
                      86400000,
                  ) + 1;
                const widthFactor = isFullMonth
                  ? 1
                  : Math.max(0.15, daysIncluded / STANDARD_MONTH_DAYS);
                const minWidth = Math.max(
                  CYCLE_VIEW_MONTH_MIN_PX_FLOOR,
                  CYCLE_VIEW_MONTH_MIN_PX_PER_FACTOR * widthFactor,
                );
                return (
                  <div
                    key={index}
                    className="relative h-full flex flex-col justify-center group cursor-pointer"
                    style={{
                      flex: `${widthFactor} 1 0%`,
                      minWidth: `${minWidth}px`,
                    }}
                    onClick={() => {
                      setSelectedMonth(month);
                      setZoomLevel('month');
                    }}
                  >
                    <div className="absolute top-1/2 -translate-y-1/2 left-0 w-0.5 h-4 bg-gray-400" />
                    <div className="absolute top-1/2 mt-3 left-0 -translate-x-1/2 text-xs font-medium text-gray-500">
                      {formatShortDate(month.start)}
                    </div>
                    {index === months.length - 1 && (
                      <div className="absolute top-1/2 mt-3 right-0 translate-x-1/2 text-xs font-medium text-gray-500">
                        {formatShortDate(month.end)}
                      </div>
                    )}
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 font-bold text-gray-900 text-sm group-hover:text-blue-600 bg-white px-2 z-10">
                      {month.label}
                    </div>
                    {renderEvents(month.start, month.end)}
                  </div>
                );
              });
            })()}

          {/* MONTH VIEW
              weeksInRange labels each chunk by its week-of-month, so a
              cycle that starts mid-month (e.g. Jan 20) shows "Week 3" /
              "Week 4" for the partial January, while full months still
              read 1..N as before. */}
          {zoomLevel === 'month' &&
            selectedMonth &&
            (() => {
              const weeks = weeksInRange(selectedMonth.start, selectedMonth.end);
              return weeks.map((week, index) => (
                <div
                  key={index}
                  className="flex-1 min-w-[150px] relative h-full flex flex-col justify-center"
                >
                  <div className="absolute top-1/2 -translate-y-1/2 left-0 w-0.5 h-3 bg-gray-400" />
                  <div className="absolute top-1/2 mt-2 left-0 -translate-x-1/2 text-[10px] font-medium text-gray-400">
                    {formatShortDate(week.start)}
                  </div>
                  {index === weeks.length - 1 && (
                    <div className="absolute top-1/2 mt-2 right-0 translate-x-1/2 text-[10px] font-medium text-gray-400">
                      {formatShortDate(week.end)}
                    </div>
                  )}
                  <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 bg-white px-2 text-xs font-semibold text-gray-700 z-10">
                    {week.label}
                  </div>
                  {renderEvents(week.start, week.end)}
                </div>
              ));
            })()}
        </div>
      </div>

      {/* Tooltip */}
      {hoveredEvent && (
        <div
          className="fixed pointer-events-none"
          style={{
            left: hoveredEvent.x,
            top: hoveredEvent.y - 8,
            transform: 'translate(-50%, -100%)',
            zIndex: 9999,
          }}
        >
          <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap max-w-[300px]">
            <div className="font-bold">{hoveredEvent.event.name}</div>
            <div className="text-gray-300 mt-0.5">
              {formatDateRange(hoveredEvent.event)}
            </div>
            {hoveredEvent.event.location && (
              <div className="text-gray-400 mt-0.5">
                📍 {hoveredEvent.event.location}
              </div>
            )}
            {canManageEvents && (
              <div className="text-gray-400 mt-1 italic">Click to edit</div>
            )}
          </div>
        </div>
      )}

      {/* Event editor modal — handles add, edit, and delete in one shape */}
      {eventModal &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
            style={{ zIndex: 10000 }}
            onClick={e => {
              if (e.target === e.currentTarget) closeEventModal();
            }}
          >
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-lg font-bold text-gray-900">
                  {eventModal.mode === 'add'
                    ? 'Add Timeline Event'
                    : 'Edit Timeline Event'}
                </h3>
                <button
                  onClick={closeEventModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Event Name
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="e.g. Expansion Phase"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={formStart}
                      onChange={e => setFormStart(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      End Date{' '}
                      <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={formEnd}
                      onChange={e => setFormEnd(e.target.value)}
                      min={formStart || undefined}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Location{' '}
                    <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formLocation}
                    onChange={e => setFormLocation(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="e.g. Community Centre"
                  />
                </div>
                <div className="pt-2 flex gap-3 items-center">
                  {eventModal.mode === 'edit' && (
                    <button
                      onClick={deleteEvent}
                      className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-700 font-semibold rounded-xl hover:bg-red-50 transition-colors"
                      title="Delete event"
                    >
                      <Trash2Icon className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                  <div className="flex-1" />
                  <button
                    onClick={closeEventModal}
                    className="px-4 py-2 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEvent}
                    disabled={!formName.trim() || !formStart}
                    className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50"
                  >
                    {eventModal.mode === 'add' ? 'Save Event' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ─── Local helpers ──────────────────────────────────────────────────────

function toDateInputValue(d: Date): string {
  // <input type="date"> wants YYYY-MM-DD in local time. Compose it directly
  // from the Date's local fields to avoid UTC-shift surprises.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateInput(value: string): Date {
  // Treat the YYYY-MM-DD value as a local-calendar date.
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
