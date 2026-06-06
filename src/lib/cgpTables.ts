import type { ClusterGrowthProfile, ActivityStatRow } from './cgp';

// A neutral table representation shared by the on-screen render and the
// exports, so the five CGP tables stay identical across surfaces.
//
// Tables are laid out HORIZONTALLY to mirror the printed Cluster Growth
// Profile they're used to populate: the items being counted run across
// the top as columns, and the metric(s) sit in the row(s) beneath.
export interface CgpTable {
  key: string;
  title: string;
  columns: string[];
  rows: (string | number)[][];
  // Column indices that are roll-up totals (rendered emphasized).
  totalColIndices?: number[];
  // Optional legend / footnote shown under the table.
  note?: string;
}

const BOOKS_8_14 = [8, 9, 10, 11, 12, 13, 14];

function activityMetricRows(
  label: string,
  cols: { label: string; stat: ActivityStatRow }[],
): { columns: string[]; rows: (string | number)[][] } {
  return {
    columns: ['', ...cols.map(c => c.label)],
    rows: [
      ['Activities', ...cols.map(c => c.stat.activities)],
      ['Attending', ...cols.map(c => c.stat.participants)],
      ['Friends of the faith', ...cols.map(c => c.stat.friends)],
    ],
  };
}

export function cgpTables(p: ClusterGrowthProfile): CgpTable[] {
  // Table 1 — Books 1–7 across the top, one "Completed" row.
  const t1: CgpTable = {
    key: 'books-1-7',
    title: 'Ruhi books completed (Books 1–7)',
    columns: ['', ...p.mainBooks.map(b => `Book ${b.book}`)],
    rows: [['Completed', ...p.mainBooks.map(b => b.completed)]],
  };

  // Table 2 — Books 8–14 across the top, a row per unit.
  const t2: CgpTable = {
    key: 'books-8-14',
    title: 'Ruhi books completed by unit (Books 8–14)',
    columns: ['', ...BOOKS_8_14.map(b => `Book ${b}`)],
    rows: [1, 2, 3].map(unit => [
      `Unit ${unit}`,
      ...BOOKS_8_14.map(b => p.unitBooks.find(u => u.book === b && u.unit === unit)?.completed ?? 0),
    ]),
  };

  // Table 3 — branch courses across the top (abbreviated), one row.
  const t3: CgpTable = {
    key: 'branch-courses',
    title: 'Branch courses completed',
    columns: [
      '',
      'B3 G2', 'B3 G3', 'B3 G4', 'B3 G5',
      'B5 BC1', 'B5 BC2', 'B5 BC3',
      'B7 BC1', 'B7 BC2', 'B7 BC3',
    ],
    rows: [['Completed', ...p.branchCourses.map(b => b.completed)]],
    note: 'B = Book · G = Grade · BC = Branch Course',
  };

  // Table 4 — educational activity types across the top, metric rows.
  const t4: CgpTable = {
    key: 'educational',
    title: 'Educational activities',
    ...activityMetricRows('', [
      { label: "Children's classes", stat: p.childrenClasses },
      { label: 'Junior youth groups', stat: p.juniorYouth },
      { label: 'Study circles', stat: p.studyCircles },
      { label: 'Total educational', stat: p.educationalTotal },
    ]),
    totalColIndices: [4],
  };

  // Table 5 — devotionals + roll-ups across the top, metric rows.
  const t5: CgpTable = {
    key: 'core',
    title: 'Core activities',
    ...activityMetricRows('', [
      { label: 'Devotional gatherings', stat: p.devotionals },
      { label: 'Total educational', stat: p.educationalTotal },
      { label: 'Total core', stat: p.coreTotal },
    ]),
    totalColIndices: [2, 3],
  };

  return [t1, t2, t3, t4, t5];
}
