import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeftIcon,
  PlusIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  UserIcon,
  BookOpenIcon,
  AwardIcon,
  CheckCircleIcon,
  CircleIcon,
  ImageIcon,
  TrendingUpIcon,
  PencilIcon,
  XIcon,
  Trash2Icon,
} from 'lucide-react';
import { ConcentricCircles } from './ConcentricCircles';
import { Activity } from '../types';
import {
  fetchNucleus,
  fetchActivitiesForNucleus,
  fetchPersonsForNucleus,
  createActivity,
  updateNucleusNotes,
  renameNucleus,
  canRenameNucleus,
  canDeleteNucleus,
  deleteNucleus,
  type NucleusDetail,
  type PersonProfile,
  type CourseRow,
} from '../lib/db/nucleus';
import { fetchCourses } from '../lib/db/clusterProfile';

const activityTypeLabels: Record<string, string> = {
  'children-class': "Children's Class",
  'junior-youth': 'Junior Youth Group',
  'study-circle': 'Study Circle',
  devotional: 'Devotional Gathering',
  other: 'Other',
};

export function NucleusDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [nucleus, setNucleus] = useState<NucleusDetail | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddActivity, setShowAddActivity] = useState(false);
  const [newActivityType, setNewActivityType] = useState<string>('children-class');
  const [newActivityName, setNewActivityName] = useState('');
  const [customTypeName, setCustomTypeName] = useState('');
  const [bannerImage, setBannerImageState] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [canRename, setCanRename] = useState(false);

  const [canDelete, setCanDelete] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetchNucleus(id),
      fetchActivitiesForNucleus(id),
      fetchPersonsForNucleus(id),
      fetchCourses(),
      canRenameNucleus(id),
      canDeleteNucleus(id),
    ]).then(([n, acts, persons, courseList, renameAllowed, deleteAllowed]) => {
      setNucleus(n);
      setActivities(acts);
      setPeople(persons);
      setCourses(courseList);
      setCanRename(renameAllowed as boolean);
      setCanDelete(deleteAllowed as boolean);
      if (n) {
        setNotes(n.notes);
        setBannerImageState(n.bannerImageUrl);
      }
      setLoading(false);
    }).catch(err => {
      console.error('Failed to load nucleus data:', err);
      setLoading(false);
    });
  }, [id]);

  const handleSaveNotes = async () => {
    try {
      await updateNucleusNotes(id!, notes);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save notes:', err);
    }
  };

  const startRenamingNucleus = () => {
    setNameInput(nucleus!.name);
    setNameError(null);
    setEditingName(true);
  };

  const handleSaveRename = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError('Name cannot be empty.');
      return;
    }
    setNameSaving(true);
    setNameError(null);
    try {
      await renameNucleus(id!, trimmed);
      setNucleus(prev => prev ? { ...prev, name: trimmed } : prev);
      setEditingName(false);
    } catch (err) {
      setNameError('Failed to rename. You may not have permission.');
    } finally {
      setNameSaving(false);
    }
  };

  const handleCancelRename = () => {
    setEditingName(false);
    setNameError(null);
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmInput !== nucleus!.name) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteNucleus(id!);
      navigate('/');
    } catch (err) {
      setDeleteError('Failed to delete nucleus. Please try again.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading nucleus...</p>
        </div>
      </div>
    );
  }

  if (!nucleus) {
    return <div className="p-8 text-gray-500">Nucleus not found.</div>;
  }

  const getActivityParticipantCount = (activity: Activity) =>
    Object.values(activity.participants).flat().length;

  const handleCreateActivity = async () => {
    const type = newActivityType as Activity['type'];
    const typeName = newActivityType === 'other' ? customTypeName : activityTypeLabels[newActivityType];
    const name = newActivityName.trim() || `${typeName} - ${nucleus.name}`;
    try {
      const newActivity = await createActivity({ nucleusId: id!, name, type });
      setActivities(prev => [...prev, newActivity]);
      setShowAddActivity(false);
      setNewActivityType('children-class');
      setNewActivityName('');
      setCustomTypeName('');
    } catch (err) {
      console.error('Failed to create activity:', err);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBannerImageState(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const allCapacities = Array.from(new Set(people.flatMap(p => p.capacities)));

  return (
    <div className="min-h-screen bg-nucleus-pattern font-sans">
      <header
        className="relative bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 sm:px-8 py-5 sm:py-8 shadow-sm overflow-hidden"
        style={
          bannerImage
            ? {
                backgroundImage: `linear-gradient(to bottom, rgba(255,255,255,0.8), rgba(255,255,255,0.95)), url(${bannerImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : {}
        }
      >
        <div className="max-w-[1600px] mx-auto flex flex-col relative z-10">
          <div className="flex justify-between items-start mb-4">
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors bg-white/50 px-3 py-1.5 rounded-lg backdrop-blur-sm"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              Back to Cluster Map
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(`/nucleus/${id}/growth-report`)}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50/80 hover:bg-emerald-100 text-sm font-medium text-emerald-700 rounded-lg border border-emerald-200 shadow-sm transition-all backdrop-blur-sm"
              >
                <TrendingUpIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Growth Report</span>
              </button>
              <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-white/80 hover:bg-white text-sm font-medium text-gray-700 rounded-lg border border-gray-200 shadow-sm transition-all backdrop-blur-sm">
                <ImageIcon className="w-4 h-4 text-gray-500" />
                <span className="hidden sm:inline">
                  {bannerImage ? 'Change Cover' : 'Add Cover Photo'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
              {canDelete && (
                <button
                  onClick={() => { setDeleteConfirmInput(''); setDeleteError(null); setShowDeleteConfirm(true); }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-50/80 hover:bg-red-100 text-sm font-medium text-red-600 rounded-lg border border-red-200 shadow-sm transition-all backdrop-blur-sm"
                  title="Delete nucleus"
                >
                  <Trash2Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">Delete</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-md">
              <CircleIcon className="w-6 h-6" />
            </div>
            <div>
              {editingName ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveRename(); else if (e.key === 'Escape') handleCancelRename(); }}
                      className="text-2xl font-bold text-gray-900 tracking-tight border-b-2 border-blue-500 bg-transparent focus:outline-none w-64"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveRename}
                      disabled={nameSaving}
                      className="px-3 py-1 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {nameSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={handleCancelRename}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                  {nameError && <p className="text-xs text-red-600">{nameError}</p>}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                    {nucleus.name}
                  </h1>
                  {canRename && (
                    <button
                      onClick={startRenamingNucleus}
                      title="Rename nucleus"
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
              <p className="text-sm font-medium text-gray-600 mt-1">
                Nucleus Reporting Form
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto p-4 sm:p-8 space-y-6 sm:space-y-8">
        {/* Top Row: Activities & Concentric Circles */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Activities Panel */}
          <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-7 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-1.5 tracking-tight">
                Core and Other Activities
              </h2>
              <p className="text-sm text-gray-500">
                List of core and other activities that have been in the{' '}
                <em className="text-gray-600">nucleus</em>.
              </p>
            </div>

            <div className="border border-gray-200/80 rounded-xl overflow-hidden mb-5 bg-white shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200/80">
                    <th className="py-3 sm:py-3.5 px-3 sm:px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Activity
                    </th>
                    <th className="py-3 sm:py-3.5 px-3 sm:px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell border-l border-gray-200/80">
                      Participants
                    </th>
                    <th className="py-3 sm:py-3.5 px-3 sm:px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                      <span className="hidden sm:inline">
                        <MoreHorizontalIcon className="w-5 h-5 inline-block text-gray-400" />
                      </span>
                      <span className="sm:hidden text-gray-400">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((activity, index) => (
                    <tr
                      key={activity.id}
                      onClick={() => navigate(`/nucleus/${id}/activity/${activity.id}`)}
                      className={`border-b border-gray-200/80 last:border-b-0 hover:bg-blue-50/50 transition-colors duration-200 cursor-pointer sm:cursor-default ${index % 2 === 1 ? 'bg-gray-50/30' : ''}`}
                    >
                      <td className="py-3 sm:py-4 px-3 sm:px-5 text-sm font-medium text-gray-900">
                        <div>{activity.name}</div>
                        {activity.schedule && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {activity.schedule}
                          </div>
                        )}
                        <div className="sm:hidden text-xs text-gray-500 mt-0.5">
                          {getActivityParticipantCount(activity)} participants
                        </div>
                      </td>
                      <td className="py-3 sm:py-4 px-3 sm:px-5 text-sm text-gray-600 hidden sm:table-cell border-l border-gray-200/80">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-100 text-gray-700 font-medium">
                          <UserIcon className="w-3.5 h-3.5 opacity-70" />
                          {getActivityParticipantCount(activity)}
                        </span>
                      </td>
                      <td
                        className="py-3 sm:py-4 px-3 sm:px-5 text-right"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-2 sm:gap-3">
                          <button
                            onClick={() => navigate(`/nucleus/${id}/activity/${activity.id}`)}
                            className="text-blue-600 hover:text-blue-800 text-xs sm:text-sm font-semibold transition-colors"
                          >
                            Manage
                          </button>
                          <button
                            onClick={() => navigate(`/nucleus/${id}/activity/${activity.id}`)}
                            className="w-7 h-7 bg-blue-50 text-blue-600 rounded-lg items-center justify-center hover:bg-blue-600 hover:text-white transition-all duration-200 shadow-sm hidden sm:flex"
                          >
                            <ChevronRightIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {activities.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="py-10 text-center text-gray-400 italic text-sm"
                      >
                        No activities yet. Add one below.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => setShowAddActivity(true)}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2 text-sm font-semibold"
            >
              <PlusIcon className="w-4 h-4" />
              Add New Activity
            </button>
          </div>

          {/* Concentric Circles Panel */}
          <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-7 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-1.5 tracking-tight">
                Overall Participation
              </h2>
              <p className="text-sm text-gray-500">
                Drag and drop names between circles to update engagement levels.
              </p>
            </div>
            <ConcentricCircles nucleusId={id!} />
          </div>
        </div>

        {/* Nucleus Notes */}
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-5 sm:p-7 shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-gray-900 mb-1.5 tracking-tight">
              Nucleus Notes
            </h2>
            <p className="text-sm text-gray-500">
              General notes, reflections, and observations about this nucleus.
            </p>
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Write any notes about this nucleus here..."
            className="w-full min-h-[120px] px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y shadow-sm"
          />
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={handleSaveNotes}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-sm hover:shadow-md"
            >
              Save Notes
            </button>
            {notesSaved && (
              <span className="flex items-center gap-1.5 text-sm text-green-700 font-bold bg-green-50 px-3 py-1.5 rounded-lg">
                <CheckCircleIcon className="w-4 h-4" />
                Saved!
              </span>
            )}
          </div>
        </div>

        {/* Community Profile */}
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-7 shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-1.5 tracking-tight">
              Community Profile
            </h2>
            <p className="text-sm text-gray-500">
              Educational progress and capacities of individuals in this nucleus.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* Ruhi Books */}
            <div>
              <h3 className="text-xs font-bold text-gray-500 mb-5 flex items-center gap-2 uppercase tracking-widest">
                <BookOpenIcon className="w-4 h-4 text-blue-500" />
                Ruhi Institute Progress
              </h3>
              <div className="space-y-4">
                {courses.map(course => {
                  const completed = people.filter(p =>
                    p.courseEnrollments.some(
                      ce => ce.courseId === course.id && ce.status === 'completed'
                    )
                  );
                  const inProgress = people.filter(p =>
                    p.courseEnrollments.some(
                      ce => ce.courseId === course.id && ce.status === 'in_progress'
                    )
                  );
                  if (completed.length === 0 && inProgress.length === 0) return null;
                  return (
                    <div
                      key={course.id}
                      className="bg-white border border-gray-200/80 rounded-xl p-5 shadow-sm hover:border-blue-200 transition-colors duration-200"
                    >
                      <h4 className="font-semibold text-gray-900 text-sm mb-4">
                        {course.name}
                      </h4>
                      <div className="space-y-3">
                        {completed.length > 0 && (
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 bg-green-100 p-1 rounded-full">
                              <CheckCircleIcon className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {completed.map(p => (
                                <button
                                  key={p.id}
                                  onClick={() => navigate(`/individual/${p.id}`)}
                                  className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200/60 text-xs font-semibold rounded-md hover:bg-green-100 hover:border-green-300 transition-all duration-200"
                                >
                                  {p.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {inProgress.length > 0 && (
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 bg-blue-100 p-1 rounded-full">
                              <CircleIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {inProgress.map(p => (
                                <button
                                  key={p.id}
                                  onClick={() => navigate(`/individual/${p.id}`)}
                                  className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200/60 text-xs font-semibold rounded-md hover:bg-blue-100 hover:border-blue-300 transition-all duration-200"
                                >
                                  {p.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {people.every(p => p.courseEnrollments.length === 0) && (
                  <p className="text-sm text-gray-500 italic">
                    No course progress recorded yet.
                  </p>
                )}
              </div>
            </div>

            {/* Capacities */}
            <div>
              <h3 className="text-xs font-bold text-gray-500 mb-5 flex items-center gap-2 uppercase tracking-widest">
                <AwardIcon className="w-4 h-4 text-amber-500" />
                Capacities
              </h3>
              <div className="space-y-4">
                {allCapacities.map(capacity => {
                  const capablePeople = people.filter(p => p.capacities.includes(capacity));
                  return (
                    <div
                      key={capacity}
                      className="bg-white border border-gray-200/80 rounded-xl p-5 shadow-sm hover:border-amber-200 transition-colors duration-200"
                    >
                      <h4 className="font-semibold text-gray-900 text-sm mb-4">
                        {capacity}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {capablePeople.map(p => (
                          <button
                            key={p.id}
                            onClick={() => navigate(`/individual/${p.id}`)}
                            className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200/60 text-xs font-semibold rounded-md hover:bg-amber-100 hover:border-amber-300 transition-all duration-200"
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {allCapacities.length === 0 && (
                  <p className="text-sm text-gray-500 italic">
                    No capacities recorded yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Nucleus Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2Icon className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Delete Nucleus</h2>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              This will permanently archive <strong>{nucleus!.name}</strong> and all its activities and enrollments. This action cannot be undone.
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Type <strong>{nucleus!.name}</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmInput}
              onChange={e => setDeleteConfirmInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm mb-4"
              placeholder={nucleus!.name}
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
                onClick={handleConfirmDelete}
                disabled={deleteConfirmInput !== nucleus!.name || deleting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting…' : 'Delete Nucleus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Activity Modal */}
      {showAddActivity && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold text-gray-900 mb-5">
              Add New Activity
            </h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Choose activity type
                </label>
                <div className="space-y-2">
                  {[
                    { value: 'children-class', label: "Children's Class" },
                    { value: 'junior-youth', label: 'Junior Youth Group' },
                    { value: 'study-circle', label: 'Study Circle' },
                    { value: 'devotional', label: 'Devotional Gathering' },
                    { value: 'other', label: 'Other' },
                  ].map(option => (
                    <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="activity-type"
                        value={option.value}
                        checked={newActivityType === option.value}
                        onChange={e => setNewActivityType(e.target.value)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-gray-700">{option.label}</span>
                    </label>
                  ))}
                </div>
                {newActivityType === 'other' && (
                  <input
                    type="text"
                    value={customTypeName}
                    onChange={e => setCustomTypeName(e.target.value)}
                    className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="If Other, enter activity name"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Activity Name (optional)
                </label>
                <input
                  type="text"
                  value={newActivityName}
                  onChange={e => setNewActivityName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={`e.g. Children's Class - ${nucleus.name}`}
                />
              </div>
              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => {
                    setShowAddActivity(false);
                    setNewActivityType('children-class');
                    setNewActivityName('');
                    setCustomTypeName('');
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateActivity}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 shadow-sm hover:shadow transition-all"
                >
                  Save Activity
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
