import { describe, it, expect } from 'vitest';
import { computeEnrollmentDiff } from '../persons';

describe('computeEnrollmentDiff', () => {
  it('returns empty diff when current and desired are identical', () => {
    const current = [{ id: '1', course_id: 'course-a', status: 'in_progress' }];
    const desired = [{ courseId: 'course-a', status: 'in_progress' as const }];

    const diff = computeEnrollmentDiff(current, desired);

    expect(diff.idsToDelete).toEqual([]);
    expect(diff.toInsert).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });

  it('marks removed enrollments for deletion', () => {
    const current = [
      { id: '1', course_id: 'course-a', status: 'in_progress' },
      { id: '2', course_id: 'course-b', status: 'completed' },
    ];
    const desired = [{ courseId: 'course-a', status: 'in_progress' as const }];

    const diff = computeEnrollmentDiff(current, desired);

    expect(diff.idsToDelete).toEqual(['2']);
    expect(diff.toInsert).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });

  it('marks new enrollments for insertion', () => {
    const current: Array<{ id: string; course_id: string; status: string }> = [];
    const desired = [
      { courseId: 'course-a', status: 'in_progress' as const },
      { courseId: 'course-b', status: 'completed' as const },
    ];

    const diff = computeEnrollmentDiff(current, desired);

    expect(diff.idsToDelete).toEqual([]);
    expect(diff.toInsert).toEqual(desired);
    expect(diff.toUpdate).toEqual([]);
  });

  it('marks changed status for update', () => {
    const current = [{ id: '1', course_id: 'course-a', status: 'in_progress' }];
    const desired = [{ courseId: 'course-a', status: 'completed' as const }];

    const diff = computeEnrollmentDiff(current, desired);

    expect(diff.idsToDelete).toEqual([]);
    expect(diff.toInsert).toEqual([]);
    expect(diff.toUpdate).toEqual([{ id: '1', courseId: 'course-a', newStatus: 'completed' }]);
  });

  it('does not mark unchanged enrollments for update', () => {
    const current = [{ id: '1', course_id: 'course-a', status: 'completed' }];
    const desired = [{ courseId: 'course-a', status: 'completed' as const }];

    const diff = computeEnrollmentDiff(current, desired);

    expect(diff.toUpdate).toEqual([]);
  });

  it('handles a mix of delete, insert, and update in one call', () => {
    const current = [
      { id: '1', course_id: 'course-a', status: 'in_progress' }, // will update to completed
      { id: '2', course_id: 'course-b', status: 'completed' },   // will be deleted
    ];
    const desired = [
      { courseId: 'course-a', status: 'completed' as const },    // update
      { courseId: 'course-c', status: 'in_progress' as const },  // new insert
    ];

    const diff = computeEnrollmentDiff(current, desired);

    expect(diff.idsToDelete).toEqual(['2']);
    expect(diff.toInsert).toEqual([{ courseId: 'course-c', status: 'in_progress' }]);
    expect(diff.toUpdate).toEqual([{ id: '1', courseId: 'course-a', newStatus: 'completed' }]);
  });

  it('handles empty current and empty desired', () => {
    const diff = computeEnrollmentDiff([], []);
    expect(diff.idsToDelete).toEqual([]);
    expect(diff.toInsert).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });
});
