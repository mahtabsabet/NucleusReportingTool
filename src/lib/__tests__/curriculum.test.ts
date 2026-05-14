import { describe, it, expect } from 'vitest';
import {
  buildCurriculum,
  deriveBookStatus,
  cycleStatus,
  type Course,
  type CourseUnit,
  type CompletionStatus,
} from '../curriculum';

function unit(id: string, order: number, isPlaceholder = false): CourseUnit {
  return { id, courseId: 'c', name: `Unit ${order}`, order, isPlaceholder };
}

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: 'c',
    name: 'Book X',
    shortName: 'Book X',
    order: 1,
    stream: 'ruhi_main',
    parentCourseId: null,
    allowsWholeCompletion: true,
    units: [],
    ...overrides,
  };
}

describe('deriveBookStatus', () => {
  it('returns null when there is no progress at all', () => {
    const c = course({ units: [unit('u1', 1), unit('u2', 2), unit('u3', 3)] });
    expect(deriveBookStatus(c, undefined, new Map())).toBeNull();
  });

  it('uses the explicit whole-course mark when a course has no units', () => {
    const jy = course({ units: [] });
    expect(deriveBookStatus(jy, 'completed', new Map())).toBe('completed');
    expect(deriveBookStatus(jy, 'partially_completed', new Map())).toBe('partially_completed');
    expect(deriveBookStatus(jy, 'in_progress', new Map())).toBe('in_progress');
  });

  it('is completed when every non-placeholder unit is completed', () => {
    const c = course({ units: [unit('u1', 1), unit('u2', 2), unit('u3', 3)] });
    const units = new Map<string, CompletionStatus>([
      ['u1', 'completed'],
      ['u2', 'completed'],
      ['u3', 'completed'],
    ]);
    expect(deriveBookStatus(c, undefined, units)).toBe('completed');
  });

  it('caps a fully-completed book at partial when whole completion is not allowed', () => {
    // Books 12-14: Unit 3 is a placeholder, so units 1 & 2 complete is
    // still only "partially complete".
    const c = course({
      allowsWholeCompletion: false,
      units: [unit('u1', 1), unit('u2', 2), unit('u3', 3, true)],
    });
    const units = new Map<string, CompletionStatus>([
      ['u1', 'completed'],
      ['u2', 'completed'],
    ]);
    expect(deriveBookStatus(c, undefined, units)).toBe('partially_completed');
  });

  it('ignores placeholder units when deciding whole-book completion', () => {
    const c = course({ units: [unit('u1', 1), unit('u2', 2), unit('u3', 3, true)] });
    const units = new Map<string, CompletionStatus>([
      ['u1', 'completed'],
      ['u2', 'completed'],
    ]);
    expect(deriveBookStatus(c, undefined, units)).toBe('completed');
  });

  it('is partially complete when only some units are done', () => {
    const c = course({ units: [unit('u1', 1), unit('u2', 2), unit('u3', 3)] });
    expect(
      deriveBookStatus(c, undefined, new Map([['u1', 'completed']])),
    ).toBe('partially_completed');
    expect(
      deriveBookStatus(c, undefined, new Map([['u1', 'partially_completed']])),
    ).toBe('partially_completed');
  });

  it('is in progress when units are only started', () => {
    const c = course({ units: [unit('u1', 1), unit('u2', 2), unit('u3', 3)] });
    expect(
      deriveBookStatus(c, undefined, new Map([['u1', 'in_progress']])),
    ).toBe('in_progress');
  });

  it('takes whichever of the explicit mark and unit-derived status shows more progress', () => {
    const c = course({ units: [unit('u1', 1), unit('u2', 2), unit('u3', 3)] });
    // explicit in_progress, units derive partial -> partial wins
    expect(
      deriveBookStatus(c, 'in_progress', new Map([['u1', 'completed']])),
    ).toBe('partially_completed');
    // explicit completed, units only started -> completed wins
    expect(
      deriveBookStatus(c, 'completed', new Map([['u1', 'in_progress']])),
    ).toBe('completed');
  });
});

describe('buildCurriculum', () => {
  const book3 = course({ id: 'b3', name: 'Book 3', shortName: 'Book 3', order: 3 });
  const book5 = course({ id: 'b5', name: 'Book 5', shortName: 'Book 5', order: 5 });
  const book1 = course({ id: 'b1', name: 'Book 1', shortName: 'Book 1', order: 1 });
  const branch3b = course({
    id: 'br3b',
    name: 'Grade 3',
    shortName: 'Grade 3',
    order: 2,
    stream: 'branch',
    parentCourseId: 'b3',
  });
  const branch3a = course({
    id: 'br3a',
    name: 'Grade 2',
    shortName: 'Grade 2',
    order: 1,
    stream: 'branch',
    parentCourseId: 'b3',
  });
  const jy1 = course({ id: 'jy1', name: 'Breezes', shortName: 'Breezes', order: 1, stream: 'jysep' });

  it('groups streams, sorts by order, and nests branch courses under their parent', () => {
    const groups = buildCurriculum([book3, branch3b, book1, jy1, book5, branch3a]);

    expect(groups.map(g => g.stream)).toEqual(['ruhi_main', 'jysep']);

    const ruhi = groups[0];
    expect(ruhi.courses.map(c => c.id)).toEqual(['b1', 'b3', 'b5']);

    const b3 = ruhi.courses.find(c => c.id === 'b3')!;
    expect(b3.branchCourses.map(c => c.id)).toEqual(['br3a', 'br3b']);

    const b1 = ruhi.courses.find(c => c.id === 'b1')!;
    expect(b1.branchCourses).toEqual([]);

    const jysep = groups[1];
    expect(jysep.courses.map(c => c.id)).toEqual(['jy1']);
  });

  it('omits a stream group when it has no courses', () => {
    expect(buildCurriculum([jy1]).map(g => g.stream)).toEqual(['jysep']);
    expect(buildCurriculum([book1]).map(g => g.stream)).toEqual(['ruhi_main']);
  });
});

describe('cycleStatus', () => {
  it('cycles none -> in progress -> partial -> completed -> none', () => {
    expect(cycleStatus(undefined)).toBe('in_progress');
    expect(cycleStatus('in_progress')).toBe('partially_completed');
    expect(cycleStatus('partially_completed')).toBe('completed');
    expect(cycleStatus('completed')).toBeUndefined();
  });
});
