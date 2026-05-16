import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeftIcon,
  XIcon,
  CheckIcon,
  UserIcon,
  ClockIcon,
  FileTextIcon,
  Trash2Icon,
  PlayCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
} from 'lucide-react';
import {
  fetchActivityDetail,
  addPersonToActivity,
  removeActivityParticipant,
  updateActivityDetails,
  activityDeletePermission,
  deleteActivity,
  setActivityLifecycle,
} from '../lib/db/nucleus';
import { submitPermissionRequest } from '../lib/db/requests';
import { getCallerContext } from '../lib/db/users';
import {
  isRegionalOnly,
  isActivityLead,
  isClusterCoordinator,
  isNucleusCollaborator,
} from '../lib/permissions';
import { markPersonUnplaced } from '../lib/unplacedTracker';
import {
  Activity,
  ActivityLifecycle,
  ActivitySchedulingMode,
} from '../types';
import { PersonNameCombobox } from './PersonNameCombobox';
import { GlobalSearch } from './GlobalSearch';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDateForInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateFromInput(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

// Build a one-line read-only summary of the schedule. Used at
// the top of the activity detail header so the schedule is
// visible even when the editor is collapsed.
function buildScheduleSummary(opts: {
  schedulingMode: ActivitySchedulingMode;
  schedule: string;
  daysOfWeek: number[];
  time: string;
  intervalWeeks: number;
  startDate: string;
  endDate: string;
}): string {
  switch (opts.schedulingMode) {
    case 'sporadic_ongoing':
      return opts.schedule.trim() || 'Sporadic / ongoing';
    case 'short_duration': {
      if (opts.startDate && opts.endDate) {
        return `${opts.startDate} → ${opts.endDate}`;
      }
      return 'Short duration (dates not yet set)';
    }
    case 'structured_recurring': {
      const days = opts.daysOfWeek.map(d => DAY_LABELS[d]).join(', ');
      const everyN = opts.intervalWeeks <= 1
        ? 'Weekly'
        : opts.intervalWeeks === 2
          ? 'Biweekly'
          : `Every ${opts.intervalWeeks} weeks`;
      const t = opts.time ? ` at ${opts.time}` : '';
      const d = days ? ` on ${days}` : '';
      return `${everyN}${d}${t}`.trim();
    }
  }
}

const LIFECYCLE_LABELS: Record<ActivityLifecycle, string> = {
  planned: 'Planned',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const LIFECYCLE_BADGE: Record<ActivityLifecycle, string> = {
  planned: 'bg-amber-50 text-amber-800 border-amber-200',
  active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  completed: 'bg-gray-100 text-gray-700 border-gray-300',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
};

// DB role enum keys for each activity type
const ROLES_FOR_TYPE: Record<string, string[]> = {
  'children-class': ['teacher', 'child', 'parent', 'other'],
  'junior-youth': ['animator', 'junior_youth', 'parent', 'other'],
  'study-circle': ['tutor', 'participant'],
  devotional: ['host', 'attendee'],
  other: ['host', 'participant'],
};

const ROLE_DISPLAY: Record<string, string> = {
  teacher: 'Teachers',
  child: 'Children',
  parent: 'Parents',
  animator: 'Animators',
  junior_youth: 'Junior Youth',
  tutor: 'Tutor',
  participant: 'Participants',
  host: 'Host',
  attendee: 'Attendees',
  other: 'Other',
};

export function ActivityDetail() {
  const { nucleusId, activityId } = useParams<{ nucleusId: string; activityId: string }>();
  const navigate = useNavigate();

  const [activity, setActivity] = useState<Activity | null>(null);
  const [nucleusName, setNucleusName] = useState('');
  const [personNames, setPersonNames] = useState<Record<string, string>>({});
  const [participants, setParticipants] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [schedule, setSchedule] = useState('');
  const [notes, setNotes] = useState('');
  // Scheduling-mode editor state. All four fields are tracked
  // locally so the user can switch modes without losing a partial
  // entry; we only persist whatever fields are relevant to the
  // active mode on Save.
  const [schedulingMode, setSchedulingMode] =
    useState<ActivitySchedulingMode>('sporadic_ongoing');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [time, setTime] = useState('');
  const [intervalWeeks, setIntervalWeeks] = useState<number>(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [lifecycleSaving, setLifecycleSaving] = useState(false);
  const [deletePermission, setDeletePermission] = useState<'direct' | 'request' | 'none'>('none');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [requestNote, setRequestNote] = useState('');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [regionalOnly, setRegionalOnly] = useState(false);
  // Activity-Lead-only users (no global flag, no CC/NC grants) have no
  // nucleus / cluster page they can navigate "back" to — they're pinned
  // to this activity by the route guard in App.tsx. Hide the back link
  // for them so the UI matches what they can actually do.
  const [activityLeadOnly, setActivityLeadOnly] = useState(false);

  useEffect(() => {
    getCallerContext().then(ctx => {
      setRegionalOnly(ctx ? isRegionalOnly(ctx) : false);
      if (!ctx) { setActivityLeadOnly(false); return; }
      setActivityLeadOnly(
        !ctx.isSuperAdmin && !ctx.isAdmin && !ctx.isRegionalViewer
        && !isClusterCoordinator(ctx) && !isNucleusCollaborator(ctx)
        && isActivityLead(ctx),
      );
    });
  }, []);

  useEffect(() => {
    if (!activityId) return;
    fetchActivityDetail(activityId).then(result => {
      if (result) {
        const { activity: a, nucleusName: nName, personNames: pNames } = result;
        setActivity(a);
        setNucleusName(nName);
        setPersonNames(pNames);
        setSchedule(a.schedule ?? '');
        setNotes(a.notes ?? '');
        setSchedulingMode(a.schedulingMode ?? 'sporadic_ongoing');
        setDaysOfWeek(a.daysOfWeek ?? []);
        setTime(a.time ?? '');
        setIntervalWeeks(a.intervalWeeks ?? 1);
        setStartDate(a.startDate ? formatDateForInput(a.startDate) : '');
        setEndDate(a.endDate ? formatDateForInput(a.endDate) : '');
        // Pre-fill expected roles
        const expectedRoles = ROLES_FOR_TYPE[a.type] ?? [];
        const initialParticipants = { ...a.participants };
        expectedRoles.forEach(role => {
          if (!initialParticipants[role]) initialParticipants[role] = [];
        });
        setParticipants(initialParticipants);
      }
      setLoading(false);
    });
    activityDeletePermission(activityId).then(setDeletePermission);
  }, [activityId]);

  // Schedule summary memo — must live ABOVE the `if (loading)` /
  // `if (!activity)` early returns below or React will flag a
  // hook-count change between the loading render (which doesn't
  // reach this line) and the loaded render (which does), and the
  // whole component unmounts to a blank screen. The inputs are
  // all local state with sensible initial values, so it's safe
  // to compute even before fetchActivityDetail resolves.
  const scheduleSummary = useMemo(() => buildScheduleSummary({
    schedulingMode,
    schedule,
    daysOfWeek,
    time,
    intervalWeeks,
    startDate,
    endDate,
  }), [schedulingMode, schedule, daysOfWeek, time, intervalWeeks, startDate, endDate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading activity...</p>
        </div>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Activity not found</p>
          <button
            onClick={() => navigate(`/nucleus/${nucleusId}`)}
            className="text-blue-600 hover:underline"
          >
            Back to nucleus
          </button>
        </div>
      </div>
    );
  }

  const removeParticipant = async (role: string, personId: string) => {
    try {
      await removeActivityParticipant(activityId!, personId, role);
      setParticipants(prev => ({
        ...prev,
        [role]: prev[role].filter(id => id !== personId),
      }));
    } catch (err) {
      console.error('Failed to remove participant:', err);
    }
  };

  const addParticipantToRole = async (
    role: string,
    params: { name: string; existingPersonId?: string; ageGroup?: import('../lib/database.types').AgeGroup; minorOverride?: boolean }
  ) => {
    const { personId, name } = await addPersonToActivity({
      name: params.name,
      nucleusId: nucleusId!,
      activityId: activityId!,
      role,
      existingPersonId: params.existingPersonId,
      ageGroup: params.ageGroup,
      minorOverride: params.minorOverride,
    });
    if (!params.existingPersonId) {
      markPersonUnplaced(nucleusId!, personId);
    }
    setParticipants(prev => {
      const allIds = Object.values(prev).flat();
      if (allIds.includes(personId)) return prev;
      return {
        ...prev,
        [role]: [...(prev[role] ?? []), personId],
      };
    });
    setPersonNames(prev => ({ ...prev, [personId]: name }));
  };

  const handleDelete = async () => {
    if (deleteConfirmInput !== activity.name) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteActivity(activityId!);
      navigate(`/nucleus/${nucleusId}`);
    } catch (err) {
      console.error('Failed to delete activity:', err);
      setDeleteError('Failed to delete activity. Please try again.');
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    setScheduleError(null);
    // We only need to validate schedule fields when they're actually
    // editable — for a locked (completed/cancelled) activity the
    // schedule isn't being touched, so its existing values can stay
    // as-is even if they wouldn't pass new-input validation.
    const localScheduleLocked =
      activity && (activity.lifecycle === 'completed' || activity.lifecycle === 'cancelled');
    if (!localScheduleLocked && schedulingMode === 'short_duration') {
      if (!startDate || !endDate) {
        setScheduleError('Short-duration activities need both a start and end date.');
        return;
      }
      if (new Date(endDate) < new Date(startDate)) {
        setScheduleError('End date can’t be before the start date.');
        return;
      }
    }
    try {
      // When the schedule is locked, persist only notes — the user
      // is editing the running record of a finished activity, not
      // its calendar. updateActivityDetails skips undefined keys.
      const params: Parameters<typeof updateActivityDetails>[1] = { notes };
      if (!localScheduleLocked) {
        params.schedulingMode = schedulingMode;
        params.scheduleNotes = schedulingMode === 'sporadic_ongoing' ? schedule : '';
        params.daysOfWeek = schedulingMode === 'structured_recurring' ? daysOfWeek : [];
        params.time = schedulingMode === 'structured_recurring' ? (time || null) : null;
        params.intervalWeeks = schedulingMode === 'structured_recurring' ? intervalWeeks : null;
        params.startDate =
          (schedulingMode === 'short_duration' || schedulingMode === 'structured_recurring')
            ? (startDate ? parseDateFromInput(startDate) : null)
            : null;
        params.endDate = schedulingMode === 'short_duration'
          ? (endDate ? parseDateFromInput(endDate) : null)
          : null;
      }
      await updateActivityDetails(activityId!, params);
      // Refresh the local view so the lifecycle pill / sync chip
      // reflects what's now in the DB (the sync helper may have
      // generated/refreshed a timeline_events row).
      const fresh = await fetchActivityDetail(activityId!);
      if (fresh) setActivity(fresh.activity);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      console.error('Failed to save activity:', err);
      setScheduleError(err?.message ?? 'Failed to save activity.');
    }
  };

  const handleLifecycleChange = async (next: ActivityLifecycle) => {
    if (!activity) return;
    if (next === activity.lifecycle) return;

    // Reactivation nudge. Moving an activity from a terminal state
    // (completed / cancelled) back to active or planned is a real
    // workflow — for example, finishing one cohort and starting
    // another — but the more common case is a fresh effort that
    // happens to look similar. We prompt rather than block so the
    // user can confirm intent, and the message explicitly suggests
    // creating a new activity to preserve the historical record of
    // the one being reactivated.
    const isReactivation =
      (activity.lifecycle === 'completed' || activity.lifecycle === 'cancelled')
      && (next === 'active' || next === 'planned');
    if (isReactivation) {
      const ok = window.confirm(
        `Reactivate "${activity.name}"?\n\n` +
        `This activity is currently ${activity.lifecycle}. Reactivating it ` +
        `reopens it for scheduling and puts its meetings back on the nucleus ` +
        `timeline.\n\n` +
        `If you're starting a fresh effort, the better path is usually to ` +
        `create a NEW activity — that way the record of this one stays ` +
        `intact as history. Reactivate is the right choice when you're ` +
        `genuinely continuing the same activity (e.g. it was paused, ` +
        `not really finished).`,
      );
      if (!ok) return;
    }

    setLifecycleSaving(true);
    try {
      await setActivityLifecycle(activityId!, next);
      const fresh = await fetchActivityDetail(activityId!);
      if (fresh) setActivity(fresh.activity);
    } catch (err) {
      console.error('Failed to update lifecycle:', err);
    } finally {
      setLifecycleSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    setDaysOfWeek(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort(),
    );
  };

  const expectedRoles = ROLES_FOR_TYPE[activity.type] ?? [];
  const extraRoles = Object.keys(participants).filter(r => !expectedRoles.includes(r));
  const roles = [...expectedRoles.filter(r => r in participants), ...extraRoles];

  // Schedule editing is locked while the activity is in a terminal
  // state — the user has to flip it back to active/planned (via the
  // reactivation confirm) before mode chips, day pickers, or date
  // fields can be changed. regionalOnly retains its existing
  // read-only force.
  const scheduleLocked =
    activity.lifecycle === 'completed' || activity.lifecycle === 'cancelled';
  const scheduleReadOnly = regionalOnly || scheduleLocked;

  return (
    <div className="min-h-screen bg-gray-50/50 font-sans">
      <header className="bg-white border-b border-gray-200/80 px-4 sm:px-8 py-5 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-3">
            {activityLeadOnly ? (
              <div /> /* spacer keeps GlobalSearch right-aligned */
            ) : (
              <button
                onClick={() => navigate(`/nucleus/${nucleusId}`)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <ChevronLeftIcon className="w-4 h-4" />
                Back to {nucleusName}
              </button>
            )}
            <div className="flex-1 max-w-sm">
              <GlobalSearch />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              {activity.name}
            </h1>
            {deletePermission === 'direct' && (
              <button
                onClick={() => { setDeleteConfirmInput(''); setDeleteError(null); setShowDeleteConfirm(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2Icon className="w-4 h-4" />
                Delete
              </button>
            )}
            {deletePermission === 'request' && !requestSent && (
              <button
                onClick={() => { setRequestNote(''); setRequestError(null); setShowRequest(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
              >
                <ClockIcon className="w-4 h-4" />
                Request Deletion
              </button>
            )}
            {deletePermission === 'request' && requestSent && (
              <span className="text-xs text-amber-700 font-medium">Deletion requested</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${LIFECYCLE_BADGE[activity.lifecycle]}`}
              title="Lifecycle state"
            >
              {activity.lifecycle === 'completed' && <CheckCircleIcon className="w-3.5 h-3.5" />}
              {activity.lifecycle === 'cancelled' && <XCircleIcon className="w-3.5 h-3.5" />}
              {activity.lifecycle === 'active' && <PlayCircleIcon className="w-3.5 h-3.5" />}
              {activity.lifecycle === 'planned' && <ClockIcon className="w-3.5 h-3.5" />}
              {LIFECYCLE_LABELS[activity.lifecycle]}
            </span>
            {activity.currentBook && (
              <span className="text-sm font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
                Current: {activity.currentBook}
              </span>
            )}
            {scheduleSummary && (
              <span className="text-sm font-medium text-gray-500 flex items-center gap-1.5">
                <ClockIcon className="w-3.5 h-3.5" />
                {scheduleSummary}
              </span>
            )}
          </div>
        </div>
      </header>

      {showRequest && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                <ClockIcon className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Request Activity Deletion</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              You don't have permission to delete <strong>{activity.name}</strong> directly. A coordinator will review your request.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason (optional)</label>
            <textarea
              value={requestNote}
              onChange={e => setRequestNote(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none mb-4"
              placeholder="Add context for the reviewer…"
            />
            {requestError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                <p className="text-sm text-red-700">{requestError}</p>
              </div>
            )}
            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={() => setShowRequest(false)}
                disabled={requestSubmitting}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setRequestError(null);
                  setRequestSubmitting(true);
                  try {
                    await submitPermissionRequest({
                      targetType: 'activity',
                      targetId: activityId!,
                      action: 'delete',
                      note: requestNote.trim() || undefined,
                      nucleusId: nucleusId!,
                    });
                    setRequestSent(true);
                    setShowRequest(false);
                  } catch (err: any) {
                    setRequestError(err.message ?? 'Failed to submit request');
                  } finally {
                    setRequestSubmitting(false);
                  }
                }}
                disabled={requestSubmitting}
                className="flex-1 px-4 py-2.5 bg-amber-600 text-white font-medium rounded-xl hover:bg-amber-700 shadow-sm transition-all disabled:opacity-50"
              >
                {requestSubmitting ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2Icon className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Delete Activity</h2>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              This will permanently archive <strong>{activity.name}</strong> and all its participant records. This action cannot be undone.
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Type <strong>{activity.name}</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmInput}
              onChange={e => setDeleteConfirmInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm mb-4"
              placeholder={activity.name}
              autoFocus
            />
            {deleteError && (
              <p className="text-sm text-red-600 mb-3">{deleteError}</p>
            )}
            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirmInput !== activity.name || deleting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting…' : 'Delete Activity'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto p-4 sm:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ─── Main column: participants + notes ─────────────────────────
              The "meat" of an activity is who's in it and what's being
              learned, so these get the full width on mobile and 2/3 on
              desktop. The schedule / lifecycle controls live in the
              sidebar at right, deliberately quiet. */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-5 sm:p-8">
              <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider mb-6">
                Participants by Role
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {roles.map(role => (
                  <div key={role} className="space-y-4">
                    <h3 className="font-bold text-gray-900 capitalize border-b border-gray-100 pb-3 tracking-tight">
                      {ROLE_DISPLAY[role] ?? role}
                    </h3>
                    <div className="space-y-2.5">
                      {(participants[role] ?? []).map(pid => {
                        const name = personNames[pid] ?? pid;
                        return (
                          <div
                            key={pid}
                            className="flex items-center justify-between bg-gray-50/80 border border-gray-100 px-3.5 py-2.5 rounded-xl group hover:border-blue-200 transition-colors duration-200"
                          >
                            <button
                              onClick={() => navigate(`/individual/${pid}`)}
                              className="text-sm font-semibold flex items-center gap-2 text-blue-700 hover:text-blue-900"
                            >
                              <div className="p-1 rounded-full bg-blue-100">
                                <UserIcon className="w-3 h-3" />
                              </div>
                              {name}
                            </button>
                            {!regionalOnly && (
                              <button
                                onClick={() => removeParticipant(role, pid)}
                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 hover:bg-red-50 p-1 rounded-md transition-all duration-200"
                              >
                                <XIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {!regionalOnly && (
                      <PersonNameCombobox
                        placeholder="Add name..."
                        onAdd={params => addParticipantToRole(role, params)}
                      />
                    )}
                  </div>
                ))}
              </div>

              {activity.type === 'study-circle' && activity.currentBook && (
                <div className="mt-8 pt-8 border-t border-gray-100">
                  <button className="px-5 py-2.5 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-all shadow-sm hover:shadow-md">
                    Mark Book Completed
                  </button>
                  <p className="text-sm font-medium text-gray-500 mt-2.5">
                    This will update all participants' profiles to show completion of{' '}
                    {activity.currentBook}
                  </p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-5 sm:p-8">
              <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileTextIcon className="w-4 h-4 text-gray-400" />
                Notes
              </h3>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={regionalOnly && !notes ? 'No notes for this activity.' : 'Write any notes about this activity here...'}
                readOnly={regionalOnly}
                className={`w-full min-h-[200px] px-4 py-3 border border-gray-300 rounded-xl text-sm text-gray-800 resize-y shadow-sm ${
                  regionalOnly
                    ? 'bg-gray-50 cursor-default focus:outline-none'
                    : 'focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                }`}
              />
            </div>

            {!regionalOnly && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => navigate(`/nucleus/${nucleusId}`)}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-sm hover:shadow-md"
                >
                  Save Changes
                </button>
                {saved && (
                  <span className="flex items-center gap-1.5 text-sm text-green-700 font-bold bg-green-50 px-3 py-1.5 rounded-lg">
                    <CheckIcon className="w-4 h-4" />
                    Saved!
                  </span>
                )}
                {scheduleError && (
                  <span className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">
                    {scheduleError}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ─── Sidebar: status + schedule ────────────────────────────────
              Small, quiet cards. Labels are self-explanatory; no prose
              explanations. On mobile this stack appears below the main
              column. */}
          <aside className="space-y-4">
            {/* Status */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-4">
              <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                Status
              </div>
              <div className="flex flex-wrap gap-1">
                {(['planned', 'active', 'completed', 'cancelled'] as ActivityLifecycle[]).map(state => {
                  const isCurrent = activity.lifecycle === state;
                  const baseClass = isCurrent
                    ? LIFECYCLE_BADGE[state]
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50';
                  return (
                    <button
                      key={state}
                      type="button"
                      disabled={lifecycleSaving || regionalOnly}
                      onClick={() => handleLifecycleChange(state)}
                      className={`px-2 py-1 rounded-md text-xs font-semibold border transition-colors ${baseClass} ${lifecycleSaving || regionalOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                      {LIFECYCLE_LABELS[state]}
                    </button>
                  );
                })}
              </div>
              {activity.completedAt && (
                <div className="text-[11px] text-gray-400 mt-2">
                  Changed {activity.completedAt.toLocaleDateString()}
                </div>
              )}
            </div>

            {/* Schedule — locked when the activity is in a terminal
                state. The fields stay visible (so the user can read
                what the schedule was) but become non-interactive
                and visually dimmed. */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-4">
              <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                Schedule
              </div>
              {scheduleLocked && (
                <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5 mb-3 leading-snug">
                  Locked while {activity.lifecycle}. Set status back to
                  active or planned to edit — or, ideally, create a new
                  activity so this one's record stays intact.
                </div>
              )}
              <div className={scheduleLocked ? 'opacity-60' : ''}>
                <div className="flex flex-wrap gap-1 mb-3">
                  {[
                    { value: 'structured_recurring' as const, label: 'Recurring' },
                    { value: 'sporadic_ongoing' as const, label: 'Sporadic' },
                    { value: 'short_duration' as const, label: 'Short' },
                  ].map(opt => {
                    const selected = schedulingMode === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={scheduleReadOnly}
                        onClick={() => setSchedulingMode(opt.value)}
                        className={`px-2 py-1 rounded-md text-xs font-semibold border transition-colors ${
                          selected
                            ? 'bg-blue-50 border-blue-300 text-blue-800'
                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                        } ${scheduleReadOnly ? 'cursor-not-allowed' : ''}`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {schedulingMode === 'structured_recurring' && (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap gap-1">
                      {DAY_LABELS.map((d, i) => {
                        const selected = daysOfWeek.includes(i);
                        return (
                          <button
                            key={d}
                            type="button"
                            disabled={scheduleReadOnly}
                            onClick={() => toggleDay(i)}
                            className={`w-7 h-7 rounded text-[11px] font-bold border transition-colors ${
                              selected
                                ? 'bg-blue-600 text-white border-blue-700'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-blue-200'
                            } ${scheduleReadOnly ? 'cursor-not-allowed' : ''}`}
                          >
                            {d[0]}
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="time"
                        value={time}
                        onChange={e => setTime(e.target.value)}
                        readOnly={scheduleReadOnly}
                        placeholder="Time"
                        className="px-2 py-1.5 border border-gray-200 rounded-md text-xs"
                      />
                      <select
                        value={intervalWeeks}
                        onChange={e => setIntervalWeeks(parseInt(e.target.value, 10))}
                        disabled={scheduleReadOnly}
                        className="px-2 py-1.5 border border-gray-200 rounded-md text-xs bg-white"
                      >
                        <option value={1}>Weekly</option>
                        <option value={2}>Biweekly</option>
                        <option value={4}>Monthly</option>
                      </select>
                    </div>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      readOnly={scheduleReadOnly}
                      title="Activity start date"
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-xs"
                    />
                  </div>
                )}

                {schedulingMode === 'sporadic_ongoing' && (
                  <input
                    type="text"
                    value={schedule}
                    onChange={e => setSchedule(e.target.value)}
                    placeholder="When does this happen?"
                    readOnly={scheduleReadOnly}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-xs"
                  />
                )}

                {schedulingMode === 'short_duration' && (
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      readOnly={scheduleReadOnly}
                      title="Start date"
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-xs"
                    />
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      min={startDate || undefined}
                      readOnly={scheduleReadOnly}
                      title="End date"
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-xs"
                    />
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
