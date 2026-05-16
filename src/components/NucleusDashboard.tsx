import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeftIcon,
  PlusIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  MoreVerticalIcon,
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
  LayoutDashboardIcon,
  TargetIcon,
  NetworkIcon,
  ListIcon,
  BarChart3Icon,
  FileTextIcon,
  InfoIcon,
} from 'lucide-react';
import { ConcentricCircles } from './ConcentricCircles';
import { CompressedTimelineStrip } from './CompressedTimelineStrip';
import { InNucleusNetworkView } from './InNucleusNetworkView';
import { GlobalSearch } from './GlobalSearch';
import { AccountMenu } from './AccountMenu';
import { CurriculumProgressSummary } from './CurriculumProgressSummary';
import { Activity, ActivitySchedulingMode } from '../types';
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
import { getCallerContext } from '../lib/db/users';
import {
  actionPermission,
  collaboratorNucleusIds,
  isClusterCoordinator,
  isRegionalOnly,
} from '../lib/permissions';

const activityTypeLabels: Record<string, string> = {
  'children-class': "Children's Class",
  'junior-youth': 'Junior Youth Group',
  'study-circle': 'Study Circle',
  devotional: 'Devotional Gathering',
  other: 'Other',
};

type FocusedModule = 'circles' | 'network' | 'activities' | 'capacities' | 'notes';

const MODULES: { id: FocusedModule; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'circles', label: 'Circles', Icon: TargetIcon },
  { id: 'network', label: 'Network', Icon: NetworkIcon },
  { id: 'activities', label: 'Activities', Icon: ListIcon },
  { id: 'capacities', label: 'Capacities', Icon: BarChart3Icon },
  { id: 'notes', label: 'Notes', Icon: FileTextIcon },
];

export function NucleusDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [nucleus, setNucleus] = useState<NucleusDetail | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusedModule, setFocusedModule] = useState<FocusedModule | null>(null);

  const [showAddActivity, setShowAddActivity] = useState(false);
  const [newActivityType, setNewActivityType] = useState<string>('children-class');
  const [newActivityName, setNewActivityName] = useState('');
  const [customTypeName, setCustomTypeName] = useState('');
  // Scheduling mode picker — the user explicitly opts into a mode
  // because, per the spec, activity *type* doesn't determine
  // scheduling (a study circle can be either recurring or short-
  // duration). We default to "structured recurring" because the
  // bulk of nucleus activities fit that pattern, but the picker
  // makes the choice deliberate.
  const [newSchedulingMode, setNewSchedulingMode] =
    useState<ActivitySchedulingMode>('structured_recurring');
  const [newScheduleNotes, setNewScheduleNotes] = useState('');
  const [newDaysOfWeek, setNewDaysOfWeek] = useState<number[]>([]);
  const [newTime, setNewTime] = useState('');
  const [newIntervalWeeks, setNewIntervalWeeks] = useState<number>(1);
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [addActivityError, setAddActivityError] = useState<string | null>(null);
  const [bannerImage, setBannerImageState] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [canRename, setCanRename] = useState(false);

  const [canDelete, setCanDelete] = useState(false);
  const [regionalOnly, setRegionalOnly] = useState(false);
  // Nucleus-Collaborator-only users are pinned to this nucleus by the
  // route guard in App.tsx, so the "Back to Cluster Map" link would
  // point them at a page they're not allowed to see. Hide it for them.
  const [nucleusCollaboratorOnly, setNucleusCollaboratorOnly] = useState(false);
  const [canCreateActivity, setCanCreateActivity] = useState(false);
  const [canEditCircles, setCanEditCircles] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    // Each fetch is isolated so a single failure (e.g. activities
    // SELECT errors because a pending migration hasn't been
    // applied) can't prevent the rest of the dashboard from
    // rendering — and, critically, can't blank `nucleus` and
    // trigger the "Nucleus not found" branch when the nucleus row
    // itself loaded fine.
    const safe = <T,>(p: Promise<T>, fallback: T, label: string): Promise<T> =>
      p.catch(err => {
        console.error(`Failed to load ${label}:`, err);
        return fallback;
      });

    Promise.all([
      safe(fetchNucleus(id), null, 'nucleus'),
      safe(fetchActivitiesForNucleus(id), [] as Activity[], 'activities'),
      safe(fetchPersonsForNucleus(id), [] as PersonProfile[], 'persons'),
      safe(fetchCourses(), [] as CourseRow[], 'courses'),
      safe(canRenameNucleus(id), false, 'rename permission'),
      safe(canDeleteNucleus(id), false, 'delete permission'),
      safe(getCallerContext(), null, 'caller context'),
    ]).then(([n, acts, persons, courseList, renameAllowed, deleteAllowed, ctx]) => {
      const target = { nucleusId: id, clusterId: n?.clusterId ?? null };
      setRegionalOnly(ctx ? isRegionalOnly(ctx) : false);
      setNucleusCollaboratorOnly(
        !!ctx
        && !ctx.isSuperAdmin && !ctx.isAdmin && !ctx.isRegionalViewer
        && !isClusterCoordinator(ctx)
        && collaboratorNucleusIds(ctx).length === 1,
      );
      setCanCreateActivity(ctx ? actionPermission(ctx, 'create_activity', target) === 'direct' : false);
      setCanEditCircles(ctx ? actionPermission(ctx, 'edit_concentric_circles', target) === 'direct' : false);
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

  const resetAddActivityForm = () => {
    setNewActivityType('children-class');
    setNewActivityName('');
    setCustomTypeName('');
    setNewSchedulingMode('structured_recurring');
    setNewScheduleNotes('');
    setNewDaysOfWeek([]);
    setNewTime('');
    setNewIntervalWeeks(1);
    setNewStartDate('');
    setNewEndDate('');
    setAddActivityError(null);
  };

  const handleCreateActivity = async () => {
    setAddActivityError(null);
    const type = newActivityType as Activity['type'];
    const typeName = newActivityType === 'other' ? customTypeName : activityTypeLabels[newActivityType];
    const name = newActivityName.trim() || `${typeName} - ${nucleus.name}`;

    // Per the spec, the mode picker drives which fields are
    // required — short-duration must have explicit dates so the
    // timeline can render a bar, structured recurring needs at
    // least one day-of-week so the schedule reads meaningfully,
    // and sporadic_ongoing has no hard requirements.
    if (newSchedulingMode === 'short_duration') {
      if (!newStartDate || !newEndDate) {
        setAddActivityError('Short-duration activities need both a start and end date.');
        return;
      }
      if (new Date(newEndDate) < new Date(newStartDate)) {
        setAddActivityError('End date can’t be before the start date.');
        return;
      }
    }
    if (newSchedulingMode === 'structured_recurring' && newDaysOfWeek.length === 0) {
      setAddActivityError('Pick at least one day of the week, or switch to "Sporadic" if the schedule is irregular.');
      return;
    }

    try {
      const newActivity = await createActivity({
        nucleusId: id!,
        name,
        type,
        schedulingMode: newSchedulingMode,
        schedule: newSchedulingMode === 'sporadic_ongoing' ? newScheduleNotes.trim() || undefined : undefined,
        daysOfWeek: newSchedulingMode === 'structured_recurring' && newDaysOfWeek.length > 0 ? newDaysOfWeek : undefined,
        time: newSchedulingMode === 'structured_recurring' ? newTime || undefined : undefined,
        intervalWeeks: newSchedulingMode === 'structured_recurring' ? newIntervalWeeks : undefined,
        startDate: newSchedulingMode === 'short_duration' || (newSchedulingMode === 'structured_recurring' && newStartDate)
          ? new Date(newStartDate)
          : undefined,
        endDate: newSchedulingMode === 'short_duration' ? new Date(newEndDate) : undefined,
      });
      setActivities(prev => [...prev, newActivity]);
      setShowAddActivity(false);
      resetAddActivityForm();
    } catch (err: any) {
      console.error('Failed to create activity:', err);
      setAddActivityError(err?.message ?? 'Failed to create activity.');
    }
  };

  const toggleNewDay = (day: number) => {
    setNewDaysOfWeek(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort(),
    );
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

  const topCapacities = allCapacities
    .map(cap => ({ name: cap, count: people.filter(p => p.capacities.includes(cap)).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topRuhiBooks = courses
    .filter(course => course.stream === 'ruhi_main')
    .map(course => ({
      name: course.shortName || course.name,
      completed: people.filter(p =>
        p.courseEnrollments.some(ce => ce.courseId === course.id && ce.status === 'completed')
      ).length,
    }))
    .filter(b => b.completed > 0)
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 4);

  const cardBase =
    'bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-blue-200 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group flex flex-col gap-3';

  const cardHeader = (title: string, subtitle: string) => (
    <div className="flex justify-between items-start">
      <div>
        <h2 className="text-base font-bold text-gray-900 tracking-tight">{title}</h2>
        <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
      </div>
      <ChevronRightIcon className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors flex-shrink-0 mt-0.5" />
    </div>
  );

  const panelBase =
    'bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-7 shadow-sm';

  const backToDashboard = (
    <div className="flex justify-end mt-6 pt-4 border-t border-gray-100">
      <button
        onClick={() => setFocusedModule(null)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
      >
        <LayoutDashboardIcon className="w-4 h-4" />
        Back to dashboard view
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-nucleus-pattern font-sans">
      {/* Compact header — single row: back link · nucleus name + menu · search · account */}
      <header
        className="relative z-40 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 sm:px-6 py-2.5 shadow-sm"
        style={
          bannerImage
            ? {
                backgroundImage: `linear-gradient(to bottom, rgba(255,255,255,0.85), rgba(255,255,255,0.95)), url(${bannerImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : {}
        }
      >
        <div className="max-w-[1600px] mx-auto flex items-center gap-3 sm:gap-4 relative z-10">
          {!nucleusCollaboratorOnly && (
            <>
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors bg-white/50 px-2.5 py-1.5 rounded-lg backdrop-blur-sm flex-shrink-0"
              >
                <ChevronLeftIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Cluster Map</span>
              </button>

              <div className="h-6 w-px bg-gray-300/70 hidden sm:block" />
            </>
          )}

          <div className="flex items-center gap-2 min-w-0 flex-shrink">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
              <CircleIcon className="w-4 h-4" />
            </div>
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveRename(); else if (e.key === 'Escape') handleCancelRename(); }}
                  className="text-lg font-bold text-gray-900 tracking-tight border-b-2 border-blue-500 bg-transparent focus:outline-none w-44"
                  autoFocus
                />
                <button
                  onClick={handleSaveRename}
                  disabled={nameSaving}
                  className="px-2 py-0.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {nameSaving ? '…' : 'Save'}
                </button>
                <button
                  onClick={handleCancelRename}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
                {nameError && <p className="text-xs text-red-600 ml-1">{nameError}</p>}
              </div>
            ) : (
              <>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight truncate">
                  {nucleus.name}
                </h1>
                {(canRename || canDelete) && (
                  <div className="relative flex-shrink-0">
                    <button
                      ref={menuButtonRef}
                      onClick={() => setMenuOpen(o => !o)}
                      title="Nucleus options"
                      aria-label="Nucleus options"
                      className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-all"
                    >
                      <MoreVerticalIcon className="w-4 h-4" />
                    </button>
                    {menuOpen && (
                      <div
                        ref={menuRef}
                        className="absolute left-0 mt-1 w-56 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-50"
                      >
                        {canRename && (
                          <button
                            onClick={() => { setMenuOpen(false); startRenamingNucleus(); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <PencilIcon className="w-4 h-4 text-gray-400" />
                            Rename nucleus
                          </button>
                        )}
                        {canRename && (
                          <button
                            onClick={() => { setMenuOpen(false); coverInputRef.current?.click(); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <ImageIcon className="w-4 h-4 text-gray-400" />
                            {bannerImage ? 'Change cover photo' : 'Add cover photo'}
                          </button>
                        )}
                        {canDelete && (
                          <>
                            <div className="my-1 border-t border-gray-100" />
                            <button
                              onClick={() => {
                                setMenuOpen(false);
                                setDeleteConfirmInput('');
                                setDeleteError(null);
                                setShowDeleteConfirm(true);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2Icon className="w-4 h-4" />
                              Delete nucleus
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="hidden md:block flex-1 min-w-0 max-w-xl mx-auto">
            <GlobalSearch />
          </div>

          <div className="flex-shrink-0">
            <AccountMenu inline buttonClassName="w-9 h-9 rounded-full bg-white shadow-sm border border-gray-200 flex items-center justify-center text-sm font-bold text-gray-700 hover:shadow-md hover:border-gray-300 transition-all overflow-hidden" />
          </div>
        </div>
      </header>

      <div className="md:hidden bg-white/90 border-b border-gray-200/80 px-4 py-2">
        <GlobalSearch />
      </div>

      {/* Main content */}
      <div className="max-w-[1600px] mx-auto p-4 sm:p-8">

        {/* ── FOCUS STATE: icon rail + expanded module ─────────────────────── */}
        {focusedModule !== null && (
          <div className="module-fade-in flex gap-4 items-start">

            {/* Vertical icon rail */}
            <div className="sticky top-4 w-[72px] flex-shrink-0 bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl py-3 flex flex-col items-center gap-1 shadow-sm">
              <button
                onClick={() => setFocusedModule(null)}
                className="w-full flex flex-col items-center gap-1 py-3 px-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all duration-200 rounded-xl"
                title="Back to Dashboard"
              >
                <LayoutDashboardIcon className="w-5 h-5" />
                <span className="text-[9px] font-medium text-center leading-tight">Dashboard</span>
              </button>

              <div className="w-10 border-t border-gray-100 my-1" />

              {MODULES.map(m => (
                <button
                  key={m.id}
                  onClick={() => setFocusedModule(m.id)}
                  className={`w-full flex flex-col items-center gap-1 py-3 px-1 rounded-xl transition-all duration-200 ${
                    focusedModule === m.id
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                  }`}
                  title={m.label}
                >
                  <m.Icon className="w-5 h-5" />
                  <span className="text-[9px] font-medium text-center leading-tight">{m.label}</span>
                </button>
              ))}

              <div className="w-10 border-t border-gray-100 my-1" />

              <button
                onClick={() => navigate(`/nucleus/${id}/growth-report`)}
                className="w-full flex flex-col items-center gap-1 py-3 px-1 rounded-xl text-emerald-600 hover:bg-emerald-50 transition-all duration-200"
                title="Growth Report"
              >
                <TrendingUpIcon className="w-5 h-5" />
                <span className="text-[9px] font-medium text-center leading-tight">Growth</span>
              </button>
            </div>

            {/* Expanded module — key triggers fade-in on every module switch */}
            <div key={focusedModule} className="module-fade-in flex-1 min-w-0">

              {/* ── CIRCLES focused ── */}
              {focusedModule === 'circles' && (
                <div className={panelBase}>
                  <div className="mb-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-1.5 tracking-tight">Overall Participation</h2>
                    <p className="text-sm text-gray-500">
                      {regionalOnly
                        ? 'View engagement levels of participants across this nucleus.'
                        : 'Drag and drop names between circles to update engagement levels.'}
                    </p>
                  </div>
                  <ConcentricCircles nucleusId={id!} canEdit={canEditCircles} />
                  {backToDashboard}
                </div>
              )}

              {/* ── NETWORK focused ── */}
              {focusedModule === 'network' && (
                <div className={panelBase}>
                  <div className="mb-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-1.5 tracking-tight">Network View</h2>
                    <p className="text-sm text-gray-500">Visual overview of connections within this nucleus.</p>
                  </div>
                  <InNucleusNetworkView nucleusId={id!} canEdit={canEditCircles} />
                  {backToDashboard}
                </div>
              )}

              {/* ── ACTIVITIES focused ── */}
              {focusedModule === 'activities' && (
                <div className={panelBase}>
                  <div className="mb-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-1.5 tracking-tight">Core and Other Activities</h2>
                    <p className="text-sm text-gray-500">
                      List of core and other activities that have been in the{' '}
                      <em className="text-gray-600">nucleus</em>.
                    </p>
                  </div>

                  <div className="border border-gray-200/80 rounded-xl overflow-hidden mb-5 bg-white shadow-sm">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50/80 border-b border-gray-200/80">
                          <th className="py-3 sm:py-3.5 px-3 sm:px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Activity</th>
                          <th className="py-3 sm:py-3.5 px-3 sm:px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell border-l border-gray-200/80">Participants</th>
                          <th className="py-3 sm:py-3.5 px-3 sm:px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                            <MoreHorizontalIcon className="w-5 h-5 inline-block text-gray-400" />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {activities.map((activity, index) => {
                          const lifecycleLabel =
                            activity.lifecycle === 'completed'
                              ? 'Completed'
                              : activity.lifecycle === 'cancelled'
                                ? 'Cancelled'
                                : activity.lifecycle === 'planned'
                                  ? 'Planned'
                                  : null;
                          // Completed/cancelled rows visually de-emphasize but
                          // stay in the table so the historical record is
                          // preserved — the spec calls this out explicitly.
                          const lifecycleClass =
                            activity.lifecycle === 'completed' || activity.lifecycle === 'cancelled'
                              ? 'opacity-70'
                              : '';
                          return (
                          <tr
                            key={activity.id}
                            onClick={() => navigate(`/nucleus/${id}/activity/${activity.id}`)}
                            className={`border-b border-gray-200/80 last:border-b-0 hover:bg-blue-50/50 transition-colors duration-200 cursor-pointer ${index % 2 === 1 ? 'bg-gray-50/30' : ''} ${lifecycleClass}`}
                          >
                            <td className="py-3 sm:py-4 px-3 sm:px-5 text-sm font-medium text-gray-900">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span>{activity.name}</span>
                                {lifecycleLabel && (
                                  <span
                                    className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                                      activity.lifecycle === 'completed'
                                        ? 'bg-gray-200 text-gray-700'
                                        : activity.lifecycle === 'cancelled'
                                          ? 'bg-rose-100 text-rose-700'
                                          : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {lifecycleLabel}
                                  </span>
                                )}
                              </div>
                              {activity.schedule && (
                                <div className="text-xs text-gray-500 mt-0.5">{activity.schedule}</div>
                              )}
                            </td>
                            <td className="py-3 sm:py-4 px-3 sm:px-5 text-sm text-gray-600 hidden sm:table-cell border-l border-gray-200/80">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-100 text-gray-700 font-medium">
                                <UserIcon className="w-3.5 h-3.5 opacity-70" />
                                {getActivityParticipantCount(activity)}
                              </span>
                            </td>
                            <td className="py-3 sm:py-4 px-3 sm:px-5 text-right" onClick={e => e.stopPropagation()}>
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
                          );
                        })}
                        {activities.length === 0 && (
                          <tr>
                            <td colSpan={3} className="py-10 text-center text-gray-400 italic text-sm">
                              {canCreateActivity ? 'No activities yet. Add one below.' : 'No activities yet.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {canCreateActivity && (
                    <button
                      onClick={() => setShowAddActivity(true)}
                      className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2 text-sm font-semibold"
                    >
                      <PlusIcon className="w-4 h-4" />
                      Add New Activity
                    </button>
                  )}
                  {backToDashboard}
                </div>
              )}

              {/* ── CAPACITIES focused ── */}
              {focusedModule === 'capacities' && (
                <div className={panelBase}>
                  <div className="mb-8">
                    <h2 className="text-xl font-bold text-gray-900 mb-1.5 tracking-tight">Community Profile</h2>
                    <p className="text-sm text-gray-500">
                      Educational progress and capacities of individuals in this nucleus.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    {/* Curriculum progress */}
                    <div>
                      <h3 className="text-xs font-bold text-gray-500 mb-5 flex items-center gap-2 uppercase tracking-widest">
                        <BookOpenIcon className="w-4 h-4 text-blue-500" />
                        Curriculum Progress
                      </h3>
                      <CurriculumProgressSummary
                        courses={courses}
                        people={people}
                        onPersonClick={pid => navigate(`/individual/${pid}`)}
                        emptyLabel="No course progress recorded yet."
                      />
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
                            <div key={capacity} className="bg-white border border-gray-200/80 rounded-xl p-5 shadow-sm hover:border-amber-200 transition-colors duration-200">
                              <h4 className="font-semibold text-gray-900 text-sm mb-4">{capacity}</h4>
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
                          <p className="text-sm text-gray-500 italic">No capacities recorded yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                  {backToDashboard}
                </div>
              )}

              {/* ── NOTES focused ── */}
              {focusedModule === 'notes' && (
                <div className={panelBase}>
                  <div className="mb-4">
                    <h2 className="text-xl font-bold text-gray-900 mb-1.5 tracking-tight">Nucleus Notes</h2>
                    <p className="text-sm text-gray-500">
                      General notes, reflections, and observations about this nucleus.
                    </p>
                  </div>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Write any notes about this nucleus here..."
                    className="w-full min-h-[240px] px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y shadow-sm"
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
                  {backToDashboard}
                </div>
              )}

            </div>
          </div>
        )}

        {/* ── DASHBOARD STATE: grid of compact cards ───────────────────────── */}
        {focusedModule === null && (
          <div className="module-fade-in space-y-6">
            {/* Compressed timeline strip — ambient temporal context
                that lives outside the card grid so it doesn't compete
                with the modules for visual weight. */}
            <CompressedTimelineStrip
              nucleusId={id!}
              onOpen={() => navigate(`/nucleus/${id}/timeline`)}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

              {/* Activities card */}
              <div className={cardBase} onClick={() => setFocusedModule('activities')}>
                {cardHeader('Core and Other Activities', 'Manage activities and participation.')}
                <div className="border border-gray-100 rounded-xl overflow-hidden bg-white flex-1">
                  <table className="w-full text-left border-collapse">
                    <tbody>
                      {activities.slice(0, 4).map((activity, index) => (
                        <tr
                          key={activity.id}
                          className={`border-b border-gray-100 last:border-0 ${index % 2 === 1 ? 'bg-gray-50/50' : ''}`}
                        >
                          <td className="py-2.5 px-4 text-sm font-medium text-gray-900">
                            <div>{activity.name}</div>
                            {activity.schedule && (
                              <div className="text-xs text-gray-400">{activity.schedule}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                              <UserIcon className="w-3 h-3" />
                              {getActivityParticipantCount(activity)}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {activities.length === 0 && (
                        <tr>
                          <td colSpan={2} className="py-6 text-center text-gray-400 italic text-sm">
                            No activities yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {activities.length > 4 && (
                  <p className="text-xs text-gray-400 text-right">+{activities.length - 4} more</p>
                )}
              </div>

              {/* Circles card */}
              <div className={cardBase} onClick={() => setFocusedModule('circles')}>
                {cardHeader('Overall Participation', 'Drag and drop names between circles to update engagement levels.')}
                <ConcentricCircles nucleusId={id!} compact />
              </div>

              {/* Network card */}
              <div className={cardBase} onClick={() => setFocusedModule('network')}>
                {cardHeader('Network Overview', 'Connections between participants in this nucleus.')}
                <div className="flex flex-col items-center justify-center flex-1 py-4 gap-2 rounded-xl bg-gray-50">
                  <NetworkIcon className="w-8 h-8 text-blue-300" />
                  <p className="text-sm font-medium text-gray-600">Force-directed network</p>
                  <p className="text-xs text-gray-400 text-center px-4">
                    Shows primary contact relationships between {people.length} participant{people.length !== 1 ? 's' : ''}.
                  </p>
                </div>
              </div>

              {/* Capacities & Books card */}
              <div className={cardBase} onClick={() => setFocusedModule('capacities')}>
                {cardHeader('Capacities & Books', 'Educational progress and capacities.')}
                <div className="grid grid-cols-2 gap-4 flex-1">
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      Ruhi Progress
                    </h3>
                    {topRuhiBooks.length > 0 ? (
                      <div className="space-y-1.5">
                        {topRuhiBooks.map(b => (
                          <div key={b.name} className="flex items-center justify-between gap-2">
                            <span className="text-xs text-gray-600 truncate">{b.name}</span>
                            <span className="text-xs font-bold text-blue-600 flex-shrink-0">{b.completed}</span>
                          </div>
                        ))}
                        <div className="text-sm text-gray-400 leading-none pt-0.5" aria-label="More on the Community Profile page">…</div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">No progress yet</p>
                    )}
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      Top Capacities
                    </h3>
                    {topCapacities.length > 0 ? (
                      <div className="space-y-1.5">
                        {topCapacities.slice(0, 4).map(c => (
                          <div key={c.name} className="flex items-center justify-between gap-2">
                            <span className="text-xs text-gray-600 truncate">{c.name}</span>
                            <span className="text-xs font-bold text-amber-600 flex-shrink-0">{c.count}</span>
                          </div>
                        ))}
                        <div className="text-sm text-gray-400 leading-none pt-0.5" aria-label="More on the Community Profile page">…</div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">No capacities yet</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Notes card */}
              <div className={cardBase} onClick={() => setFocusedModule('notes')}>
                {cardHeader('Nucleus Notes', 'General notes and reflections.')}
                <div className="flex-1">
                  {notes ? (
                    <p className="text-sm text-gray-600 leading-relaxed line-clamp-5">{notes}</p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">
                      No notes yet. Click to add notes about this nucleus.
                    </p>
                  )}
                </div>
              </div>

              {/* Growth Report card */}
              <div className={cardBase} onClick={() => navigate(`/nucleus/${id}/growth-report`)}>
                {cardHeader('Growth Report', 'Trends in participation and engagement over time.')}
                <div className="flex flex-col items-center justify-center flex-1 py-4 gap-2 rounded-xl bg-emerald-50/60">
                  <TrendingUpIcon className="w-8 h-8 text-emerald-400" />
                  <p className="text-sm font-medium text-emerald-700">View growth trends</p>
                  <p className="text-xs text-gray-500 text-center px-4">
                    Charts and metrics tracking the nucleus over time.
                  </p>
                </div>
              </div>

            </div>

            {/* Dashboard hint */}
            <div className="flex items-start gap-2.5 text-sm text-gray-500 bg-blue-50/50 border border-blue-100 rounded-xl px-5 py-3.5">
              <InfoIcon className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <span>
                This dashboard is designed so you can always see all parts of your nucleus at a glance.
                Click any module to focus on it. Others shrink to the side for context and quick navigation.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Delete Nucleus Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7">
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-7 max-h-[92vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-5">Add New Activity</h2>
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

              {/* Scheduling mode picker — three exclusive options, each
                  surfaces its own fields below. */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  How is this activity scheduled?
                </label>
                <div className="space-y-2">
                  {[
                    {
                      value: 'structured_recurring' as const,
                      label: 'Structured recurring',
                      hint: 'Regular meetings on chosen days (JY groups, classes, devotionals, study circles).',
                    },
                    {
                      value: 'sporadic_ongoing' as const,
                      label: 'Sporadic / ongoing',
                      hint: 'Irregular but ongoing — describe the schedule in free text.',
                    },
                    {
                      value: 'short_duration' as const,
                      label: 'Short duration',
                      hint: 'Has a clear start and end (camp, intensive, short course).',
                    },
                  ].map(opt => (
                    <label key={opt.value} className={`flex items-start gap-2 cursor-pointer p-2 rounded-lg border ${newSchedulingMode === opt.value ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input
                        type="radio"
                        name="scheduling-mode"
                        checked={newSchedulingMode === opt.value}
                        onChange={() => setNewSchedulingMode(opt.value)}
                        className="mt-1 w-4 h-4 text-blue-600"
                      />
                      <div>
                        <div className="text-sm font-semibold text-gray-800">{opt.label}</div>
                        <div className="text-xs text-gray-500">{opt.hint}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Structured recurring fields */}
              {newSchedulingMode === 'structured_recurring' && (
                <div className="space-y-3 p-3 rounded-xl bg-gray-50/60 border border-gray-200">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Day(s) of the week
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => {
                        const selected = newDaysOfWeek.includes(i);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => toggleNewDay(i)}
                            className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-colors ${selected ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-200'}`}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Time <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="time"
                        value={newTime}
                        onChange={e => setNewTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Recurrence
                      </label>
                      <select
                        value={newIntervalWeeks}
                        onChange={e => setNewIntervalWeeks(parseInt(e.target.value, 10))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                      >
                        <option value={1}>Weekly</option>
                        <option value={2}>Biweekly</option>
                        <option value={4}>Monthly (~4 weeks)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Activity start date <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={newStartDate}
                      onChange={e => setNewStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Used as the left edge of the activity's bar on the nucleus timeline.
                      Defaults to today if left blank.
                    </p>
                  </div>
                </div>
              )}

              {/* Sporadic field */}
              {newSchedulingMode === 'sporadic_ongoing' && (
                <div className="p-3 rounded-xl bg-gray-50/60 border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Schedule description
                  </label>
                  <textarea
                    value={newScheduleNotes}
                    onChange={e => setNewScheduleNotes(e.target.value)}
                    placeholder="e.g. occasional Saturday gatherings, accompaniment visits as needed"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Sporadic activities stay visible in the system but don't auto-populate the timeline.
                  </p>
                </div>
              )}

              {/* Short-duration fields */}
              {newSchedulingMode === 'short_duration' && (
                <div className="space-y-3 p-3 rounded-xl bg-gray-50/60 border border-gray-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Start date
                      </label>
                      <input
                        type="date"
                        value={newStartDate}
                        onChange={e => setNewStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        End date
                      </label>
                      <input
                        type="date"
                        value={newEndDate}
                        onChange={e => setNewEndDate(e.target.value)}
                        min={newStartDate || undefined}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Short-duration activities show as a multi-day bar on the nucleus timeline and can be marked completed when the end date is reached.
                  </p>
                </div>
              )}

              {addActivityError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {addActivityError}
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => {
                    setShowAddActivity(false);
                    resetAddActivityForm();
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
