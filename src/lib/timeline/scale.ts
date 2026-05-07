// Continuous-zoom math for the timeline. The timeline lays dates onto a
// horizontal axis where one day occupies `pxPerDay` pixels. The total inner
// width is `totalDays * pxPerDay`; everything (ticks, events) is positioned
// by `pixelAtDate`. Zooming changes `pxPerDay`; panning changes the
// container's `scrollLeft`. No discrete zoom levels — tick density is
// driven by `pxPerDay` thresholds via `fadeIn`.
//
// Pure functions only — no React, no DOM.

const MS_PER_DAY = 86400000;

export function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MS_PER_DAY;
}

/** The date at `pixelX` pixels from `originDate`. Inverse of `pixelAtDate`. */
export function dateAtPixel(pixelX: number, originDate: Date, pxPerDay: number): Date {
  if (pxPerDay <= 0) return new Date(originDate);
  return new Date(originDate.getTime() + (pixelX / pxPerDay) * MS_PER_DAY);
}

/** The pixel offset of `date` from `originDate`. Inverse of `dateAtPixel`. */
export function pixelAtDate(date: Date, originDate: Date, pxPerDay: number): number {
  return daysBetween(originDate, date) * pxPerDay;
}

/** Hardest zoom-in: roughly one day per 60px. Beyond this, ticks crowd. */
export const MAX_PX_PER_DAY = 60;

/**
 * Clamp a tentative `pxPerDay` so the timeline neither zooms past day-level
 * detail nor zooms out beyond fitting the entire span in the viewport.
 */
export function clampPxPerDay(
  ppd: number,
  viewportWidth: number,
  totalDays: number,
): number {
  const fitAll = totalDays > 0 && viewportWidth > 0
    ? viewportWidth / totalDays
    : 0.05;
  const min = Math.min(fitAll, MAX_PX_PER_DAY);
  return Math.max(min, Math.min(MAX_PX_PER_DAY, ppd));
}

/**
 * Smooth 0..1 ramp from `start` to `end`. Used to fade tick layers
 * (year / cycle / month / week / day) in and out as the user zooms,
 * instead of swapping discrete views.
 */
export function fadeIn(value: number, start: number, end: number): number {
  if (value <= start) return 0;
  if (value >= end) return 1;
  return (value - start) / (end - start);
}
