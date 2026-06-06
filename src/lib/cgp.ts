import type { ActivityType, ReligiousStatus } from './database.types';

// ============================================================
// Cluster Growth Profile — pure compute layer
//
// A point-in-time snapshot of a single cluster (everything is a
// running total; no time framing). See CGP_SPEC.md for the full
// definition. This module is intentionally DB-free so the counting
// logic is trivially unit-testable; the data layer (db/cgp.ts) is
// responsible for fetching cluster-scoped rows and handing them in.
// ============================================================

// ── Output shapes ────────────────────────────────────────────

/** Table 1: whole-book completion (Books 1–7). */
export interface BookRow {
  book: number;
  name: string;
  completed: number;
}

/** Table 2: per-unit completion (Books 8–14, three unit slots each). */
export interface UnitRow {
  book: number;
  unit: number; // 1..3
  name: string;
  completed: number;
}

/** Table 3: branch-course completion (Book 3 grades, Book 5/7 branches). */
export interface BranchRow {
  parentBook: number; // 3, 5, or 7
  label: string;
  completed: number;
}

/** Tables 4 & 5: one activity-type line. */
export interface ActivityStatRow {
  activities: number;
  participants: number;
  friends: number;
}

export interface ClusterGrowthProfile {
  mainBooks: BookRow[]; // Table 1
  unitBooks: UnitRow[]; // Table 2
  branchCourses: BranchRow[]; // Table 3
  childrenClasses: ActivityStatRow; // Table 4
  juniorYouth: ActivityStatRow; // Table 4
  studyCircles: ActivityStatRow; // Table 4
  educationalTotal: ActivityStatRow; // Table 5 (CC + JY + study circles)
  devotionals: ActivityStatRow; // Table 5
  coreTotal: ActivityStatRow; // Table 5 (devotionals + educational total)
}

// ── Input shapes ─────────────────────────────────────────────

/** A main-sequence Ruhi book (stream `ruhi_main`), order = book number. */
export interface CgpBook {
  book: number; // 1..14
  name: string;
  courseId: string;
  units: { unit: number; name: string; unitId: string }[]; // ordered
}

/** A branch course, already tagged with the parent book it hangs off. */
export interface CgpBranchCourse {
  parentBook: number; // 3, 5, or 7
  label: string; // matched against BRANCH_TEMPLATE labels
  courseId: string;
}

/** An active, cluster-scoped activity with its active roster. */
export interface CgpActivity {
  type: ActivityType;
  activeParticipantIds: string[];
}

export interface CgpInputs {
  /** persons whose canonical cluster affiliation is this cluster. */
  clusterPersonIds: Set<string>;
  /** personId → religious status, for the friend-of-the-faith tally. */
  religiousStatus: Map<string, ReligiousStatus>;
  /** Completed whole-book enrollments, keyed `${personId}:${courseId}`. */
  completedCourse: Set<string>;
  /** Completed unit enrollments, keyed `${personId}:${unitId}`. */
  completedUnit: Set<string>;
  books: CgpBook[];
  branchCourses: CgpBranchCourse[];
  /** Active activities in the cluster (already lifecycle-filtered). */
  activities: CgpActivity[];
}

// ── Branch-course template (Table 3 rows, fixed) ─────────────
// Rendered even when a course doesn't exist in the catalog yet — those
// simply report 0. Book 3 → children's-class grades; Book 5 & 7 →
// their three branch courses.
export const BRANCH_TEMPLATE: { parentBook: number; label: string }[] = [
  { parentBook: 3, label: 'Grade 2' },
  { parentBook: 3, label: 'Grade 3' },
  { parentBook: 3, label: 'Grade 4' },
  { parentBook: 3, label: 'Grade 5' },
  { parentBook: 5, label: 'Branch Course 1' },
  { parentBook: 5, label: 'Branch Course 2' },
  { parentBook: 5, label: 'Branch Course 3' },
  { parentBook: 7, label: 'Branch Course 1' },
  { parentBook: 7, label: 'Branch Course 2' },
  { parentBook: 7, label: 'Branch Course 3' },
];

function normLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Count cluster persons who completed a given whole course.
function countCourseCompletions(courseId: string, inp: CgpInputs): number {
  let n = 0;
  for (const pid of inp.clusterPersonIds) {
    if (inp.completedCourse.has(`${pid}:${courseId}`)) n++;
  }
  return n;
}

// Count cluster persons who completed a given unit.
function countUnitCompletions(unitId: string, inp: CgpInputs): number {
  let n = 0;
  for (const pid of inp.clusterPersonIds) {
    if (inp.completedUnit.has(`${pid}:${unitId}`)) n++;
  }
  return n;
}

// Roll a set of activities into one stat line: activity count, summed
// roster size, and summed friends-of-the-faith. Totals are deliberately
// summed across activities (a person on two rosters counts twice).
function statForActivities(activities: CgpActivity[], inp: CgpInputs): ActivityStatRow {
  let participants = 0;
  let friends = 0;
  for (const a of activities) {
    participants += a.activeParticipantIds.length;
    for (const pid of a.activeParticipantIds) {
      if (inp.religiousStatus.get(pid) === 'friend') friends++;
    }
  }
  return { activities: activities.length, participants, friends };
}

function addStats(...rows: ActivityStatRow[]): ActivityStatRow {
  return rows.reduce(
    (acc, r) => ({
      activities: acc.activities + r.activities,
      participants: acc.participants + r.participants,
      friends: acc.friends + r.friends,
    }),
    { activities: 0, participants: 0, friends: 0 },
  );
}

/**
 * Compute the full Cluster Growth Profile from already-fetched,
 * cluster-scoped inputs.
 */
export function computeClusterGrowthProfile(inp: CgpInputs): ClusterGrowthProfile {
  const byBook = new Map(inp.books.map(b => [b.book, b]));

  // Table 1 — Books 1–7, whole-book completion.
  const mainBooks: BookRow[] = [];
  for (let book = 1; book <= 7; book++) {
    const b = byBook.get(book);
    mainBooks.push({
      book,
      name: b?.name ?? `Book ${book}`,
      completed: b ? countCourseCompletions(b.courseId, inp) : 0,
    });
  }

  // Table 2 — Books 8–14, three unit slots each.
  const unitBooks: UnitRow[] = [];
  for (let book = 8; book <= 14; book++) {
    const b = byBook.get(book);
    for (let unit = 1; unit <= 3; unit++) {
      const u = b?.units.find(x => x.unit === unit);
      unitBooks.push({
        book,
        unit,
        name: u?.name ?? `Unit ${unit}`,
        completed: u ? countUnitCompletions(u.unitId, inp) : 0,
      });
    }
  }

  // Table 3 — branch courses (fixed template; missing → 0).
  const branchByKey = new Map(
    inp.branchCourses.map(c => [`${c.parentBook}:${normLabel(c.label)}`, c]),
  );
  const branchCourses: BranchRow[] = BRANCH_TEMPLATE.map(t => {
    const match = branchByKey.get(`${t.parentBook}:${normLabel(t.label)}`);
    return {
      parentBook: t.parentBook,
      label: t.label,
      completed: match ? countCourseCompletions(match.courseId, inp) : 0,
    };
  });

  // Tables 4 & 5 — activity tallies.
  const childrenClasses = statForActivities(
    inp.activities.filter(a => a.type === 'children_class'),
    inp,
  );
  const juniorYouth = statForActivities(
    inp.activities.filter(a => a.type === 'junior_youth'),
    inp,
  );
  const studyCircles = statForActivities(
    inp.activities.filter(a => a.type === 'study_circle'),
    inp,
  );
  const educationalTotal = addStats(childrenClasses, juniorYouth, studyCircles);

  const devotionals = statForActivities(
    inp.activities.filter(a => a.type === 'devotional'),
    inp,
  );
  const coreTotal = addStats(devotionals, educationalTotal);

  return {
    mainBooks,
    unitBooks,
    branchCourses,
    childrenClasses,
    juniorYouth,
    studyCircles,
    educationalTotal,
    devotionals,
    coreTotal,
  };
}
