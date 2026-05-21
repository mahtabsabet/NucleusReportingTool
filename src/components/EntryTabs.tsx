import React, { useEffect, useMemo, useState } from 'react';

// Adaptive tab strip for journal/notebook entries. Past entries
// are presented as tabs instead of an infinite scroll. When there
// are too many to sit comfortably in a row, the granularity steps
// down: individual entries → by month → by year. Selecting a tab
// shows the entries in that bucket.
//
// We use count thresholds (rather than live pixel measurement) to
// decide granularity, and let the strip scroll horizontally as a
// safety net. This keeps the behaviour predictable without a
// ResizeObserver.

const MAX_INDIVIDUAL = 8;
const MAX_MONTHS = 12;

export interface TabEntry {
  id: string;
  occurredAt: Date;
  // Optional extra label shown on an individual-entry tab (e.g. the
  // activity an entry came from, in the theme-filtered journal view).
  tabSuffix?: string;
}

type Granularity = 'entry' | 'month' | 'year';

interface Bucket {
  key: string;
  label: string;
  ids: string[];
}

function monthKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function monthLabel(d: Date) { return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); }
function dayLabel(d: Date) { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }

export function buildBuckets<T extends TabEntry>(entries: T[]): { granularity: Granularity; buckets: Bucket[] } {
  if (entries.length <= MAX_INDIVIDUAL) {
    return {
      granularity: 'entry',
      buckets: entries.map(e => ({
        key: e.id,
        label: dayLabel(e.occurredAt) + (e.tabSuffix ? ` · ${e.tabSuffix}` : ''),
        ids: [e.id],
      })),
    };
  }
  // Group by month.
  const byMonth = new Map<string, { label: string; date: Date; ids: string[] }>();
  for (const e of entries) {
    const k = monthKey(e.occurredAt);
    if (!byMonth.has(k)) byMonth.set(k, { label: monthLabel(e.occurredAt), date: e.occurredAt, ids: [] });
    byMonth.get(k)!.ids.push(e.id);
  }
  if (byMonth.size <= MAX_MONTHS) {
    return {
      granularity: 'month',
      buckets: Array.from(byMonth.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, v]) => ({ key, label: v.label, ids: v.ids })),
    };
  }
  // Group by year.
  const byYear = new Map<string, string[]>();
  for (const e of entries) {
    const k = String(e.occurredAt.getFullYear());
    if (!byYear.has(k)) byYear.set(k, []);
    byYear.get(k)!.push(e.id);
  }
  return {
    granularity: 'year',
    buckets: Array.from(byYear.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, ids]) => ({ key, label: key, ids })),
  };
}

interface EntryTabsProps<T extends TabEntry> {
  entries: T[];
  renderEntry: (entry: T) => React.ReactNode;
  // Tailwind classes for the active/inactive tab pills, so each
  // surface can match its own palette.
  activeClass?: string;
  inactiveClass?: string;
  emptyLabel?: string;
}

export function EntryTabs<T extends TabEntry>({
  entries, renderEntry,
  activeClass = 'bg-stone-800 text-amber-50',
  inactiveClass = 'bg-white/50 text-stone-600 hover:bg-white',
  emptyLabel = 'No entries yet.',
}: EntryTabsProps<T>) {
  const { granularity, buckets } = useMemo(() => buildBuckets(entries), [entries]);
  const [activeKey, setActiveKey] = useState<string | null>(buckets[0]?.key ?? null);

  // Keep the active tab valid as the entry set changes (new entry
  // added, theme switched, etc). Default to the first (most recent).
  useEffect(() => {
    if (buckets.length === 0) { setActiveKey(null); return; }
    if (!activeKey || !buckets.some(b => b.key === activeKey)) {
      setActiveKey(buckets[0].key);
    }
  }, [buckets, activeKey]);

  const byId = useMemo(() => {
    const m = new Map<string, T>();
    for (const e of entries) m.set(e.id, e);
    return m;
  }, [entries]);

  if (entries.length === 0) {
    return <p className="font-journal italic text-stone-500 text-sm">{emptyLabel}</p>;
  }

  const active = buckets.find(b => b.key === activeKey) ?? buckets[0];
  const activeEntries = active.ids.map(id => byId.get(id)).filter(Boolean) as T[];

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 -mx-1 px-1 scrollbar-thin">
        {buckets.map(b => (
          <button
            key={b.key}
            onClick={() => setActiveKey(b.key)}
            className={`flex-shrink-0 whitespace-nowrap text-xs font-medium rounded-full px-3 py-1.5 border border-amber-900/15 transition ${
              b.key === active.key ? activeClass : inactiveClass
            }`}
          >
            {b.label}
            {granularity !== 'entry' && (
              <span className="ml-1.5 opacity-60">({b.ids.length})</span>
            )}
          </button>
        ))}
      </div>
      <div className="space-y-5">
        {activeEntries.map(e => (
          <div key={e.id}>{renderEntry(e)}</div>
        ))}
      </div>
    </div>
  );
}
