import React, { useState } from 'react';
import {
  CheckCircleIcon,
  CircleIcon,
  CircleDotIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  LockIcon,
} from 'lucide-react';
import {
  type CurriculumStreamGroup,
  type CurriculumCourse,
  type Course,
  type CompletionStatus,
  STATUS_LABELS,
  deriveBookStatus,
  cycleStatus,
} from '../lib/curriculum';

interface CurriculumProgressProps {
  curriculum: CurriculumStreamGroup[];
  editing: boolean;
  // Explicit course-level marks (whole Ruhi book / JY text / branch
  // course), keyed by course id.
  courseStatuses: Map<string, CompletionStatus>;
  // Unit-level marks, keyed by course unit id.
  unitStatuses: Map<string, CompletionStatus>;
  onCourseStatusChange: (courseId: string, status: CompletionStatus | undefined) => void;
  onUnitStatusChange: (courseUnitId: string, status: CompletionStatus | undefined) => void;
}

const BADGE_STYLES: Record<CompletionStatus, string> = {
  completed: 'bg-green-50 text-green-700 border-green-200',
  partially_completed: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
};

function StatusIcon({
  status,
  className,
}: {
  status: CompletionStatus | null;
  className?: string;
}) {
  const cls = className ?? 'w-4 h-4';
  if (status === 'completed') return <CheckCircleIcon className={`${cls} text-green-600`} />;
  if (status === 'partially_completed') return <CircleDotIcon className={`${cls} text-amber-500`} />;
  if (status === 'in_progress') return <CircleIcon className={`${cls} text-blue-500`} />;
  return <CircleIcon className={`${cls} text-gray-300`} />;
}

function StatusBadge({ status }: { status: CompletionStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${BADGE_STYLES[status]}`}
    >
      <StatusIcon status={status} className="w-3 h-3" />
      {STATUS_LABELS[status]}
    </span>
  );
}

// The "next action" hint shown on an editable click-cycle row.
function nextHint(current: CompletionStatus | undefined): string {
  if (!current) return 'Mark: In Progress';
  if (current === 'in_progress') return 'Mark: Partially Complete';
  if (current === 'partially_completed') return 'Mark: Completed';
  return 'Clear';
}

// A full-width click-cycle row used for units, JY texts, and branch
// courses.
function CycleRow({
  label,
  status,
  onClick,
  indent,
}: {
  label: string;
  status: CompletionStatus | undefined;
  onClick: () => void;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors duration-150 ${
        indent ? 'ml-3' : ''
      } ${
        status === 'completed'
          ? 'bg-green-50 border-green-200'
          : status === 'partially_completed'
          ? 'bg-amber-50 border-amber-200'
          : status === 'in_progress'
          ? 'bg-blue-50 border-blue-200'
          : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <StatusIcon status={status ?? null} className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate">
        {label}
      </span>
      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex-shrink-0">
        {nextHint(status)}
      </span>
    </button>
  );
}

// A placeholder unit — reserved for unreleased content, never markable.
function PlaceholderRow({ label }: { label: string }) {
  return (
    <div className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-dashed border-gray-200 bg-gray-50/60">
      <LockIcon className="w-4 h-4 text-gray-300 flex-shrink-0" />
      <span className="flex-1 min-w-0 text-sm text-gray-400 italic truncate">{label}</span>
      <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wide flex-shrink-0">
        Not yet released
      </span>
    </div>
  );
}

function RuhiBookCard({
  book,
  editing,
  courseStatuses,
  unitStatuses,
  onCourseStatusChange,
  onUnitStatusChange,
  expanded,
  onToggleExpand,
}: {
  book: CurriculumCourse;
  editing: boolean;
  courseStatuses: Map<string, CompletionStatus>;
  unitStatuses: Map<string, CompletionStatus>;
  onCourseStatusChange: (courseId: string, status: CompletionStatus | undefined) => void;
  onUnitStatusChange: (courseUnitId: string, status: CompletionStatus | undefined) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const effective = deriveBookStatus(book, courseStatuses.get(book.id), unitStatuses);

  // The whole-book shortcut is a bulk action over the book's units —
  // units are the single source of truth for a Ruhi book's progress.
  const markableUnits = book.units.filter(u => !u.isPlaceholder);
  const allUnitsComplete =
    markableUnits.length > 0 &&
    markableUnits.every(u => unitStatuses.get(u.id) === 'completed');

  const branchWithProgress = book.branchCourses.filter(b => courseStatuses.get(b.id));

  // In view mode, hide books with no progress at all so the summary
  // stays scannable.
  if (!editing && !effective && branchWithProgress.length === 0) return null;

  return (
    <div className="border border-gray-200/80 rounded-xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        {expanded ? (
          <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
        <span className="flex-1 min-w-0 text-sm font-semibold text-gray-900 truncate">
          {book.name}
        </span>
        {effective ? (
          <StatusBadge status={effective} />
        ) : (
          <span className="text-[11px] text-gray-300 font-medium uppercase tracking-wide">
            Not started
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-3.5 pb-3 pt-1 space-y-1.5">
          {editing && book.allowsWholeCompletion && (
            <button
              type="button"
              onClick={() => {
                for (const u of markableUnits) {
                  onUnitStatusChange(u.id, allUnitsComplete ? undefined : 'completed');
                }
              }}
              className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg border border-dashed border-blue-200 bg-blue-50/40 hover:bg-blue-50 transition-colors"
            >
              <CheckCircleIcon
                className={`w-4 h-4 flex-shrink-0 ${
                  allUnitsComplete ? 'text-green-600' : 'text-blue-400'
                }`}
              />
              <span className="flex-1 min-w-0 text-sm font-semibold text-gray-700">
                {allUnitsComplete ? 'Whole book complete' : 'Mark whole book complete'}
              </span>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex-shrink-0">
                {allUnitsComplete ? 'Clear all' : 'All units'}
              </span>
            </button>
          )}
          {editing && !book.allowsWholeCompletion && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 leading-snug">
              This book's unit set isn't finalized yet — mark its units below.
              It can only show as partially complete for now.
            </p>
          )}

          {book.units.map(unit =>
            unit.isPlaceholder ? (
              editing ? <PlaceholderRow key={unit.id} label={unit.name} /> : null
            ) : editing ? (
              <CycleRow
                key={unit.id}
                label={unit.name}
                status={unitStatuses.get(unit.id)}
                onClick={() =>
                  onUnitStatusChange(unit.id, cycleStatus(unitStatuses.get(unit.id)))
                }
              />
            ) : (
              unitStatuses.get(unit.id) && (
                <div
                  key={unit.id}
                  className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100"
                >
                  <StatusIcon
                    status={unitStatuses.get(unit.id) ?? null}
                    className="w-4 h-4 flex-shrink-0"
                  />
                  <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">
                    {unit.name}
                  </span>
                  <StatusBadge status={unitStatuses.get(unit.id)!} />
                </div>
              )
            ),
          )}

          {book.branchCourses.length > 0 && (
            <div className="pt-1.5">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-3">
                Branch Courses
              </p>
              <div className="space-y-1.5">
                {book.branchCourses.map(branch =>
                  editing ? (
                    <CycleRow
                      key={branch.id}
                      label={branch.name}
                      status={courseStatuses.get(branch.id)}
                      indent
                      onClick={() =>
                        onCourseStatusChange(
                          branch.id,
                          cycleStatus(courseStatuses.get(branch.id)),
                        )
                      }
                    />
                  ) : (
                    courseStatuses.get(branch.id) && (
                      <div
                        key={branch.id}
                        className="ml-3 flex items-center gap-3 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100"
                      >
                        <StatusIcon
                          status={courseStatuses.get(branch.id) ?? null}
                          className="w-4 h-4 flex-shrink-0"
                        />
                        <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">
                          {branch.name}
                        </span>
                        <StatusBadge status={courseStatuses.get(branch.id)!} />
                      </div>
                    )
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function JyTextRow({
  text,
  editing,
  courseStatuses,
  onCourseStatusChange,
}: {
  text: Course;
  editing: boolean;
  courseStatuses: Map<string, CompletionStatus>;
  onCourseStatusChange: (courseId: string, status: CompletionStatus | undefined) => void;
}) {
  const status = courseStatuses.get(text.id);
  if (editing) {
    return (
      <CycleRow
        label={text.name}
        status={status}
        onClick={() => onCourseStatusChange(text.id, cycleStatus(status))}
      />
    );
  }
  if (!status) return null;
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-gray-200/80">
      <StatusIcon status={status} className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate">
        {text.name}
      </span>
      <StatusBadge status={status} />
    </div>
  );
}

export function CurriculumProgress({
  curriculum,
  editing,
  courseStatuses,
  unitStatuses,
  onCourseStatusChange,
  onUnitStatusChange,
}: CurriculumProgressProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // In view mode, surface only streams/courses with recorded progress.
  const hasAnyProgress = courseStatuses.size > 0 || unitStatuses.size > 0;
  if (!editing && !hasAnyProgress) {
    return (
      <p className="text-sm text-gray-400 italic bg-gray-50 border border-gray-100 px-4 py-3 rounded-xl">
        No curriculum progress recorded yet
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {curriculum.map(group => {
        const isJy = group.stream === 'jysep';

        // View mode: skip a whole stream when nothing in it has progress.
        if (!editing) {
          const anyInStream = group.courses.some(c => {
            if (isJy) return !!courseStatuses.get(c.id);
            const effective = deriveBookStatus(c, courseStatuses.get(c.id), unitStatuses);
            return !!effective || c.branchCourses.some(b => courseStatuses.get(b.id));
          });
          if (!anyInStream) return null;
        }

        return (
          <div key={group.stream}>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
              {group.label}
            </h3>
            <div className="space-y-2">
              {isJy
                ? group.courses.map(text => (
                    <JyTextRow
                      key={text.id}
                      text={text}
                      editing={editing}
                      courseStatuses={courseStatuses}
                      onCourseStatusChange={onCourseStatusChange}
                    />
                  ))
                : group.courses.map(book => (
                    <RuhiBookCard
                      key={book.id}
                      book={book}
                      editing={editing}
                      courseStatuses={courseStatuses}
                      unitStatuses={unitStatuses}
                      onCourseStatusChange={onCourseStatusChange}
                      onUnitStatusChange={onUnitStatusChange}
                      expanded={expanded.has(book.id)}
                      onToggleExpand={() => toggleExpand(book.id)}
                    />
                  ))}
            </div>
          </div>
        );
      })}
      {editing && (
        <p className="text-[11px] text-gray-400 leading-snug">
          Click a book to reveal its units. Mark the whole book, or select
          individual units — each click cycles through in&nbsp;progress,
          partially&nbsp;complete, completed, and back to unmarked.
        </p>
      )}
    </div>
  );
}
