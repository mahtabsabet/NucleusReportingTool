import { describe, it, expect } from 'vitest';
import { buildBuckets, type TabEntry } from '../EntryTabs';

// Adaptive bucketing for journal/notebook entry tabs:
//   ≤ 8 entries          → one tab per entry
//   > 8, ≤ 12 months     → grouped by month
//   > 12 months          → grouped by year
// Buckets are ordered newest-first.

function entry(id: string, iso: string, tabSuffix?: string): TabEntry {
  return { id, occurredAt: new Date(iso), tabSuffix };
}

describe('buildBuckets', () => {
  it('returns one tab per entry when few entries', () => {
    const entries = [
      entry('a', '2026-05-01T18:00:00'),
      entry('b', '2026-05-08T18:00:00'),
      entry('c', '2026-05-15T18:00:00'),
    ];
    const { granularity, buckets } = buildBuckets(entries);
    expect(granularity).toBe('entry');
    expect(buckets).toHaveLength(3);
    expect(buckets[0].ids).toEqual(['a']);
  });

  it('includes the tabSuffix in individual-entry labels', () => {
    const { buckets } = buildBuckets([entry('a', '2026-05-01T18:00:00', 'JY Group')]);
    expect(buckets[0].label).toContain('JY Group');
  });

  it('groups by month once there are more than 8 entries', () => {
    // 10 entries spread across 3 months → month buckets.
    const entries: TabEntry[] = [];
    for (let i = 0; i < 4; i++) entries.push(entry(`mar${i}`, `2026-03-0${i + 1}T12:00:00`));
    for (let i = 0; i < 3; i++) entries.push(entry(`apr${i}`, `2026-04-0${i + 1}T12:00:00`));
    for (let i = 0; i < 3; i++) entries.push(entry(`may${i}`, `2026-05-0${i + 1}T12:00:00`));
    const { granularity, buckets } = buildBuckets(entries);
    expect(granularity).toBe('month');
    expect(buckets).toHaveLength(3);
    // Newest month first.
    expect(buckets[0].label).toMatch(/May/);
    // Each month bucket gathers all its entries.
    const may = buckets.find(b => b.label.includes('May'))!;
    expect(may.ids).toHaveLength(3);
  });

  it('groups by year when entries span more than 12 months', () => {
    // 2 entries in each of 14 distinct months across 2 years → > 8
    // entries AND > 12 months → year granularity.
    const entries: TabEntry[] = [];
    let n = 0;
    for (let m = 0; m < 14; m++) {
      const year = 2025 + Math.floor(m / 12);
      const month = (m % 12) + 1;
      const mm = String(month).padStart(2, '0');
      entries.push(entry(`e${n++}`, `${year}-${mm}-05T12:00:00`));
      entries.push(entry(`e${n++}`, `${year}-${mm}-15T12:00:00`));
    }
    const { granularity, buckets } = buildBuckets(entries);
    expect(granularity).toBe('year');
    // Two distinct years.
    expect(buckets.map(b => b.label).sort()).toEqual(['2025', '2026']);
    // Newest year first.
    expect(buckets[0].label).toBe('2026');
  });

  it('handles an empty list', () => {
    const { buckets } = buildBuckets([]);
    expect(buckets).toHaveLength(0);
  });
});
