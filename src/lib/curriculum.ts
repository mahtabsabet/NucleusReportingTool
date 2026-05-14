// Pure curriculum domain logic — no Supabase, no React. Safe to
// unit-test in isolation. The data layer maps DB rows into these
// types; the UI consumes them.

import type { CompletionStatus, CurriculumStream } from './database.types';

export type { CompletionStatus, CurriculumStream };

export interface CourseUnit {
  id: string;
  courseId: string;
  name: string;
  order: number;
  // A placeholder reserves a slot for content not yet released
  // (the future Unit 3 of Books 12-14). Never markable.
  isPlaceholder: boolean;
}

export interface Course {
  id: string;
  name: string;
  shortName: string;
  order: number;
  stream: CurriculumStream;
  parentCourseId: string | null;
  // false for books whose unit set is not finalized — they can only
  // ever be partially complete (Books 12-14).
  allowsWholeCompletion: boolean;
  units: CourseUnit[];
}

// A course with its branch courses attached. Branch courses live in
// the `branch` stream but display nested beneath their parent
// main-sequence book (Book 3 / Book 5).
export interface CurriculumCourse extends Course {
  branchCourses: Course[];
}

export interface CurriculumStreamGroup {
  stream: CurriculumStream;
  label: string;
  courses: CurriculumCourse[];
}

export const STREAM_LABELS: Record<CurriculumStream, string> = {
  ruhi_main: 'Ruhi Main Sequence',
  branch: 'Branch Courses',
  jysep: 'Junior Youth Spiritual Empowerment Program',
};

export const STATUS_LABELS: Record<CompletionStatus, string> = {
  in_progress: 'In Progress',
  partially_completed: 'Partially Complete',
  completed: 'Completed',
};

// Ordering used when reconciling an explicit course-level mark with
// the status derived from a book's units — higher wins.
export const STATUS_RANK: Record<CompletionStatus, number> = {
  in_progress: 1,
  partially_completed: 2,
  completed: 3,
};

// Groups a flat list of courses into the display structure: the
// Ruhi main sequence (with branch courses nested under their parent
// book) and the JY program. The standalone `branch` stream is not a
// top-level group — branch courses are surfaced through their parent.
export function buildCurriculum(courses: Course[]): CurriculumStreamGroup[] {
  const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

  const branchByParent = new Map<string, Course[]>();
  for (const c of courses) {
    if (c.stream !== 'branch' || !c.parentCourseId) continue;
    const arr = branchByParent.get(c.parentCourseId) ?? [];
    arr.push(c);
    branchByParent.set(c.parentCourseId, arr);
  }

  const withBranches = (c: Course): CurriculumCourse => ({
    ...c,
    branchCourses: (branchByParent.get(c.id) ?? []).slice().sort(byOrder),
  });

  const ruhiMain = courses
    .filter(c => c.stream === 'ruhi_main')
    .sort(byOrder)
    .map(withBranches);
  const jysep = courses
    .filter(c => c.stream === 'jysep')
    .sort(byOrder)
    .map(withBranches);

  const groups: CurriculumStreamGroup[] = [];
  if (ruhiMain.length > 0) {
    groups.push({ stream: 'ruhi_main', label: STREAM_LABELS.ruhi_main, courses: ruhiMain });
  }
  if (jysep.length > 0) {
    groups.push({ stream: 'jysep', label: STREAM_LABELS.jysep, courses: jysep });
  }
  return groups;
}

// Returns the effective completion status of a course, combining any
// explicit course-level mark (whole-book / whole-text) with the status
// derived from its units. Returns null when there is no progress.
//
//   - JY texts & branch courses have no units → the explicit status is
//     the effective status.
//   - Ruhi books: every non-placeholder unit completed → completed;
//     any unit completed/partial → partially complete; otherwise in
//     progress. A book that does not allow whole completion (Books
//     12-14) is capped at partially complete.
export function deriveBookStatus(
  course: Pick<Course, 'units' | 'allowsWholeCompletion'>,
  explicitStatus: CompletionStatus | undefined,
  unitStatusById: Map<string, CompletionStatus> | Record<string, CompletionStatus>,
): CompletionStatus | null {
  const getStatus = (id: string): CompletionStatus | undefined =>
    unitStatusById instanceof Map ? unitStatusById.get(id) : unitStatusById[id];

  const nonPlaceholder = course.units.filter(u => !u.isPlaceholder);
  const unitStatuses = nonPlaceholder
    .map(u => getStatus(u.id))
    .filter((s): s is CompletionStatus => s != null);

  let derived: CompletionStatus | null = null;
  if (unitStatuses.length > 0) {
    const allCompleted =
      nonPlaceholder.length > 0 &&
      unitStatuses.length === nonPlaceholder.length &&
      unitStatuses.every(s => s === 'completed');
    if (allCompleted) {
      derived = 'completed';
    } else if (unitStatuses.some(s => s === 'completed' || s === 'partially_completed')) {
      derived = 'partially_completed';
    } else {
      derived = 'in_progress';
    }
  }

  let best: CompletionStatus | null = derived;
  if (explicitStatus && (!best || STATUS_RANK[explicitStatus] > STATUS_RANK[best])) {
    best = explicitStatus;
  }
  if (!best) return null;

  if (!course.allowsWholeCompletion && best === 'completed') {
    return 'partially_completed';
  }
  return best;
}

// Click-cycle for a unit or a JY text / branch course:
//   none → in progress → partially complete → completed → none
export function cycleStatus(
  current: CompletionStatus | undefined,
): CompletionStatus | undefined {
  if (!current) return 'in_progress';
  if (current === 'in_progress') return 'partially_completed';
  if (current === 'partially_completed') return 'completed';
  return undefined;
}
