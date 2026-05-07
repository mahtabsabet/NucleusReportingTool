import { describe, it, expect } from 'vitest';
import {
  clampPxPerDay,
  dateAtPixel,
  daysBetween,
  fadeIn,
  MAX_PX_PER_DAY,
  pixelAtDate,
} from '../scale';

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe('scale: pixel ↔ date', () => {
  it('round-trips pixelAtDate / dateAtPixel', () => {
    const origin = D(2026, 1, 1);
    const target = D(2026, 6, 15);
    const ppd = 2.5;
    const px = pixelAtDate(target, origin, ppd);
    const back = dateAtPixel(px, origin, ppd);
    expect(back.getTime()).toBe(target.getTime());
  });

  it('daysBetween is signed', () => {
    expect(daysBetween(D(2026, 1, 1), D(2026, 1, 11))).toBe(10);
    expect(daysBetween(D(2026, 1, 11), D(2026, 1, 1))).toBe(-10);
  });

  it('returns origin when pxPerDay is zero (unset state)', () => {
    const origin = D(2026, 1, 1);
    expect(dateAtPixel(123, origin, 0).getTime()).toBe(origin.getTime());
  });
});

describe('clampPxPerDay', () => {
  it('floors at "fit-all" (viewport width / total days)', () => {
    // 1200px viewport, 1825 days → fit-all ≈ 0.657 ppd. Anything below clamps up.
    expect(clampPxPerDay(0.1, 1200, 1825)).toBeCloseTo(1200 / 1825, 5);
  });

  it('caps at MAX_PX_PER_DAY', () => {
    expect(clampPxPerDay(1000, 1200, 1825)).toBe(MAX_PX_PER_DAY);
  });

  it('lets values inside the band pass through', () => {
    expect(clampPxPerDay(5, 1200, 1825)).toBe(5);
  });

  it('does not floor below MAX when fit-all would exceed it', () => {
    // Tiny totalDays could make fit-all enormous; clamp uses min(fitAll, MAX) as the floor.
    expect(clampPxPerDay(10, 1200, 5)).toBe(MAX_PX_PER_DAY);
  });
});

describe('fadeIn', () => {
  it('is 0 below start, 1 above end, linear in between', () => {
    expect(fadeIn(0, 1, 2)).toBe(0);
    expect(fadeIn(1, 1, 2)).toBe(0);
    expect(fadeIn(1.5, 1, 2)).toBeCloseTo(0.5, 5);
    expect(fadeIn(2, 1, 2)).toBe(1);
    expect(fadeIn(5, 1, 2)).toBe(1);
  });
});
