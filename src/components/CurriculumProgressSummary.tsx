import React from 'react';
import { CheckCircleIcon, CircleIcon, CircleDotIcon } from 'lucide-react';
import {
  buildCurriculum,
  type Course,
  type CompletionStatus,
} from '../lib/curriculum';

interface PersonLite {
  id: string;
  name: string;
  courseEnrollments: Array<{ courseId: string; status: CompletionStatus }>;
}

interface CurriculumProgressSummaryProps {
  courses: Course[];
  people: PersonLite[];
  onPersonClick: (personId: string) => void;
  emptyLabel?: string;
}

const ROW_META: Record<
  CompletionStatus,
  { icon: typeof CheckCircleIcon; iconColor: string; ring: string; chip: string }
> = {
  completed: {
    icon: CheckCircleIcon,
    iconColor: 'text-green-600',
    ring: 'bg-green-100',
    chip: 'bg-green-50 text-green-700 border-green-200/60 hover:bg-green-100 hover:border-green-300',
  },
  partially_completed: {
    icon: CircleDotIcon,
    iconColor: 'text-amber-500',
    ring: 'bg-amber-100',
    chip: 'bg-amber-50 text-amber-700 border-amber-200/60 hover:bg-amber-100 hover:border-amber-300',
  },
  in_progress: {
    icon: CircleIcon,
    iconColor: 'text-blue-600',
    ring: 'bg-blue-100',
    chip: 'bg-blue-50 text-blue-700 border-blue-200/60 hover:bg-blue-100 hover:border-blue-300',
  },
};

const ROW_ORDER: CompletionStatus[] = ['completed', 'partially_completed', 'in_progress'];

function CourseCard({
  course,
  people,
  onPersonClick,
  branch,
}: {
  course: Course;
  people: PersonLite[];
  onPersonClick: (personId: string) => void;
  branch?: boolean;
}) {
  const byStatus: Record<CompletionStatus, PersonLite[]> = {
    completed: [],
    partially_completed: [],
    in_progress: [],
  };
  for (const p of people) {
    const ce = p.courseEnrollments.find(e => e.courseId === course.id);
    if (ce) byStatus[ce.status].push(p);
  }
  const total =
    byStatus.completed.length +
    byStatus.partially_completed.length +
    byStatus.in_progress.length;
  if (total === 0) return null;

  return (
    <div
      className={`bg-white border border-gray-200/80 rounded-xl p-5 shadow-sm hover:border-blue-200 transition-colors duration-200 ${
        branch ? 'ml-4' : ''
      }`}
    >
      <div className="flex justify-between items-start mb-4 gap-3">
        <h4 className="font-semibold text-gray-900 text-sm">
          {branch && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mr-1.5">
              Branch
            </span>
          )}
          {course.name}
        </h4>
        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-md flex-shrink-0">
          {total} total
        </span>
      </div>
      <div className="space-y-3">
        {ROW_ORDER.map(status => {
          const group = byStatus[status];
          if (group.length === 0) return null;
          const meta = ROW_META[status];
          const Icon = meta.icon;
          return (
            <div key={status} className="flex items-start gap-3">
              <div className={`mt-0.5 ${meta.ring} p-1 rounded-full`}>
                <Icon className={`w-3.5 h-3.5 ${meta.iconColor} flex-shrink-0`} />
              </div>
              <div className="flex flex-wrap gap-2">
                {group.map(p => (
                  <button
                    key={p.id}
                    onClick={() => onPersonClick(p.id)}
                    className={`px-2.5 py-1 border text-xs font-semibold rounded-md transition-all duration-200 ${meta.chip}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Per-stream aggregation of curriculum progress for a set of people.
// Branch courses are rendered nested beneath their parent book; JY
// texts are shown in their own stream section.
export function CurriculumProgressSummary({
  courses,
  people,
  onPersonClick,
  emptyLabel = 'No curriculum progress recorded yet.',
}: CurriculumProgressSummaryProps) {
  const curriculum = buildCurriculum(courses);

  const enrolledCourseIds = new Set<string>();
  for (const p of people) {
    for (const ce of p.courseEnrollments) enrolledCourseIds.add(ce.courseId);
  }

  if (enrolledCourseIds.size === 0) {
    return <p className="text-sm text-gray-500 italic">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-6">
      {curriculum.map(group => {
        const groupHasProgress = group.courses.some(
          c =>
            enrolledCourseIds.has(c.id) ||
            c.branchCourses.some(b => enrolledCourseIds.has(b.id)),
        );
        if (!groupHasProgress) return null;

        // Flatten ruhi_main books with their branch courses inline.
        const cards: React.ReactNode[] = [];
        for (const course of group.courses) {
          cards.push(
            <CourseCard
              key={course.id}
              course={course}
              people={people}
              onPersonClick={onPersonClick}
            />,
          );
          for (const branch of course.branchCourses) {
            cards.push(
              <CourseCard
                key={branch.id}
                course={branch}
                people={people}
                onPersonClick={onPersonClick}
                branch
              />,
            );
          }
        }
        return (
          <div key={group.stream}>
            <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              {group.label}
            </h4>
            <div className="space-y-4">{cards}</div>
          </div>
        );
      })}
    </div>
  );
}
