// ============================================================
// Mobile bottom sheet for the LSA household map.
//
// Three snap states — `peek`, `half`, `full` — let an LSA see the
// underlying map by default while the household list / attention
// affordances stay one tap away. Tap the drag handle to cycle to
// the next state; a vertical swipe on the handle also works (above
// a small threshold so an accidental brush doesn't move it). The
// sheet sits on top of the map (z-[1100]) but stays below the
// per-household drawer overlay (z-[1200]) so opening a household
// covers the sheet entirely.
// ============================================================

import React, { useEffect, useRef } from 'react';

export type SheetState = 'peek' | 'half' | 'full';

// Heights tuned so 'peek' shows the prominent grab area + the
// sidebar's sticky header (search + toggle row) clear of any iOS
// home-indicator / address-bar overlap; 'half' surfaces the
// attention/match-scan cards and the first few list rows; 'full'
// is the whole list scrollable. Heights use `svh` (small viewport
// height) where supported so iOS Safari's shrinking address bar
// can't crop the bottom of the sheet.
const HEIGHTS: Record<SheetState, string> = {
  peek: '200px',
  half: '50svh',
  full: '88svh',
};

// Swipe threshold in pixels — below this, treat as a tap (cycle
// states); above, snap to whichever direction the swipe went.
const SWIPE_THRESHOLD_PX = 24;

function nextState(s: SheetState): SheetState {
  return s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek';
}
function expand(s: SheetState): SheetState {
  return s === 'peek' ? 'half' : 'full';
}
function collapse(s: SheetState): SheetState {
  return s === 'full' ? 'half' : 'peek';
}

interface Props {
  state: SheetState;
  onStateChange: (next: SheetState) => void;
  children: React.ReactNode;
  // Short label shown next to the drag handle ("Households · 374").
  // Makes the grab area an obvious affordance rather than a tiny pill
  // in empty space.
  label?: string;
}

export function MobileBottomSheet({ state, onStateChange, children, label }: Props) {
  const touchStartY = useRef<number | null>(null);

  function onHandleClick() {
    onStateChange(nextState(state));
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartY.current == null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;
    if (Math.abs(dy) < SWIPE_THRESHOLD_PX) {
      // Treat as tap.
      onStateChange(nextState(state));
    } else if (dy < 0) {
      onStateChange(expand(state));
    } else {
      onStateChange(collapse(state));
    }
  }

  // Body scroll lock when the sheet is full — otherwise iOS Safari
  // will pull the page underneath while the user is scrolling the
  // list, which feels broken.
  useEffect(() => {
    if (state !== 'full') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [state]);

  const nextLabel = state === 'peek' ? 'Expand list' : state === 'half' ? 'Expand fully' : 'Collapse';

  return (
    <div
      role="dialog"
      aria-label="Household list"
      className="fixed left-0 right-0 bg-white border-t border-amber-200 rounded-t-2xl shadow-2xl z-[1100] flex flex-col"
      style={{
        // Anchor to the safe area (iOS home indicator) so the
        // content doesn't slip under the system gesture row.
        bottom: 'env(safe-area-inset-bottom, 0px)',
        height: HEIGHTS[state],
        transition: 'height 0.25s ease-out',
      }}
    >
      {/* Grab area — entire top strip (handle + label) is the tap
          target, not just the small pill. Big enough that an LSA
          fumbling on a phone can reliably hit it. */}
      <button
        type="button"
        onClick={onHandleClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-label={`Households list — ${state} — ${nextLabel}`}
        className="w-full pt-2 pb-2 flex flex-col items-center gap-1 select-none touch-none border-b border-amber-100"
      >
        <span className="block w-12 h-1.5 bg-gray-300 rounded-full" />
        {label && (
          <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
            {label}
          </span>
        )}
      </button>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
