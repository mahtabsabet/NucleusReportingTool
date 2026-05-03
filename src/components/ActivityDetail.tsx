import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeftIcon,
  XIcon,
  CheckIcon,
  UserIcon,
  ClockIcon,
  FileTextIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  fetchActivityDetail,
  addPersonToActivity,
  removeActivityParticipant,
  updateActivityDetails,
  canDeleteActivity,
  deleteActivity,
} from '../lib/db/nucleus';
import { markPersonUnplaced } from '../lib/unplacedTracker';
import { Activity } from '../types';
import { PersonNameCombobox } from './PersonNameCombobox';

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
  const [canDelete, setCanDelete] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    canDeleteActivity(activityId).then(setCanDelete);
  }, [activityId]);

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
    params: { name: string; existingPersonId?: string }
  ) => {
    const { personId, name } = await addPersonToActivity({
      name: params.name,
      nucleusId: nucleusId!,
      activityId: activityId!,
      role,
      existingPersonId: params.existingPersonId,
    });
    markPersonUnplaced(nucleusId!, personId);
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
    try {
      await updateActivityDetails(activityId!, {
        scheduleNotes: schedule,
        notes,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save activity:', err);
    }
  };

  const expectedRoles = ROLES_FOR_TYPE[activity.type] ?? [];
  const extraRoles = Object.keys(participants).filter(r => !expectedRoles.includes(r));
  const roles = [...expectedRoles.filter(r => r in participants), ...extraRoles];

  return (
    <div className="min-h-screen bg-gray-50/50 font-sans">
      <header className="bg-white border-b border-gray-200/80 px-4 sm:px-8 py-5 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => navigate(`/nucleus/${nucleusId}`)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 mb-3 transition-colors"
          >
            <ChevronLeftIcon className="w-4 h-4" />
            Back to {nucleusName}
          </button>
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              {activity.name}
            </h1>
            {canDelete && (
              <button
                onClick={() => { setDeleteConfirmInput(''); setDeleteError(null); setShowDeleteConfirm(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2Icon className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
          {activity.currentBook && (
            <p className="text-sm font-medium text-blue-600 mt-1.5 bg-blue-50 inline-block px-2.5 py-1 rounded-md">
              Current: {activity.currentBook}
            </p>
          )}
          {activity.schedule && (
            <p className="text-sm font-medium text-gray-500 mt-1.5 flex items-center gap-1.5">
              <ClockIcon className="w-3.5 h-3.5" />
              {activity.schedule}
            </p>
          )}
        </div>
      </header>

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

      <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-6">
        {/* Schedule & Notes */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-5 sm:p-8 space-y-6">
          <div>
            <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
              <ClockIcon className="w-4 h-4 text-gray-400" />
              Schedule
            </h3>
            <input
              type="text"
              value={schedule}
              onChange={e => setSchedule(e.target.value)}
              placeholder="e.g. Saturdays at 10:00 AM, Every other Tuesday at 7 PM, Bi-weekly..."
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium shadow-sm"
            />
          </div>

          <div>
            <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
              <FileTextIcon className="w-4 h-4 text-gray-400" />
              Notes
            </h3>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Write any notes about this activity here..."
              className="w-full min-h-[120px] px-4 py-3 border border-gray-300 rounded-xl text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y shadow-sm"
            />
          </div>
        </div>

        {/* Participants */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-5 sm:p-8">
          <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider mb-6">
            Participants by Role
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
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
                        <button
                          onClick={() => removeParticipant(role, pid)}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 hover:bg-red-50 p-1 rounded-md transition-all duration-200"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <PersonNameCombobox
                  placeholder="Add name..."
                  onAdd={params => addParticipantToRole(role, params)}
                />
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

          <div className="flex items-center gap-3 mt-8 pt-8 border-t border-gray-100">
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
          </div>
        </div>
      </div>
    </div>
  );
}
