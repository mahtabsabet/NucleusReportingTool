import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactDOM from 'react-dom';
import {
  PlusIcon,
  MinusIcon,
  XIcon,
  CheckIcon,
  Trash2Icon,
  MaximizeIcon,
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
  formatMonthYear,
} from '../lib/timeline/dateRange';
import { assignLanes } from '../lib/timeline/lanes';
import {
  clampPxPerDay,
  dateAtPixel,
  daysBetween,
  fadeIn,
  pixelAtDate,
} from '../lib/timeline/scale';
import { getCallerContext } from '../lib/db/users';
import {
  type CallerContext,
  canManageClusterTimelineEvents,
} from '../lib/permissions';

type TimelineCycleOverride = TimelineCycle;

// Cluster timelines display calendar years 2026..2030. Nucleus / regional
// timelines will reuse buildCycleSchedule with their own scope-specific
// overrides when those scopes ship.
const TIMELINE_START_YEAR = 2026;
const TIMELINE_END_YEAR = 2030;

// pxPerDay thresholds at which each tick layer fades in. Year ticks are
// always visible; the rest fade in as the user zooms past the listed
// pxPerDay values. Numbers picked so adjacent layers' labels never
// visually compete for the same horizontal space.
// Cycles fade in well above the fit-all floor (~0.66 ppd for a 5-year
// span in a typical viewport) so the fully-zoomed-out view stays clean —
// at fit-all, 20+ cycle labels and 20+ start-date chips would crowd the
// strip. They reach full opacity around 1.6 ppd, which is comfortably
// less than the default 1-year view's ~3.3 ppd.
const CYCLE_FADE = [0.9, 1.6] as const;
const MONTH_FADE = [1.4, 2.4] as const;
const WEEK_FADE = [5, 9] as const;
const DAY_FADE = [15, 22] as const;
// The cycle-boundary +/- editor needs ~80px of horizontal space next to
// the boundary to be usable. Show only when each cycle is at least this
// wide on screen.
const CYCLE_EDIT_MIN_PX = 140;

interface TimelineProps {
  clusterId: string | null;
}

type EventModalState =
  | { mode: 'add' }
  | { mode: 'edit'; event: TimelineEvent };

export function Timeline({ clusterId }: TimelineProps) {
  const [overrides, setOverrides] = useState<TimelineCycleOverride[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [callerCtx, setCallerCtx] = useState<CallerContext | null>(null);
  const [panelHeight, setPanelHeight] = useState(256);

  // ───── Pending boundary shifts ────────────────────────────────────────
  // Edits to cycle dates accumulate locally in `pendingShifts` (keyed by
  // cycle id, value = days shifted from the persisted boundary). They only
  // hit the database when the user clicks "Save changes" in the
  // confirmation banner. "Discard" clears them.
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
    setPendingShifts({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId]);

  useEffect(() => {
    getCallerContext().then(setCallerCtx).catch(() => setCallerCtx(null));
  }, []);

  // ───── Cycle schedule derivation ──────────────────────────────────────
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

  // ───── Continuous-zoom viewport ───────────────────────────────────────
  // The whole timeline lives on a single horizontal axis: an inner div
  // whose width is `totalDays * pxPerDay`. Panning is just the browser's
  // scrollLeft on the outer container; zooming changes pxPerDay and
  // adjusts scrollLeft to keep the cursor anchored on the same date.
  const minDate = useMemo(
    () =>
      displayedCycles.length > 0
        ? displayedCycles[0].startDate
        : new Date(TIMELINE_START_YEAR, 0, 1),
    [displayedCycles],
  );
  const maxDate = useMemo(
    () =>
      displayedCycles.length > 0
        ? displayedCycles[displayedCycles.length - 1].endDate
        : new Date(TIMELINE_END_YEAR, 11, 31),
    [displayedCycles],
  );
  const totalDays = useMemo(
    () => Math.max(1, daysBetween(minDate, maxDate) + 1),
    [minDate, maxDate],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pxPerDay, setPxPerDay] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  // Cursor-anchored zoom needs to set scrollLeft to a precise value AFTER
  // React applies the new inner width. Stash the target here; useLayoutEffect
  // applies it as soon as the new width is in the DOM.
  const pendingScrollLeftRef = useRef<number | null>(null);
  const initializedRef = useRef(false);

  // Track container width via ResizeObserver.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // First-time initialization: open at a 1-year view starting on today
  // (so the user lands somewhere relevant to right-now). If today falls
  // outside the timeline's range — past the last cycle, or before the
  // first one — fall back to the first calendar year that intersects the
  // range.
  useEffect(() => {
    if (initializedRef.current) return;
    if (containerWidth <= 0 || totalDays <= 0) return;
    const ppd = clampPxPerDay(containerWidth / 365, containerWidth, totalDays);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oneYearOut = new Date(today);
    oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
    let initStart: Date;
    if (today >= minDate && oneYearOut <= maxDate) {
      initStart = today;
    } else {
      const firstYearStart = new Date(minDate.getFullYear(), 0, 1);
      initStart = firstYearStart < minDate ? minDate : firstYearStart;
    }
    pendingScrollLeftRef.current = pixelAtDate(initStart, minDate, ppd);
    setPxPerDay(ppd);
    initializedRef.current = true;
  }, [containerWidth, totalDays, minDate, maxDate]);

  // If the viewport shrinks below the current "fit-all" minimum (e.g. user
  // shrinks the window), bump pxPerDay back up to the floor so we don't
  // leave dead space at the right.
  useEffect(() => {
    if (!initializedRef.current || pxPerDay <= 0) return;
    const clamped = clampPxPerDay(pxPerDay, containerWidth, totalDays);
    if (clamped !== pxPerDay) setPxPerDay(clamped);
  }, [containerWidth, totalDays, pxPerDay]);

  // Apply pending scrollLeft synchronously after the new inner width is
  // in the DOM, so the cursor-anchored zoom never "skips" a frame.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || pendingScrollLeftRef.current === null) return;
    const max = el.scrollWidth - el.clientWidth;
    el.scrollLeft = Math.max(0, Math.min(max, pendingScrollLeftRef.current));
    pendingScrollLeftRef.current = null;
    setScrollLeft(el.scrollLeft);
  }, [pxPerDay]);

  // Track scrollLeft so visible-window memos recompute on pan.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setScrollLeft(el.scrollLeft);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Wheel: plain wheel zooms (anchored on cursor); shift+wheel pans
  // horizontally. Attached via addEventListener so we can preventDefault —
  // React's onWheel is passive.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || pxPerDay <= 0) return;
    const handler = (e: WheelEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
        return;
      }
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorViewportX = e.clientX - rect.left;
      const cursorContentX = el.scrollLeft + cursorViewportX;
      const cursorDate = dateAtPixel(cursorContentX, minDate, pxPerDay);
      // Exponential zoom — a single wheel "notch" (deltaY = 100) gives a
      // ~1.35× zoom step.
      const factor = Math.exp(-e.deltaY * 0.003);
      const newPpd = clampPxPerDay(pxPerDay * factor, el.clientWidth, totalDays);
      if (newPpd === pxPerDay) return;
      const newCursorContentX = pixelAtDate(cursorDate, minDate, newPpd);
      pendingScrollLeftRef.current = newCursorContentX - cursorViewportX;
      setPxPerDay(newPpd);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [pxPerDay, minDate, totalDays]);

  // Pinch zoom on touch devices. Two fingers → zoom anchored on midpoint.
  // Single-finger pan is left to native horizontal scroll on the container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || pxPerDay <= 0) return;
    let pinch:
      | { d0: number; ppd0: number; midViewportX: number; midDate: Date }
      | null = null;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const midViewportX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const midContentX = el.scrollLeft + midViewportX;
        pinch = {
          d0: Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY),
          ppd0: pxPerDay,
          midViewportX,
          midDate: dateAtPixel(midContentX, minDate, pxPerDay),
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const d = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      if (d < 10 || pinch.d0 < 10) return;
      const newPpd = clampPxPerDay(
        pinch.ppd0 * (d / pinch.d0),
        el.clientWidth,
        totalDays,
      );
      if (newPpd === pxPerDay) return;
      const newMidContentX = pixelAtDate(pinch.midDate, minDate, newPpd);
      pendingScrollLeftRef.current = newMidContentX - pinch.midViewportX;
      setPxPerDay(newPpd);
    };

    const onTouchEnd = () => {
      pinch = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [pxPerDay, minDate, totalDays]);

  const fitAll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const ppd = el.clientWidth / totalDays;
    pendingScrollLeftRef.current = 0;
    setPxPerDay(ppd);
  }, [totalDays]);

  // ───── Visible window ────────────────────────────────────────────────
  // A small buffer keeps tick labels from popping in/out at the edges
  // when the user pans.
  const visibleStart = useMemo(
    () =>
      pxPerDay > 0
        ? dateAtPixel(scrollLeft - 200, minDate, pxPerDay)
        : minDate,
    [scrollLeft, pxPerDay, minDate],
  );
  const visibleEnd = useMemo(
    () =>
      pxPerDay > 0
        ? dateAtPixel(scrollLeft + containerWidth + 200, minDate, pxPerDay)
        : maxDate,
    [scrollLeft, containerWidth, pxPerDay, minDate, maxDate],
  );

  // ───── Tick computations ──────────────────────────────────────────────
  const yearTicks = useMemo(() => {
    const out: { date: Date; label: string }[] = [];
    const startYear = visibleStart.getFullYear();
    const endYear = visibleEnd.getFullYear();
    for (let y = startYear; y <= endYear + 1; y++) {
      const d = new Date(y, 0, 1);
      if (d >= addDays(minDate, -1) && d <= addDays(maxDate, 1)) {
        out.push({ date: d, label: String(y) });
      }
    }
    return out;
  }, [visibleStart, visibleEnd, minDate, maxDate]);

  const visibleCycles = useMemo(
    () =>
      displayedCycles.filter(
        c => c.endDate >= visibleStart && c.startDate <= visibleEnd,
      ),
    [displayedCycles, visibleStart, visibleEnd],
  );

  const monthTicks = useMemo(() => {
    const out: { date: Date; label: string }[] = [];
    const cursor = new Date(visibleStart.getFullYear(), visibleStart.getMonth(), 1);
    while (cursor <= visibleEnd) {
      out.push({
        date: new Date(cursor),
        label: cursor.toLocaleDateString('en-US', { month: 'short' }),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  }, [visibleStart, visibleEnd]);

  const weekTicks = useMemo(() => {
    const out: Date[] = [];
    const cursor = new Date(visibleStart);
    cursor.setHours(0, 0, 0, 0);
    cursor.setDate(cursor.getDate() - cursor.getDay()); // back to Sunday
    while (cursor <= visibleEnd) {
      out.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    return out;
  }, [visibleStart, visibleEnd]);

  const dayTicks = useMemo(() => {
    if (pxPerDay < DAY_FADE[0]) return [];
    const out: Date[] = [];
    const cursor = new Date(visibleStart);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= visibleEnd) {
      out.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [visibleStart, visibleEnd, pxPerDay]);

  // ───── Boundary shift requests (no DB write — stages a pending change) ─
  const requestShift = (cycle: ComputedCycle, days: number) => {
    const idx = displayedCycles.findIndex(c => c.id === cycle.id);
    if (idx === -1) return;
    const dCycle = displayedCycles[idx];
    const tentativeStart = addDays(dCycle.startDate, days);

    if (addDays(tentativeStart, 6) > dCycle.endDate) return;

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
      await reloadCycles();
    }
  };

  const discardPendingShifts = () => setPendingShifts({});

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

  const visibleEvents = useMemo(
    () =>
      events.filter(e => {
        const evtEnd = e.endDate ?? e.startDate;
        return evtEnd >= visibleStart && e.startDate <= visibleEnd;
      }),
    [events, visibleStart, visibleEnd],
  );

  // Pack visible events into stacked lanes. Intervals are in pixel units
  // (anchored on minDate) and we use a small pixel gap so single-day events
  // never visually fuse on the same lane.
  const sortedVisibleEvents = useMemo(() => {
    return [...visibleEvents].sort((a, b) => {
      const diff = a.startDate.getTime() - b.startDate.getTime();
      if (diff !== 0) return diff;
      const aDur = (a.endDate || a.startDate).getTime() - a.startDate.getTime();
      const bDur = (b.endDate || b.startDate).getTime() - b.startDate.getTime();
      return bDur - aDur;
    });
  }, [visibleEvents]);

  const eventLayout = useMemo(() => {
    if (pxPerDay <= 0)
      return { lanes: [] as number[], laneCount: 0 };
    const intervals = sortedVisibleEvents.map(evt => {
      const startPx = pixelAtDate(evt.startDate, minDate, pxPerDay);
      const endPx = evt.endDate
        ? pixelAtDate(evt.endDate, minDate, pxPerDay)
        : startPx;
      return { start: startPx, end: endPx };
    });
    return assignLanes(intervals, 4);
  }, [sortedVisibleEvents, minDate, pxPerDay]);

  // ───── Layer opacities (smooth fades driven by pxPerDay) ──────────────
  const cycleOpacity = fadeIn(pxPerDay, CYCLE_FADE[0], CYCLE_FADE[1]);
  const monthOpacity = fadeIn(pxPerDay, MONTH_FADE[0], MONTH_FADE[1]);
  const weekOpacity = fadeIn(pxPerDay, WEEK_FADE[0], WEEK_FADE[1]);
  const dayOpacity = fadeIn(pxPerDay, DAY_FADE[0], DAY_FADE[1]);

  const innerWidthPx = pxPerDay > 0 ? totalDays * pxPerDay : 0;
  const ready = pxPerDay > 0 && containerWidth > 0;

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
          <span className="text-gray-900 whitespace-nowrap">
            {ready
              ? `${formatMonthYear(visibleStart)} – ${formatMonthYear(visibleEnd)}`
              : 'Timeline'}
          </span>
          <button
            onClick={fitAll}
            className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Fit entire timeline"
          >
            <MaximizeIcon className="w-3 h-3" />
            Fit all
          </button>
          <span className="hidden md:inline text-xs font-normal text-gray-400 ml-2">
            Scroll to zoom · shift+scroll to pan
          </span>
        </div>
        <div className="flex items-center gap-2">
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
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-hidden relative touch-pan-x"
      >
        {ready ? (
          <div
            className="relative h-full"
            style={{ width: `${innerWidthPx}px`, minWidth: '100%' }}
          >
            {/* Center horizontal axis */}
            <div className="absolute left-0 right-0 h-0.5 bg-gray-300 top-1/2 -translate-y-1/2" />

            {displayedCycles.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 italic">
                No timeline cycles available.
              </div>
            )}

            {/* YEAR layer — always visible */}
            {yearTicks.map(({ date, label }) => {
              const x = pixelAtDate(date, minDate, pxPerDay);
              return (
                <div
                  key={`y-${label}`}
                  className="absolute top-0 bottom-0 pointer-events-none"
                  style={{ left: `${x}px` }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-px h-8 bg-gray-400" />
                  <div className="absolute top-2 -translate-x-1/2 font-bold text-gray-900 text-base whitespace-nowrap bg-white/80 px-1 rounded">
                    {label}
                  </div>
                </div>
              );
            })}

            {/* CYCLE layer */}
            {cycleOpacity > 0 &&
              visibleCycles.map(cycle => {
                const startX = pixelAtDate(cycle.startDate, minDate, pxPerDay);
                const endX = pixelAtDate(
                  addDays(cycle.endDate, 1),
                  minDate,
                  pxPerDay,
                );
                const widthPx = endX - startX;
                const pending = (pendingShifts[cycle.id] ?? 0) !== 0;
                const showEdit =
                  callerCtx?.isAdmin && widthPx >= CYCLE_EDIT_MIN_PX;
                const showLabel = widthPx >= 50;
                return (
                  <div
                    key={`c-${cycle.id}`}
                    className="absolute top-0 bottom-0"
                    style={{
                      left: `${startX}px`,
                      width: `${widthPx}px`,
                      opacity: cycleOpacity,
                    }}
                  >
                    {/* Boundary tick at the left edge */}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 left-0 w-0.5 h-6 ${
                        pending ? 'bg-amber-400' : 'bg-gray-400'
                      }`}
                    />
                    {/* Start-date chip below the boundary */}
                    <div className="absolute top-1/2 mt-3 left-0 ml-1 flex items-center gap-0.5 text-xs font-medium whitespace-nowrap">
                      <span
                        className={
                          pending
                            ? 'text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded'
                            : 'text-gray-600'
                        }
                      >
                        {formatShortDate(cycle.startDate)}
                      </span>
                    </div>
                    {showEdit && (
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
                    {showLabel && (
                      <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 bg-white px-2 text-xs font-bold text-gray-900 z-10 whitespace-nowrap">
                        {cycle.label}
                      </div>
                    )}
                  </div>
                );
              })}

            {/* MONTH layer */}
            {monthOpacity > 0 &&
              monthTicks.map(({ date, label }) => {
                const x = pixelAtDate(date, minDate, pxPerDay);
                return (
                  <div
                    key={`m-${date.toISOString()}`}
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{ left: `${x}px`, opacity: monthOpacity }}
                  >
                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-px h-4 bg-gray-300" />
                    <div className="absolute -translate-x-1/2 text-[11px] font-semibold text-gray-500 whitespace-nowrap bg-white px-1 rounded"
                         style={{ top: 'calc(50% - 28px)' }}>
                      {label}
                    </div>
                  </div>
                );
              })}

            {/* WEEK layer */}
            {weekOpacity > 0 &&
              weekTicks.map(date => {
                const x = pixelAtDate(date, minDate, pxPerDay);
                return (
                  <div
                    key={`w-${date.toISOString()}`}
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{ left: `${x}px`, opacity: weekOpacity }}
                  >
                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-px h-2 bg-gray-300" />
                  </div>
                );
              })}

            {/* DAY layer */}
            {dayOpacity > 0 &&
              dayTicks.map(date => {
                const x = pixelAtDate(date, minDate, pxPerDay);
                const isMonthStart = date.getDate() === 1;
                if (isMonthStart) return null;
                return (
                  <div
                    key={`d-${date.toISOString()}`}
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{ left: `${x}px`, opacity: dayOpacity }}
                  >
                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-px h-1.5 bg-gray-200" />
                    {pxPerDay > 25 && (
                      <div className="absolute -translate-x-1/2 text-[9px] font-medium text-gray-400 whitespace-nowrap"
                           style={{ top: 'calc(50% + 18px)' }}>
                        {date.getDate()}
                      </div>
                    )}
                  </div>
                );
              })}

            {/* EVENT layer */}
            <div
              className="absolute left-0 right-0"
              style={{
                bottom: '55%',
                height: `${eventLayout.laneCount * 14 + 4}px`,
              }}
            >
              {sortedVisibleEvents.map((e, i) => {
                const isBar = e.endDate && e.endDate.getTime() > e.startDate.getTime();
                const leftPx = pixelAtDate(e.startDate, minDate, pxPerDay);
                const rightPx = isBar
                  ? pixelAtDate(e.endDate!, minDate, pxPerDay)
                  : leftPx;
                const row = eventLayout.lanes[i] ?? 0;
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
                const onClick = canManageEvents
                  ? () => openEditEvent(e)
                  : undefined;
                const interactionClass = onClick ? 'cursor-pointer' : 'cursor-help';
                if (isBar) {
                  return (
                    <div
                      key={e.id}
                      className={`absolute ${interactionClass}`}
                      style={{
                        left: `${leftPx}px`,
                        width: `${Math.max(rightPx - leftPx, 4)}px`,
                        bottom: `${bottomOffset}px`,
                        height: '10px',
                      }}
                      onMouseEnter={onMouseEnter}
                      onMouseLeave={onMouseLeave}
                      onClick={onClick}
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
                      left: `${leftPx}px`,
                      bottom: `${bottomOffset}px`,
                      transform: 'translateX(-50%)',
                    }}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    onClick={onClick}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 italic">
            Loading timeline…
          </div>
        )}
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
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateInput(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
