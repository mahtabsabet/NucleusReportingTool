import { describe, it, expect } from 'vitest';
import {
  computeClusterGrowthProfile,
  BRANCH_TEMPLATE,
  type CgpInputs,
  type CgpBook,
} from '../cgp';
import type { ReligiousStatus } from '../database.types';

// Build a 14-book main sequence; books 8–14 get three real units each.
function makeBooks(): CgpBook[] {
  const books: CgpBook[] = [];
  for (let book = 1; book <= 14; book++) {
    const units =
      book >= 8
        ? [1, 2, 3].map(u => ({ unit: u, name: `Unit ${u}`, unitId: `b${book}u${u}` }))
        : [];
    books.push({ book, name: `Book ${book}`, courseId: `c${book}`, units });
  }
  return books;
}

function baseInputs(over: Partial<CgpInputs> = {}): CgpInputs {
  return {
    clusterPersonIds: new Set(['p1', 'p2', 'p3']),
    religiousStatus: new Map<string, ReligiousStatus>([
      ['p1', 'bahai'],
      ['p2', 'friend'],
      ['p3', 'unknown'],
    ]),
    completedCourse: new Set(),
    completedUnit: new Set(),
    books: makeBooks(),
    branchCourses: [],
    activities: [],
    ...over,
  };
}

describe('computeClusterGrowthProfile — Table 1 (Books 1–7)', () => {
  it('counts whole-book completions only for people in the cluster', () => {
    const cgp = computeClusterGrowthProfile(
      baseInputs({
        // p1 & p2 finished Book 1; p3 finished Book 2; outsider p9 finished Book 1.
        completedCourse: new Set(['p1:c1', 'p2:c1', 'p3:c2', 'p9:c1']),
      }),
    );
    expect(cgp.mainBooks).toHaveLength(7);
    expect(cgp.mainBooks[0]).toMatchObject({ book: 1, completed: 2 }); // p9 excluded
    expect(cgp.mainBooks[1]).toMatchObject({ book: 2, completed: 1 });
    expect(cgp.mainBooks[2]).toMatchObject({ book: 3, completed: 0 });
  });

  it('reports 0 for a book missing from the catalog', () => {
    const books = makeBooks().filter(b => b.book !== 4);
    const cgp = computeClusterGrowthProfile(baseInputs({ books }));
    expect(cgp.mainBooks.find(b => b.book === 4)).toMatchObject({ completed: 0 });
  });
});

describe('computeClusterGrowthProfile — Table 2 (Books 8–14 units)', () => {
  it('always renders three unit slots per book (8–14 = 21 rows)', () => {
    const cgp = computeClusterGrowthProfile(baseInputs());
    expect(cgp.unitBooks).toHaveLength(7 * 3);
    expect(cgp.unitBooks.every(r => r.book >= 8 && r.book <= 14)).toBe(true);
  });

  it('counts per-unit completions within the cluster', () => {
    const cgp = computeClusterGrowthProfile(
      baseInputs({
        completedUnit: new Set(['p1:b8u1', 'p2:b8u1', 'p1:b8u2', 'p9:b8u1']),
      }),
    );
    const b8 = cgp.unitBooks.filter(r => r.book === 8);
    expect(b8.find(r => r.unit === 1)).toMatchObject({ completed: 2 }); // p9 excluded
    expect(b8.find(r => r.unit === 2)).toMatchObject({ completed: 1 });
    expect(b8.find(r => r.unit === 3)).toMatchObject({ completed: 0 });
  });

  it('renders a placeholder slot as 0 when the unit is absent', () => {
    const books = makeBooks().map(b =>
      b.book === 12 ? { ...b, units: b.units.filter(u => u.unit !== 3) } : b,
    );
    const cgp = computeClusterGrowthProfile(baseInputs({ books }));
    const b12u3 = cgp.unitBooks.find(r => r.book === 12 && r.unit === 3);
    expect(b12u3).toMatchObject({ completed: 0 });
  });
});

describe('computeClusterGrowthProfile — Table 3 (branch courses)', () => {
  it('renders the fixed template and reports 0 for missing courses', () => {
    const cgp = computeClusterGrowthProfile(baseInputs());
    expect(cgp.branchCourses).toHaveLength(BRANCH_TEMPLATE.length);
    expect(cgp.branchCourses.every(r => r.completed === 0)).toBe(true);
    expect(cgp.branchCourses.filter(r => r.parentBook === 3)).toHaveLength(4);
    expect(cgp.branchCourses.filter(r => r.parentBook === 5)).toHaveLength(3);
    expect(cgp.branchCourses.filter(r => r.parentBook === 7)).toHaveLength(3);
  });

  it('matches a catalogued branch course by parent + label and counts it', () => {
    const cgp = computeClusterGrowthProfile(
      baseInputs({
        branchCourses: [{ parentBook: 3, label: 'Grade 2', courseId: 'g2' }],
        completedCourse: new Set(['p1:g2', 'p3:g2']),
      }),
    );
    const g2 = cgp.branchCourses.find(r => r.parentBook === 3 && r.label === 'Grade 2');
    expect(g2).toMatchObject({ completed: 2 });
  });
});

describe('computeClusterGrowthProfile — Tables 4 & 5 (activities)', () => {
  const activities = [
    { type: 'children_class' as const, activeParticipantIds: ['p1', 'p2'] }, // 1 friend (p2)
    { type: 'children_class' as const, activeParticipantIds: ['p2', 'p3'] }, // 1 friend (p2)
    { type: 'junior_youth' as const, activeParticipantIds: ['p2'] }, // 1 friend
    { type: 'study_circle' as const, activeParticipantIds: ['p1', 'p3'] }, // 0 friends
    { type: 'devotional' as const, activeParticipantIds: ['p2', 'p2'] }, // 2 (p2 twice → double-count)
    { type: 'fireside' as const, activeParticipantIds: ['p2'] }, // ignored type
  ];

  it('tallies each educational type with friend-of-the-faith counts', () => {
    const cgp = computeClusterGrowthProfile(baseInputs({ activities }));
    expect(cgp.childrenClasses).toEqual({ activities: 2, participants: 4, friends: 2 });
    expect(cgp.juniorYouth).toEqual({ activities: 1, participants: 1, friends: 1 });
    expect(cgp.studyCircles).toEqual({ activities: 1, participants: 2, friends: 0 });
  });

  it('rolls up educational total = CC + JY + study circles', () => {
    const cgp = computeClusterGrowthProfile(baseInputs({ activities }));
    expect(cgp.educationalTotal).toEqual({ activities: 4, participants: 7, friends: 3 });
  });

  it('counts devotionals (summing duplicated roster entries)', () => {
    const cgp = computeClusterGrowthProfile(baseInputs({ activities }));
    expect(cgp.devotionals).toEqual({ activities: 1, participants: 2, friends: 2 });
  });

  it('rolls up core total = devotionals + educational total', () => {
    const cgp = computeClusterGrowthProfile(baseInputs({ activities }));
    expect(cgp.coreTotal).toEqual({ activities: 5, participants: 9, friends: 5 });
  });

  it('ignores non-core activity types (fireside/other)', () => {
    const cgp = computeClusterGrowthProfile(baseInputs({ activities }));
    // fireside p2 would have added a friend; core total stays 5.
    expect(cgp.coreTotal.friends).toBe(5);
  });
});
