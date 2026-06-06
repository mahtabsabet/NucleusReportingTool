import type { ClusterGrowthProfile, ActivityStatRow } from './cgp';

// A neutral table representation shared by the on-screen render and the
// exports, so the five CGP tables stay identical across surfaces.
export interface CgpTable {
  key: string;
  title: string;
  columns: string[];
  rows: (string | number)[][];
  // Indices of rows that are roll-up totals (rendered emphasized).
  totalRowIndices?: number[];
}

const ACTIVITY_COLUMNS = ['', 'Activities', 'Attending', 'Friends of the faith'];

function activityRow(label: string, s: ActivityStatRow): (string | number)[] {
  return [label, s.activities, s.participants, s.friends];
}

export function cgpTables(p: ClusterGrowthProfile): CgpTable[] {
  return [
    {
      key: 'books-1-7',
      title: 'Ruhi books completed (Books 1–7)',
      columns: ['Book', 'Title', 'Completed'],
      rows: p.mainBooks.map(b => [`Book ${b.book}`, b.name, b.completed]),
    },
    {
      key: 'books-8-14',
      title: 'Ruhi books completed by unit (Books 8–14)',
      columns: ['Book', 'Unit', 'Completed'],
      rows: p.unitBooks.map(u => [`Book ${u.book}`, `Unit ${u.unit}`, u.completed]),
    },
    {
      key: 'branch-courses',
      title: 'Branch courses completed',
      columns: ['Book', 'Branch course', 'Completed'],
      rows: p.branchCourses.map(b => [`Book ${b.parentBook}`, b.label, b.completed]),
    },
    {
      key: 'educational',
      title: 'Educational activities',
      columns: ACTIVITY_COLUMNS,
      rows: [
        activityRow("Children's classes", p.childrenClasses),
        activityRow('Junior youth groups', p.juniorYouth),
        activityRow('Study circles', p.studyCircles),
        activityRow('Total educational', p.educationalTotal),
      ],
      totalRowIndices: [3],
    },
    {
      key: 'core',
      title: 'Core activities',
      columns: ACTIVITY_COLUMNS,
      rows: [
        activityRow('Devotional gatherings', p.devotionals),
        activityRow('Total educational activities', p.educationalTotal),
        activityRow('Total core activities', p.coreTotal),
      ],
      totalRowIndices: [1, 2],
    },
  ];
}
