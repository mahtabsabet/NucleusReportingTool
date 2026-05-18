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

// Heights tuned so 'peek' just shows the handle + the sidebar's
// sticky header (search + toggle row); 'half' surfaces the
// attention/match-scan cards and the first few list rows; 'full'
// is the whole list scrollable.
const HEIGHTS: Record<SheetState, string> = {
  peek: '152px',
  half: '50vh',
  full: '88vh',
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
  // Optional accessory bar rendered between the handle and the
  // children — used for the "Scan / New / Import" buttons that
  // would otherwise compete with the map's top bar for space.
  accessory?: React.ReactNode;
}

export function MobileBottomSheet({ state, onStateChange, children, accessory }: Props) {
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

  return (
    <div
      role="dialog"
      aria-label="Household list"
      className="fixed left-0 right-0 bottom-0 bg-white border-t border-amber-200 rounded-t-2xl shadow-2xl z-[1100] flex flex-col"
      style={{
        height: HEIGHTS[state],
        transition: 'height 0.25s ease-out',
      }}
    >
      <button
        type="button"
        onClick={onHandleClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-label={`Sheet ${state} — tap or swipe to resize`}
        className="w-full pt-2 pb-1 flex justify-center touch-none"
      >
        <span className="block w-10 h-1 bg-gray-300 rounded-full" />
      </button>
      {accessory && (
        <div className="px-4 pb-2 border-b border-amber-100">{accessory}</div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
