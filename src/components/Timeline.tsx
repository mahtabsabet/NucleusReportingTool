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
import { TimelineCycle, TimelineEvent, TimelineItemType } from '../types';
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
  canManageNucleusTimelineEvents,
} from '../lib/permissions';

type TimelineCycleOverride = TimelineCycle;
type Orientation = 'horizontal' | 'vertical';

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
  // When set, the Timeline scopes its event reads/writes to this
  // nucleus instead of the cluster. The cycle ladder still comes
  // from the parent cluster's overrides (cycles are administrative
  // and apply at the cluster level), but cycle boundary editing is
  // suppressed in nucleus mode so two nucleus coordinators can't
  // accidentally fork the same cluster's calendar.
  nucleusId?: string | null;
  // 'horizontal' (default): time runs left→right, panel sits at the
  // bottom of the screen with a resize handle. 'vertical': time runs
  // top→bottom, panel fills its parent's height — used by the mobile
  // page so the timeline can use the full screen height.
  orientation?: Orientation;
  // 'panel' (default, legacy): horizontal mode renders with a fixed
  // pixel height + a resize handle at the top, suited to a bottom
  // banner. 'fill': horizontal mode stretches to fill its parent
  // (used by the full-page TimelineWorkspace).
  mode?: 'panel' | 'fill';
  // When set, clicking an item invokes this callback instead of
  // opening the inline edit modal. Used by the workspace to drive a
  // bottom detail drawer that survives panning/zooming.
  onItemClick?: (item: TimelineEvent) => void;
  // ID of the currently-selected item (highlighted on the strip).
  // Independent of the click handler — callers may show selection
  // without a handler, e.g. when restoring a deep-linked selection.
  selectedItemId?: string | null;
  // External trigger: when this changes (new `nonce`), the Timeline
  // opens its inline edit modal for the given item id. Used by the
  // workspace to wire the detail drawer's "Edit" button through to
  // the Timeline's existing modal without duplicating that form.
  openEditForItemId?: { id: string; nonce: number } | null;
  // Read-only synthesized items the caller wants rendered alongside
  // the fetched events. Used by the nucleus timeline to fan out
  // recurring activities into one marker per occurrence without
  // persisting hundreds of rows. They're treated as immutable: no
  // edit modal, no delete, but they DO participate in click handling
  // (so a click can navigate to the source activity).
  extraItems?: TimelineEvent[];
  // Activity IDs whose persisted timeline_events rows should be
  // suppressed — e.g. when the caller is supplying synthesized
  // recurring occurrences for an activity whose stale single-row
  // entry from a previous version still lives in the database.
  // Keeps the strip clean without forcing a DB cleanup pass.
  hiddenActivityIds?: ReadonlySet<string>;
}

type EventModalState =
  | { mode: 'add'; itemType: TimelineItemType }
  | { mode: 'edit'; event: TimelineEvent };

export function Timeline({
  clusterId,
  nucleusId = null,
  orientation = 'horizontal',
  mode = 'panel',
  onItemClick,
  selectedItemId = null,
  openEditForItemId = null,
  extraItems,
  hiddenActivityIds,
}: TimelineProps) {
  const isVertical = orientation === 'vertical';
  const fillMode = mode === 'fill';
  const isNucleusScope = !!nucleusId;
  // Memoize so identity changes only when contents change. The visible-
  // events memo below depends on these, and we'd otherwise rebuild it
  // on every parent render.
  const stableExtraItems = useMemo(() => extraItems ?? [], [extraItems]);
  const stableHiddenActivityIds = useMemo(
    () => hiddenActivityIds ?? new Set<string>(),
    [hiddenActivityIds],
  );

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
  const [formItemType, setFormItemType] = useState<TimelineItemType>('event');
  const [formName, setFormName] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formMeetingType, setFormMeetingType] = useState('');
  const [formAttendees, setFormAttendees] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canManageEvents = useMemo(
    () => {
      if (!callerCtx) return false;
      return isNucleusScope
        ? canManageNucleusTimelineEvents(callerCtx, { clusterId, nucleusId })
        : canManageClusterTimelineEvents(callerCtx, clusterId);
    },
    [callerCtx, clusterId, nucleusId, isNucleusScope],
  );

  // ───── Data loading ───────────────────────────────────────────────────
  const reloadCycles = () =>
    fetchTimelineCycles({ clusterId: clusterId ?? undefined })
      .then(setOverrides)
      .catch(() => setOverrides([]));

  const reloadEvents = () =>
    fetchTimelineEvents(
      isNucleusScope
        ? { nucleusId: nucleusId ?? undefined }
        : { clusterId: clusterId ?? undefined },
    )
      .then(setEvents)
      .catch(() => {});

  useEffect(() => {
    reloadCycles();
    reloadEvents();
    setPendingShifts({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId, nucleusId]);

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
  // The timeline lives on a single axis (horizontal or vertical). The inner
  // div's "main" dimension is `totalDays * pxPerDay`; positions along the
  // axis are computed by `pixelAtDate`. Panning is the browser's scroll
  // offset on the outer container; zooming changes pxPerDay and adjusts
  // the scroll offset to keep the cursor / pinch midpoint anchored on the
  // same date.
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

  // Per-orientation accessors for "main axis" (= time axis) pixel ops on
  // the scrollable container. Defined in a ref so the touch/wheel
  // listeners read live values without re-binding.
  const getMainScroll = useCallback(
    (el: HTMLElement) => (isVertical ? el.scrollTop : el.scrollLeft),
    [isVertical],
  );
  const setMainScroll = useCallback(
    (el: HTMLElement, v: number) => {
      if (isVertical) el.scrollTop = v;
      else el.scrollLeft = v;
    },
    [isVertical],
  );
  const getMainLength = useCallback(
    (el: HTMLElement) => (isVertical ? el.clientHeight : el.clientWidth),
    [isVertical],
  );
  const getMainScrollSize = useCallback(
    (el: HTMLElement) => (isVertical ? el.scrollHeight : el.scrollWidth),
    [isVertical],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerLength, setContainerLength] = useState(0);
  const [pxPerDay, setPxPerDay] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  // Cursor-anchored zoom needs to set scroll offset to a precise value AFTER
  // React applies the new inner width/height. Stash the target here;
  // useLayoutEffect applies it as soon as the new size is in the DOM.
  const pendingScrollRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  // Wheel and touch handlers read the live pxPerDay through this ref so we
  // don't have to re-attach the listeners on every zoom step. Re-attaching
  // mid-pinch would reset the closure-captured `pinch` state and freeze
  // the gesture after the first frame.
  const pxPerDayRef = useRef(pxPerDay);
  useEffect(() => {
    pxPerDayRef.current = pxPerDay;
  }, [pxPerDay]);

  // Track container's main-axis length via ResizeObserver.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerLength(getMainLength(el));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [getMainLength]);

  // Reset the "have we picked an initial zoom" flag if orientation flips,
  // so the new layout opens at its own 1-year default rather than reusing
  // a scroll/zoom tuned for the other axis length.
  useEffect(() => {
    initializedRef.current = false;
  }, [isVertical]);

  // First-time initialization: open at a 1-year view starting on today
  // (so the user lands somewhere relevant to right-now). If today falls
  // outside the timeline's range — past the last cycle, or before the
  // first one — fall back to the first calendar year that intersects the
  // range.
  useEffect(() => {
    if (initializedRef.current) return;
    if (containerLength <= 0 || totalDays <= 0) return;
    const ppd = clampPxPerDay(containerLength / 365, containerLength, totalDays);
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
    pendingScrollRef.current = pixelAtDate(initStart, minDate, ppd);
    setPxPerDay(ppd);
    initializedRef.current = true;
  }, [containerLength, totalDays, minDate, maxDate]);

  // If the viewport shrinks below the current "fit-all" minimum (e.g. user
  // shrinks the window), bump pxPerDay back up to the floor so we don't
  // leave dead space at the end.
  useEffect(() => {
    if (!initializedRef.current || pxPerDay <= 0) return;
    const clamped = clampPxPerDay(pxPerDay, containerLength, totalDays);
    if (clamped !== pxPerDay) setPxPerDay(clamped);
  }, [containerLength, totalDays, pxPerDay]);

  // Apply pending scroll offset synchronously after the new inner size is
  // in the DOM, so the cursor-anchored zoom never "skips" a frame.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || pendingScrollRef.current === null) return;
    const max = getMainScrollSize(el) - getMainLength(el);
    setMainScroll(el, Math.max(0, Math.min(max, pendingScrollRef.current)));
    pendingScrollRef.current = null;
    setScrollOffset(getMainScroll(el));
  }, [pxPerDay, getMainScroll, setMainScroll, getMainLength, getMainScrollSize]);

  // Track scroll offset so visible-window memos recompute on pan.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setScrollOffset(getMainScroll(el));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [getMainScroll]);

  // Wheel: plain wheel zooms (anchored on cursor); shift+wheel pans
  // along the main axis. Attached via addEventListener so we can
  // preventDefault — React's onWheel is passive. Reads the live pxPerDay
  // through a ref to avoid re-binding on every zoom step.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        setMainScroll(el, getMainScroll(el) + e.deltaY);
        return;
      }
      e.preventDefault();
      const ppd = pxPerDayRef.current;
      if (ppd <= 0) return;
      const rect = el.getBoundingClientRect();
      const cursorViewportMain = isVertical
        ? e.clientY - rect.top
        : e.clientX - rect.left;
      const cursorContentMain = getMainScroll(el) + cursorViewportMain;
      const cursorDate = dateAtPixel(cursorContentMain, minDate, ppd);
      // Exponential zoom — a single wheel "notch" (deltaY = 100) gives a
      // ~1.35× zoom step.
      const factor = Math.exp(-e.deltaY * 0.003);
      const newPpd = clampPxPerDay(ppd * factor, getMainLength(el), totalDays);
      if (newPpd === ppd) return;
      const newCursorContentMain = pixelAtDate(cursorDate, minDate, newPpd);
      pendingScrollRef.current = newCursorContentMain - cursorViewportMain;
      setPxPerDay(newPpd);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [minDate, totalDays, isVertical, getMainScroll, setMainScroll, getMainLength]);

  // Touch handling: 1 finger pans, 2 fingers pinch-zoom anchored on the
  // midpoint. The container has `touch-action: none` so the browser
  // doesn't claim gestures for native scroll/zoom — we drive both here.
  //
  // Critical: this effect must NOT depend on `pxPerDay`. setPxPerDay during
  // a pinch would otherwise re-run the effect, tear down the listeners,
  // and reset the closure-captured `pinch` state — freezing the gesture
  // after the first frame. We read the live pxPerDay through a ref instead.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let pan: { startMain: number; startScroll: number } | null = null;
    let pinch:
      | { d0: number; ppd0: number; midViewportMain: number; midDate: Date }
      | null = null;

    const mainOf = (t: { clientX: number; clientY: number }) =>
      isVertical ? t.clientY : t.clientX;

    const startPan = (t: Touch) => {
      pan = { startMain: mainOf(t), startScroll: getMainScroll(el) };
      pinch = null;
    };

    const startPinch = (t1: Touch, t2: Touch) => {
      pan = null;
      const ppd = pxPerDayRef.current;
      if (ppd <= 0) return;
      const rect = el.getBoundingClientRect();
      const rectStart = isVertical ? rect.top : rect.left;
      const midViewportMain = (mainOf(t1) + mainOf(t2)) / 2 - rectStart;
      const midContentMain = getMainScroll(el) + midViewportMain;
      pinch = {
        d0: Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY),
        ppd0: ppd,
        midViewportMain,
        midDate: dateAtPixel(midContentMain, minDate, ppd),
      };
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        startPan(e.touches[0]);
      } else if (e.touches.length === 2) {
        e.preventDefault();
        startPinch(e.touches[0], e.touches[1]);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && pan) {
        e.preventDefault();
        setMainScroll(el, pan.startScroll - (mainOf(e.touches[0]) - pan.startMain));
      } else if (e.touches.length === 2 && pinch) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const d = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (d < 10 || pinch.d0 < 10) return;
        const newPpd = clampPxPerDay(
          pinch.ppd0 * (d / pinch.d0),
          getMainLength(el),
          totalDays,
        );
        if (newPpd === pxPerDayRef.current) return;
        const newMidContentMain = pixelAtDate(pinch.midDate, minDate, newPpd);
        pendingScrollRef.current = newMidContentMain - pinch.midViewportMain;
        setPxPerDay(newPpd);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        pan = null;
        pinch = null;
      } else if (e.touches.length === 1) {
        // Lifting one finger off a pinch — re-anchor pan on the
        // remaining finger so it doesn't jump.
        pinch = null;
        startPan(e.touches[0]);
      }
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
  }, [minDate, totalDays, isVertical, getMainScroll, setMainScroll, getMainLength]);

  const fitAll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const ppd = getMainLength(el) / totalDays;
    pendingScrollRef.current = 0;
    setPxPerDay(ppd);
  }, [totalDays, getMainLength]);

  // ───── Visible window ────────────────────────────────────────────────
  // A small buffer keeps tick labels from popping in/out at the edges
  // when the user pans.
  const visibleStart = useMemo(
    () =>
      pxPerDay > 0
        ? dateAtPixel(scrollOffset - 200, minDate, pxPerDay)
        : minDate,
    [scrollOffset, pxPerDay, minDate],
  );
  const visibleEnd = useMemo(
    () =>
      pxPerDay > 0
        ? dateAtPixel(scrollOffset + containerLength + 200, minDate, pxPerDay)
        : maxDate,
    [scrollOffset, containerLength, pxPerDay, minDate, maxDate],
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
  const resetForm = () => {
    setFormName('');
    setFormStart('');
    setFormStartTime('');
    setFormEnd('');
    setFormLocation('');
    setFormMeetingType('');
    setFormAttendees('');
    setFormError(null);
    setSaving(false);
  };

  const openAddEvent = (itemType: TimelineItemType = 'event', defaultStart?: Date) => {
    if (!canManageEvents) return;
    resetForm();
    setFormItemType(itemType);
    setFormStart(defaultStart ? toDateInputValue(defaultStart) : '');
    setEventModal({ mode: 'add', itemType });
  };

  const openEditEvent = (event: TimelineEvent) => {
    if (!canManageEvents) return;
    setFormItemType(event.itemType);
    setFormName(event.name);
    setFormStart(toDateInputValue(event.startDate));
    setFormStartTime(event.startTime ?? '');
    setFormEnd(event.endDate ? toDateInputValue(event.endDate) : '');
    setFormLocation(event.location ?? '');
    setFormMeetingType(event.meetingType ?? '');
    setFormAttendees((event.attendees ?? []).join(', '));
    setEventModal({ mode: 'edit', event });
  };

  const closeEventModal = () => setEventModal(null);

  // External "open edit modal" trigger from the workspace. We track
  // the last-processed nonce so a stale prop value can't re-open the
  // modal after the user has closed it.
  const lastEditNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!openEditForItemId) return;
    if (lastEditNonceRef.current === openEditForItemId.nonce) return;
    const target = events.find(e => e.id === openEditForItemId.id);
    if (!target) return;
    lastEditNonceRef.current = openEditForItemId.nonce;
    openEditEvent(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openEditForItemId, events]);

  const saveEvent = async () => {
    if (!eventModal) return;
    setFormError(null);
    if (!formName.trim()) {
      setFormError(
        formItemType === 'meeting'
          ? 'Meeting title is required.'
          : 'Event name is required.',
      );
      return;
    }
    if (!formStart) {
      setFormError('A date is required.');
      return;
    }
    const startDate = parseDateInput(formStart);
    const endDate = formEnd ? parseDateInput(formEnd) : null;
    if (endDate && endDate < startDate) {
      setFormError('End date can’t be before the start date.');
      return;
    }
    const location = formLocation.trim() || null;
    const startTime = formStartTime.trim() || null;
    const meetingType =
      formItemType === 'meeting' ? formMeetingType.trim() || null : null;
    // Attendees are accepted as a comma-separated list in Phase 1; we
    // store the trimmed names as-is in the `attendees` text[] column.
    // Resolving these to person records is a Phase 2 concern.
    const attendees =
      formItemType === 'meeting'
        ? formAttendees
            .split(',')
            .map(a => a.trim())
            .filter(Boolean)
        : [];
    setSaving(true);
    try {
      if (eventModal.mode === 'add') {
        const newEvent = await addTimelineEvent({
          itemType: formItemType,
          name: formName.trim(),
          startDate,
          endDate: endDate ?? undefined,
          startTime: startTime ?? undefined,
          clusterId: clusterId ?? undefined,
          nucleusId: nucleusId ?? undefined,
          location: location ?? undefined,
          meetingType: meetingType ?? undefined,
          attendees,
        });
        setEvents(prev => [...prev, newEvent]);
      } else {
        const updated = await updateTimelineEvent(eventModal.event.id, {
          itemType: formItemType,
          name: formName.trim(),
          startDate,
          endDate,
          startTime,
          location,
          meetingType,
          attendees,
        });
        setEvents(prev => prev.map(e => (e.id === updated.id ? updated : e)));
      }
      closeEventModal();
    } catch (err: any) {
      // Surface the error inline so the user isn't left with a button
      // that "doesn't do anything". The most common cause in a fresh
      // environment is the Phase 1 migration not yet being applied —
      // the message from PostgREST ("column ... does not exist") makes
      // that obvious without us having to special-case it here.
      console.error('Failed to save event:', err);
      setFormError(err?.message ?? 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
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
    () => {
      // Merge fetched + synthesized streams, hiding any fetched row
      // whose source activity is now being rendered via synthesized
      // occurrences (so the strip doesn't show both a lone start-
      // date marker and the new fan-out for the same activity).
      const merged: TimelineEvent[] = [];
      for (const e of events) {
        if (e.activityId && stableHiddenActivityIds.has(e.activityId)) continue;
        merged.push(e);
      }
      for (const e of stableExtraItems) merged.push(e);
      return merged.filter(e => {
        const evtEnd = e.endDate ?? e.startDate;
        return evtEnd >= visibleStart && e.startDate <= visibleEnd;
      });
    },
    [events, stableExtraItems, stableHiddenActivityIds, visibleStart, visibleEnd],
  );

  // Pack visible items into stacked lanes. Intervals are in pixel units
  // (anchored on minDate) and we use a small pixel gap so single-day items
  // never visually fuse on the same lane. We stack events above the
  // center axis and meetings below it — this keeps the two item types
  // visually distinct AND lets each side pack its own lanes without
  // either type pushing the other around.
  const sortByStart = (a: TimelineEvent, b: TimelineEvent) => {
    const diff = a.startDate.getTime() - b.startDate.getTime();
    if (diff !== 0) return diff;
    const aDur = (a.endDate || a.startDate).getTime() - a.startDate.getTime();
    const bDur = (b.endDate || b.startDate).getTime() - b.startDate.getTime();
    return bDur - aDur;
  };

  const sortedVisibleEvents = useMemo(
    () => visibleEvents.filter(e => e.itemType === 'event').sort(sortByStart),
    [visibleEvents],
  );

  const sortedVisibleMeetings = useMemo(
    () => visibleEvents.filter(e => e.itemType === 'meeting').sort(sortByStart),
    [visibleEvents],
  );

  const computeLayout = (items: TimelineEvent[]) => {
    if (pxPerDay <= 0) return { lanes: [] as number[], laneCount: 0 };
    const intervals = items.map(evt => {
      const startPx = pixelAtDate(evt.startDate, minDate, pxPerDay);
      const endPx = evt.endDate
        ? pixelAtDate(evt.endDate, minDate, pxPerDay)
        : startPx;
      return { start: startPx, end: endPx };
    });
    return assignLanes(intervals, 4);
  };

  const eventLayout = useMemo(
    () => computeLayout(sortedVisibleEvents),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sortedVisibleEvents, minDate, pxPerDay],
  );
  const meetingLayout = useMemo(
    () => computeLayout(sortedVisibleMeetings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sortedVisibleMeetings, minDate, pxPerDay],
  );

  // ───── Layer opacities (smooth fades driven by pxPerDay) ──────────────
  const cycleOpacity = fadeIn(pxPerDay, CYCLE_FADE[0], CYCLE_FADE[1]);
  const monthOpacity = fadeIn(pxPerDay, MONTH_FADE[0], MONTH_FADE[1]);
  const weekOpacity = fadeIn(pxPerDay, WEEK_FADE[0], WEEK_FADE[1]);
  const dayOpacity = fadeIn(pxPerDay, DAY_FADE[0], DAY_FADE[1]);

  const innerMainPx = pxPerDay > 0 ? totalDays * pxPerDay : 0;
  const ready = pxPerDay > 0 && containerLength > 0;

  // ───── Axis-aware style helpers ───────────────────────────────────────
  // Position something at `offset` along the time axis (and optionally
  // size it along the same axis). Translates to {left,width} for
  // horizontal, {top,height} for vertical.
  const mainPos = (offset: number, length?: number): React.CSSProperties => {
    if (isVertical) {
      return length !== undefined
        ? { top: `${offset}px`, height: `${length}px` }
        : { top: `${offset}px` };
    }
    return length !== undefined
      ? { left: `${offset}px`, width: `${length}px` }
      : { left: `${offset}px` };
  };
  // CSS class that makes a positioned child span the full extent of its
  // parent on the cross axis (so a year-tick wrapper, e.g., reaches from
  // top to bottom in horizontal mode, or left to right in vertical).
  const crossSpanClass = isVertical ? 'left-0 right-0' : 'top-0 bottom-0';
  const centerLineClass = isVertical
    ? 'absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-gray-300'
    : 'absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-gray-300';
  const innerWrapperStyle: React.CSSProperties = isVertical
    ? { height: `${innerMainPx}px`, minHeight: '100%' }
    : { width: `${innerMainPx}px`, minWidth: '100%' };
  const innerWrapperSizeClass = isVertical ? 'w-full' : 'h-full';
  const containerScrollClass = isVertical
    ? 'overflow-y-auto overflow-x-hidden'
    : 'overflow-x-auto overflow-y-hidden';

  // Render a tick marker (small line on the center axis). `length` is the
  // tick's extent along the cross axis (perpendicular to the time axis);
  // `thickness` is the line's stroke width (always 1px in practice).
  // Inline styles avoid Tailwind JIT issues — the swapped horizontal /
  // vertical class names wouldn't appear literally in source so they
  // wouldn't be generated.
  const tickMarker = (length: number, colorClass: string) => {
    const style: React.CSSProperties = isVertical
      ? { width: `${length}px`, height: '1px' }
      : { width: '1px', height: `${length}px` };
    return (
      <div
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${colorClass}`}
        style={style}
      />
    );
  };

  // Position a label relative to the center axis, at a given cross-axis
  // offset (px). `centerSide` is 'before' (above-or-left of center) or
  // 'after' (below-or-right of center) — used for horizontal layouts that
  // historically positioned labels with `top: calc(50% - X)` etc.
  const labelOnCross = (
    crossPx: number,
    side: 'before' | 'after',
  ): React.CSSProperties => {
    if (isVertical) {
      // Cross axis = X. "Before" = left, "After" = right. Center on Y
      // (the time axis position) via parent's mainPos already; here we
      // only set the cross offset and a translate so the label is
      // vertically centered on the tick.
      const css: React.CSSProperties = { transform: 'translateY(-50%)' };
      if (side === 'before') {
        css.right = `calc(50% + ${crossPx}px)`;
      } else {
        css.left = `calc(50% + ${crossPx}px)`;
      }
      return css;
    }
    // Horizontal: cross = Y. "Before" = above center, "After" = below.
    const css: React.CSSProperties = { transform: 'translateX(-50%)' };
    if (side === 'before') {
      css.bottom = `calc(50% + ${crossPx}px)`;
    } else {
      css.top = `calc(50% + ${crossPx}px)`;
    }
    return css;
  };

  // Item lane containers. Events sit on the "before" side of the center
  // axis (above in horizontal, left in vertical); meetings sit on the
  // "after" side (below in horizontal, right in vertical). Each side
  // stacks outward from the center, so neither type displaces the
  // other when they overlap in time.
  const eventLanesContainerStyle: React.CSSProperties = isVertical
    ? { right: '55%', width: `${eventLayout.laneCount * 14 + 4}px` }
    : { bottom: '55%', height: `${eventLayout.laneCount * 14 + 4}px` };
  const meetingLanesContainerStyle: React.CSSProperties = isVertical
    ? { left: '55%', width: `${meetingLayout.laneCount * 16 + 8}px` }
    : { top: '55%', height: `${meetingLayout.laneCount * 16 + 8}px` };
  const eventLanesContainerSpanClass = isVertical
    ? 'absolute top-0 bottom-0'
    : 'absolute left-0 right-0';
  const meetingLanesContainerSpanClass = eventLanesContainerSpanClass;

  // Position an event bar/dot on the timeline (on the "before" side).
  const eventBarStyle = (
    offsetMain: number,
    lengthMain: number,
    laneOffsetCross: number,
  ): React.CSSProperties => {
    if (isVertical) {
      return {
        top: `${offsetMain}px`,
        height: `${Math.max(lengthMain, 4)}px`,
        right: `${laneOffsetCross}px`,
        width: '10px',
      };
    }
    return {
      left: `${offsetMain}px`,
      width: `${Math.max(lengthMain, 4)}px`,
      bottom: `${laneOffsetCross}px`,
      height: '10px',
    };
  };
  const eventDotStyle = (
    offsetMain: number,
    laneOffsetCross: number,
  ): React.CSSProperties => {
    if (isVertical) {
      return {
        top: `${offsetMain}px`,
        right: `${laneOffsetCross}px`,
        transform: 'translateY(-50%)',
      };
    }
    return {
      left: `${offsetMain}px`,
      bottom: `${laneOffsetCross}px`,
      transform: 'translateX(-50%)',
    };
  };

  // Meeting markers live on the "after" side. We render them as
  // diamonds (rotated squares) so they read visually distinct from
  // event bars at any zoom — at fit-all the rotation is the only
  // affordance separating them from event dots.
  const meetingMarkerStyle = (
    offsetMain: number,
    lengthMain: number,
    laneOffsetCross: number,
  ): React.CSSProperties => {
    const size = 12;
    if (isVertical) {
      return {
        top: `${offsetMain}px`,
        height: `${Math.max(lengthMain, size)}px`,
        left: `${laneOffsetCross}px`,
        width: `${size}px`,
      };
    }
    return {
      left: `${offsetMain}px`,
      width: `${Math.max(lengthMain, size)}px`,
      top: `${laneOffsetCross}px`,
      height: `${size}px`,
    };
  };

  // ───── Render ────────────────────────────────────────────────────────
  // Root container chrome varies by orientation + mode:
  //   • vertical mode:  fills parent height (mobile full-screen page).
  //   • horizontal + 'fill': fills parent height (workspace).
  //   • horizontal + 'panel' (default): sits as a bottom-of-screen
  //     banner with a fixed pixel height and a top resize handle.
  const fillsParentHeight = isVertical || fillMode;
  const rootStyle: React.CSSProperties = fillsParentHeight
    ? { height: '100%' }
    : { height: `${panelHeight}px` };
  const rootClass = fillsParentHeight
    ? 'bg-white flex flex-col font-sans relative z-40 h-full'
    : 'bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] flex flex-col font-sans relative z-40';

  return (
    <div className={rootClass} style={rootStyle}>
      {/* Resize handle — bottom-banner mode only. The workspace and the
          mobile page hand height responsibility to their parent layout. */}
      {!isVertical && !fillMode && (
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
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-2 border-b border-gray-100 bg-gray-50/50 gap-3 flex-shrink-0">
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
          {!isVertical && (
            <span className="hidden md:inline text-xs font-normal text-gray-400 ml-2">
              Scroll to zoom · shift+scroll to pan
            </span>
          )}
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
            <>
              <button
                onClick={() => openAddEvent('event')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                Add Event
              </button>
              <button
                onClick={() => openAddEvent('meeting')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-800 text-xs font-bold rounded-lg hover:bg-amber-100 transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                Add Meeting
              </button>
            </>
          )}
        </div>
      </div>

      {/* When no specific cluster is selected, the cycle ladder shown is the
          standard Bahá'í-year default — individual clusters may have shifted
          their boundaries. Surface this so the timeline isn't mistaken for
          any one cluster's actual calendar. */}
      {!clusterId && !isNucleusScope && (
        <div className="px-4 md:px-6 py-1.5 border-b border-gray-200 bg-gray-50 text-sm italic text-gray-700 flex-shrink-0">
          Default cycle dates shown — actual cycles may vary by cluster
        </div>
      )}

      {/* Timeline Content */}
      <div
        ref={containerRef}
        className={`flex-1 ${containerScrollClass} relative touch-none`}
      >
        {ready ? (
          <div
            className={`relative ${innerWrapperSizeClass}`}
            style={innerWrapperStyle}
          >
            {/* Center axis line (horizontal in horizontal mode, vertical in vertical mode) */}
            <div className={centerLineClass} />

            {displayedCycles.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 italic">
                No timeline cycles available.
              </div>
            )}

            {/* YEAR layer — always visible */}
            {yearTicks.map(({ date, label }) => {
              const offset = pixelAtDate(date, minDate, pxPerDay);
              return (
                <div
                  key={`y-${label}`}
                  className={`absolute ${crossSpanClass} pointer-events-none`}
                  style={mainPos(offset)}
                >
                  {tickMarker(32, 'bg-gray-400')}
                  <div
                    className="absolute font-bold text-gray-900 text-base whitespace-nowrap bg-white/80 px-1 rounded"
                    style={
                      isVertical
                        ? { left: '8px', transform: 'translateY(-50%)' }
                        : { top: '8px', transform: 'translateX(-50%)' }
                    }
                  >
                    {label}
                  </div>
                </div>
              );
            })}

            {/* CYCLE layer */}
            {cycleOpacity > 0 &&
              visibleCycles.map(cycle => {
                const startMain = pixelAtDate(cycle.startDate, minDate, pxPerDay);
                const endMain = pixelAtDate(
                  addDays(cycle.endDate, 1),
                  minDate,
                  pxPerDay,
                );
                const lengthPx = endMain - startMain;
                const pending = (pendingShifts[cycle.id] ?? 0) !== 0;
                // Cycle ladder is administrative; admins and the cluster's
                // coordinators can shift its boundaries, and only when a
                // specific cluster is selected. The "all clusters" overview
                // and nucleus timelines show the same ladder for calendar
                // context but never expose the +/- editor (editing the
                // former would shift the global default for every cluster
                // that hasn't overridden; the latter would fork the cluster's
                // calendar from a nucleus).
                const showEdit =
                  !!callerCtx
                  && !!clusterId
                  && canManageClusterTimelineEvents(callerCtx, clusterId)
                  && lengthPx >= CYCLE_EDIT_MIN_PX
                  && !isNucleusScope;
                const showLabel = lengthPx >= 50;
                // Boundary tick: a short stripe across the center axis,
                // on the start (leading) edge of the cycle.
                const boundaryTickStyle: React.CSSProperties = isVertical
                  ? {
                      left: '50%',
                      top: 0,
                      transform: 'translateX(-50%)',
                      width: '24px',
                      height: '2px',
                    }
                  : {
                      top: '50%',
                      left: 0,
                      transform: 'translateY(-50%)',
                      width: '2px',
                      height: '24px',
                    };
                // Date chip sits just past the boundary tick, on the
                // "after" side of the center axis (below in horizontal,
                // right of center in vertical).
                const dateChipStyle: React.CSSProperties = isVertical
                  ? { left: 'calc(50% + 14px)', top: '4px' }
                  : { top: 'calc(50% + 12px)', left: '4px' };
                const editButtonsStyle: React.CSSProperties = isVertical
                  ? { left: 'calc(50% + 14px)', top: '24px' }
                  : { top: 'calc(50% + 36px)', left: '4px' };
                const cycleLabelStyle: React.CSSProperties = isVertical
                  ? {
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                    }
                  : {
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                    };
                return (
                  <div
                    key={`c-${cycle.id}`}
                    className={`absolute ${crossSpanClass}`}
                    style={{ ...mainPos(startMain, lengthPx), opacity: cycleOpacity }}
                  >
                    <div
                      className={`absolute ${
                        pending ? 'bg-amber-400' : 'bg-gray-400'
                      }`}
                      style={boundaryTickStyle}
                    />
                    <div
                      className="absolute flex items-center gap-0.5 text-xs font-medium whitespace-nowrap"
                      style={dateChipStyle}
                    >
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
                      <div
                        className="absolute flex items-center gap-0.5 z-20"
                        style={editButtonsStyle}
                      >
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
                      <div
                        className="absolute bg-white px-2 text-xs font-bold text-gray-900 z-10 whitespace-nowrap"
                        style={cycleLabelStyle}
                      >
                        {cycle.label}
                      </div>
                    )}
                  </div>
                );
              })}

            {/* MONTH layer */}
            {monthOpacity > 0 &&
              monthTicks.map(({ date, label }) => {
                const offset = pixelAtDate(date, minDate, pxPerDay);
                return (
                  <div
                    key={`m-${date.toISOString()}`}
                    className={`absolute ${crossSpanClass} pointer-events-none`}
                    style={{ ...mainPos(offset), opacity: monthOpacity }}
                  >
                    {tickMarker(16, 'bg-gray-300')}
                    <div
                      className="absolute text-[11px] font-semibold text-gray-500 whitespace-nowrap bg-white px-1 rounded"
                      style={labelOnCross(28, 'before')}
                    >
                      {label}
                    </div>
                  </div>
                );
              })}

            {/* WEEK layer */}
            {weekOpacity > 0 &&
              weekTicks.map(date => {
                const offset = pixelAtDate(date, minDate, pxPerDay);
                return (
                  <div
                    key={`w-${date.toISOString()}`}
                    className={`absolute ${crossSpanClass} pointer-events-none`}
                    style={{ ...mainPos(offset), opacity: weekOpacity }}
                  >
                    {tickMarker(8, 'bg-gray-300')}
                  </div>
                );
              })}

            {/* DAY layer */}
            {dayOpacity > 0 &&
              dayTicks.map(date => {
                const offset = pixelAtDate(date, minDate, pxPerDay);
                const isMonthStart = date.getDate() === 1;
                if (isMonthStart) return null;
                return (
                  <div
                    key={`d-${date.toISOString()}`}
                    className={`absolute ${crossSpanClass} pointer-events-none`}
                    style={{ ...mainPos(offset), opacity: dayOpacity }}
                  >
                    {tickMarker(6, 'bg-gray-200')}
                    {pxPerDay > 25 && (
                      <div
                        className="absolute text-[9px] font-medium text-gray-400 whitespace-nowrap"
                        style={labelOnCross(18, 'after')}
                      >
                        {date.getDate()}
                      </div>
                    )}
                  </div>
                );
              })}

            {/* EVENT layer (above center axis) */}
            <div className={eventLanesContainerSpanClass} style={eventLanesContainerStyle}>
              {sortedVisibleEvents.map((e, i) => {
                const isBar = e.endDate && e.endDate.getTime() > e.startDate.getTime();
                const startMain = pixelAtDate(e.startDate, minDate, pxPerDay);
                const endMain = isBar
                  ? pixelAtDate(e.endDate!, minDate, pxPerDay)
                  : startMain;
                const row = eventLayout.lanes[i] ?? 0;
                const laneOffset = row * 14 + 2;
                const isSelected = selectedItemId === e.id;
                const onMouseEnter = (ev: React.MouseEvent) => {
                  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                  setHoveredEvent({
                    event: e,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                  });
                };
                const onMouseLeave = () => setHoveredEvent(null);
                // Workspace mode (onItemClick provided) opens the detail
                // drawer. Legacy mode falls through to inline edit for
                // users who can manage events — preserves existing UX.
                const onClick = onItemClick
                  ? () => onItemClick(e)
                  : canManageEvents
                  ? () => openEditEvent(e)
                  : undefined;
                const interactionClass = onClick ? 'cursor-pointer' : 'cursor-help';
                if (isBar) {
                  return (
                    <div
                      key={e.id}
                      className={`absolute ${interactionClass}`}
                      style={eventBarStyle(startMain, endMain - startMain, laneOffset)}
                      onMouseEnter={onMouseEnter}
                      onMouseLeave={onMouseLeave}
                      onClick={onClick}
                    >
                      <div
                        className={`w-full h-full rounded-sm transition-colors ${
                          isSelected
                            ? 'bg-blue-600 border-2 border-blue-800 ring-2 ring-blue-300'
                            : 'bg-blue-400/80 border border-blue-500/50 hover:bg-blue-500/90'
                        }`}
                      />
                    </div>
                  );
                }
                return (
                  <div
                    key={e.id}
                    className={`absolute w-2.5 h-2.5 rounded-full transition-colors ${interactionClass} ${
                      isSelected
                        ? 'bg-blue-700 ring-2 ring-blue-300'
                        : 'bg-blue-500 hover:bg-blue-600'
                    }`}
                    style={eventDotStyle(startMain, laneOffset)}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    onClick={onClick}
                  />
                );
              })}
            </div>

            {/* MEETING layer (below center axis) — diamond markers in
                an amber palette so they read distinct from events at
                any zoom level. */}
            <div
              className={meetingLanesContainerSpanClass}
              style={meetingLanesContainerStyle}
            >
              {sortedVisibleMeetings.map((m, i) => {
                const isBar = m.endDate && m.endDate.getTime() > m.startDate.getTime();
                const startMain = pixelAtDate(m.startDate, minDate, pxPerDay);
                const endMain = isBar
                  ? pixelAtDate(m.endDate!, minDate, pxPerDay)
                  : startMain;
                const row = meetingLayout.lanes[i] ?? 0;
                const laneOffset = row * 16 + 4;
                const isSelected = selectedItemId === m.id;
                const onMouseEnter = (ev: React.MouseEvent) => {
                  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                  setHoveredEvent({
                    event: m,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                  });
                };
                const onMouseLeave = () => setHoveredEvent(null);
                const onClick = onItemClick
                  ? () => onItemClick(m)
                  : canManageEvents
                  ? () => openEditEvent(m)
                  : undefined;
                const interactionClass = onClick ? 'cursor-pointer' : 'cursor-help';
                if (isBar) {
                  // Multi-day meetings (rare, but possible) render as a
                  // light amber band with diamond end-caps would be
                  // overkill — keep them as a striped band so they read
                  // as "meeting" even when wide.
                  return (
                    <div
                      key={m.id}
                      className={`absolute ${interactionClass}`}
                      style={meetingMarkerStyle(startMain, endMain - startMain, laneOffset)}
                      onMouseEnter={onMouseEnter}
                      onMouseLeave={onMouseLeave}
                      onClick={onClick}
                    >
                      <div
                        className={`w-full h-full rounded-sm transition-colors ${
                          isSelected
                            ? 'bg-amber-600 border-2 border-amber-800 ring-2 ring-amber-300'
                            : 'bg-amber-400/80 border border-amber-500/60 hover:bg-amber-500/90'
                        }`}
                      />
                    </div>
                  );
                }
                // Single-occurrence meeting: diamond marker.
                return (
                  <div
                    key={m.id}
                    className={`absolute w-3 h-3 rotate-45 transition-colors ${interactionClass} ${
                      isSelected
                        ? 'bg-amber-700 ring-2 ring-amber-300'
                        : 'bg-amber-500 hover:bg-amber-600'
                    }`}
                    style={meetingMarkerStyle(startMain, 0, laneOffset)}
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
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center px-6 pt-6 pb-4 flex-shrink-0">
                <h3 className="text-lg font-bold text-gray-900">
                  {eventModal.mode === 'add'
                    ? formItemType === 'meeting'
                      ? 'Add Meeting'
                      : 'Add Timeline Event'
                    : formItemType === 'meeting'
                    ? 'Edit Meeting'
                    : 'Edit Timeline Event'}
                </h3>
                <button
                  onClick={closeEventModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              {/* Scrollable form region. Save / Cancel / Delete sit
                  *outside* this region so they stay visible no matter
                  how tall the form gets. */}
              <div className="px-6 pb-2 overflow-y-auto space-y-4">
                {/* Item type toggle — lets the user reclassify on edit
                    and confirms the active type when adding. */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Item Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormItemType('event')}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                        formItemType === 'event'
                          ? 'bg-blue-50 border-blue-300 text-blue-800'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Event
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormItemType('meeting')}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                        formItemType === 'meeting'
                          ? 'bg-amber-50 border-amber-300 text-amber-800'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Meeting
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    {formItemType === 'meeting' ? 'Meeting Title' : 'Event Name'}
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder={
                      formItemType === 'meeting'
                        ? 'e.g. Reflection Meeting'
                        : 'e.g. Expansion Phase'
                    }
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      {formItemType === 'meeting' ? 'Date' : 'Start Date'}
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
                      {formItemType === 'meeting' ? 'Time' : 'End Date'}{' '}
                      <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    {formItemType === 'meeting' ? (
                      <input
                        type="time"
                        value={formStartTime}
                        onChange={e => setFormStartTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      />
                    ) : (
                      <input
                        type="date"
                        value={formEnd}
                        onChange={e => setFormEnd(e.target.value)}
                        min={formStart || undefined}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      />
                    )}
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
                {formItemType === 'meeting' && (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                        Meeting Type{' '}
                        <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={formMeetingType}
                        onChange={e => setFormMeetingType(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        placeholder="e.g. Reflection, Cluster Coordination, Accompaniment"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                        Attendees{' '}
                        <span className="text-gray-400 font-normal">
                          (optional, comma-separated)
                        </span>
                      </label>
                      <input
                        type="text"
                        value={formAttendees}
                        onChange={e => setFormAttendees(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        placeholder="e.g. Maria, Reza, Aisha"
                      />
                    </div>
                  </>
                )}
              </div>
              {/* Footer (action bar). Stays pinned to the bottom of the
                  modal — the form region above it scrolls when content
                  overflows, so Save is always reachable. */}
              <div className="px-6 pt-3 pb-6 border-t border-gray-100 flex-shrink-0">
                {formError && (
                  <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {formError}
                  </div>
                )}
                <div className="flex gap-3 items-center">
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
                  {/* Always clickable — validation runs in saveEvent so
                      the user sees *why* a click didn't take, rather
                      than being left with an inert grey button. */}
                  <button
                    onClick={saveEvent}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60"
                  >
                    {saving
                      ? 'Saving…'
                      : eventModal.mode === 'add'
                      ? formItemType === 'meeting'
                        ? 'Save Meeting'
                        : 'Save Event'
                      : 'Save Changes'}
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
