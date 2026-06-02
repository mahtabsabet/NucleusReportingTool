import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeftIcon,
  ClockIcon,
  EditIcon,
  PlusIcon,
  XIcon,
  CheckIcon,
  SaveIcon,
  CameraIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  fetchPersonDetail,
  updatePersonBasic,
  updatePersonNotes,
  syncCurriculumProgress,
  personDeletePermission,
  deletePerson,
  uploadProfilePhoto,
  type PersonDetail,
} from '../lib/db/persons';
import {
  AGE_GROUP_LABELS,
  ageGroupAllowsMinorToggle,
  isMinorForAgeGroup,
} from '../lib/persons/disambiguators';
import type { AgeGroup, ProfileStatus, ReligiousStatus } from '../lib/database.types';
import { submitPermissionRequest } from '../lib/db/requests';
import { fetchCourses } from '../lib/db/clusterProfile';
import {
  buildCurriculum,
  deriveBookStatus,
  type Course,
  type CompletionStatus,
} from '../lib/curriculum';
import { getCallerContext } from '../lib/db/users';
import { viewsOrdinaryLayerReadOnly } from '../lib/permissions';
import {
  fetchPersonClusters,
  fetchClusterCapacities,
  fetchPersonCapacities,
  savePersonCapacities,
  type ClusterCapacity,
} from '../lib/db/capacities';
import { GlobalSearch } from './GlobalSearch';
import { CurriculumProgress } from './CurriculumProgress';
import { AttendanceBadge } from './AttendanceIndicator';
import { getActivitiesAttendance, type ActivityAttendance } from '../lib/db/journal';

// A capacity being edited on the profile. `capacityId` is set for entries
// already in a cluster's catalog; absent for a brand-new one being typed,
// which is created in `clusterId`'s catalog on save.
type EditableCapacity = {
  capacityId?: string;
  clusterId: string;
  clusterName: string;
  name: string;
};

const NEW_CAPACITY = '__new__';

const ROLE_DISPLAY: Record<string, string> = {
  teacher: 'Teacher',
  child: 'Child',
  parent: 'Parent',
  animator: 'Animator',
  junior_youth: 'Junior Youth',
  tutor: 'Tutor',
  participant: 'Participant',
  host: 'Host',
  attendee: 'Attendee',
  other: 'Other',
};

export function IndividualProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  // This person's attendance per activity, keyed by activity id.
  const [attendance, setAttendance] = useState<Record<string, ActivityAttendance>>({});
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCapacities, setEditCapacities] = useState<EditableCapacity[]>([]);
  // Per-cluster capacity picker state (populated when editing starts).
  const [personClusters, setPersonClusters] = useState<Array<{ id: string; name: string }>>([]);
  const [clusterCatalogs, setClusterCatalogs] = useState<Record<string, ClusterCapacity[]>>({});
  const [addClusterId, setAddClusterId] = useState('');
  const [addValue, setAddValue] = useState(''); // a catalog capacity id, NEW_CAPACITY, or ''
  const [addNewName, setAddNewName] = useState('');
  // Explicit course-level marks (whole Ruhi book / JY text / branch
  // course) and unit-level marks, keyed by id. The book rollup written
  // to course_enrollments is derived from these at save time.
  const [editCourseStatuses, setEditCourseStatuses] = useState<Map<string, CompletionStatus>>(new Map());
  const [editUnitStatuses, setEditUnitStatuses] = useState<Map<string, CompletionStatus>>(new Map());
  const [editAgeGroup, setEditAgeGroup] = useState<AgeGroup>('unknown');
  const [editMinorOverride, setEditMinorOverride] = useState(false);
  const [editProfileStatus, setEditProfileStatus] = useState<ProfileStatus>('provisional');
  const [editReligiousStatus, setEditReligiousStatus] = useState<ReligiousStatus>('unknown');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [personNotes, setPersonNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);

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

  useEffect(() => {
    getCallerContext().then(ctx => setRegionalOnly(ctx ? viewsOrdinaryLayerReadOnly(ctx) : false));
  }, []);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchPersonDetail(id), fetchCourses(), personDeletePermission(id)]).then(([p, courses, dp]) => {
      setPerson(p);
      setAllCourses(courses);
      setDeletePermission(dp);
      if (p) {
        setPersonNotes(p.notes);
        setPhotoUrl(p.photoUrl);
      }
      setLoading(false);
      // Attendance trends for this person across their activities,
      // in a single query. Non-blocking — the cards render first.
      if (p && p.activities.length > 0) {
        getActivitiesAttendance(p.activities.map(a => a.activityId))
          .then(setAttendance)
          .catch(() => setAttendance({}));
      } else {
        setAttendance({});
      }
    });
  }, [id]);

  const handleDelete = async () => {
    if (!person || deleteConfirmInput !== person.name) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deletePerson(id!);
      navigate('/');
    } catch (err) {
      // The delete may have succeeded even if deletePerson threw (e.g. Supabase
      // returns a non-null error when RLS hides a row after it is soft-deleted).
      // Only show the error if the person still exists.
      const stillExists = await fetchPersonDetail(id!);
      if (!stillExists) {
        navigate('/');
        return;
      }
      console.error('Failed to delete person:', err);
      setDeleteError('Failed to delete person. Please try again.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Person not found</p>
          <button onClick={() => navigate('/')} className="text-blue-600 hover:underline">
            Back to Cluster Map
          </button>
        </div>
      </div>
    );
  }

  const startEditing = async () => {
    setEditName(person.name);
    setEditCapacities(
      person.capacities.map(c => ({
        capacityId: c.capacityId,
        clusterId: c.clusterId,
        clusterName: c.clusterName,
        name: c.name,
      })),
    );
    // Ruhi books are driven by their units; only standalone courses
    // (JY texts, branch courses) carry an explicit course-level mark.
    const standaloneCourseIds = new Set(
      allCourses.filter(c => c.units.length === 0).map(c => c.id),
    );
    setEditCourseStatuses(
      new Map(
        person.courseEnrollments
          .filter(ce => standaloneCourseIds.has(ce.courseId))
          .map(ce => [ce.courseId, ce.status]),
      ),
    );
    setEditUnitStatuses(new Map(person.unitEnrollments.map(ue => [ue.courseUnitId, ue.status])));
    setEditAgeGroup(person.ageGroup);
    setEditMinorOverride(person.isMinor);
    setEditProfileStatus(person.profileStatus);
    setEditReligiousStatus(person.religiousStatus);
    setEditEmail(person.email ?? '');
    setEditPhone(person.phone ?? '');
    setEditPhotoFile(null);
    setEditPhotoPreview(null);
    setAddValue('');
    setAddNewName('');
    setEditing(true);

    // Load the clusters this person belongs to and each one's capacity
    // catalog, so the picker can offer the right per-cluster list.
    const clusters = await fetchPersonClusters(id!);
    setPersonClusters(clusters);
    setAddClusterId(clusters.length === 1 ? clusters[0].id : '');
    const catalogs: Record<string, ClusterCapacity[]> = {};
    await Promise.all(
      clusters.map(async c => {
        catalogs[c.id] = await fetchClusterCapacities(c.id);
      }),
    );
    setClusterCatalogs(catalogs);
  };

  const handleSave = async () => {
    setSaveError(null);
    try {
      const willBeMinor = isMinorForAgeGroup(editAgeGroup, editMinorOverride);
      await updatePersonBasic(id!, {
        name: editName,
        ageGroup: editAgeGroup,
        minorOverride: ageGroupAllowsMinorToggle(editAgeGroup) ? editMinorOverride : undefined,
        profileStatus: editProfileStatus,
        religiousStatus: editReligiousStatus,
        email: willBeMinor ? null : (editEmail.trim() || null),
        phone: willBeMinor ? null : (editPhone.trim() || null),
      });
      // Course-level desired state: for every course, the whole-course
      // mark combined with its unit progress (deriveBookStatus). JY
      // texts and branch courses have no units, so this is just their
      // explicit mark.
      const desiredUnits = Array.from(editUnitStatuses, ([courseUnitId, status]) => ({
        courseUnitId,
        status,
      }));
      const desiredCourses: Array<{ courseId: string; status: CompletionStatus }> = [];
      for (const course of allCourses) {
        const status = deriveBookStatus(course, editCourseStatuses.get(course.id), editUnitStatuses);
        if (status) desiredCourses.push({ courseId: course.id, status });
      }
      await syncCurriculumProgress(id!, { courses: desiredCourses, units: desiredUnits });

      // Reconcile capacities against the per-cluster catalog (creating any
      // newly-typed entries), then read back the canonical list with ids.
      await savePersonCapacities(
        id!,
        editCapacities.map(c => ({ capacityId: c.capacityId, clusterId: c.clusterId, name: c.name })),
      );
      const savedCapacities = await fetchPersonCapacities(id!);

      let savedPhotoUrl = photoUrl;
      if (editPhotoFile) {
        savedPhotoUrl = await uploadProfilePhoto(id!, editPhotoFile);
        setPhotoUrl(savedPhotoUrl);
      }
      // Reflect changes locally without a full refetch
      const courseNameById = new Map(allCourses.map(c => [c.id, c.name]));
      const unitInfoById = new Map(
        allCourses.flatMap(c => c.units.map(u => [u.id, { name: u.name, courseId: c.id }] as const)),
      );
      setPerson(prev => prev ? {
        ...prev,
        name: editName,
        capacities: savedCapacities,
        ageGroup: editAgeGroup,
        isMinor: willBeMinor,
        profileStatus: editProfileStatus,
        email: willBeMinor ? null : (editEmail.trim() || null),
        phone: willBeMinor ? null : (editPhone.trim() || null),
        photoUrl: savedPhotoUrl,
        courseEnrollments: desiredCourses.map(dc => ({
          courseId: dc.courseId,
          courseName: courseNameById.get(dc.courseId) ?? dc.courseId,
          status: dc.status,
        })),
        unitEnrollments: desiredUnits.map(du => ({
          courseUnitId: du.courseUnitId,
          courseId: unitInfoById.get(du.courseUnitId)?.courseId ?? '',
          unitName: unitInfoById.get(du.courseUnitId)?.name ?? du.courseUnitId,
          status: du.status,
        })),
      } : prev);
      setEditPhotoFile(null);
      setEditPhotoPreview(null);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save profile:', err);
      setSaveError(err instanceof Error ? err.message : 'Failed to save profile');
    }
  };

  const handleSaveNotes = async () => {
    try {
      await updatePersonNotes(id!, personNotes);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save notes:', err);
    }
  };

  // `value` lets the dropdown's onChange add the just-selected entry
  // without waiting for the addValue state update to flush.
  const addCapacity = (value: string = addValue) => {
    const cluster = personClusters.find(c => c.id === addClusterId);
    if (!cluster) return;

    if (value === NEW_CAPACITY) {
      const name = addNewName.trim();
      if (!name) return;
      const dupe = editCapacities.some(
        c => c.clusterId === cluster.id && c.name.toLowerCase() === name.toLowerCase(),
      );
      if (!dupe) {
        setEditCapacities(prev => [...prev, { clusterId: cluster.id, clusterName: cluster.name, name }]);
      }
      setAddNewName('');
      setAddValue('');
      return;
    }

    if (value) {
      const cap = (clusterCatalogs[cluster.id] ?? []).find(c => c.id === value);
      if (cap && !editCapacities.some(c => c.capacityId === cap.id)) {
        setEditCapacities(prev => [
          ...prev,
          { capacityId: cap.id, clusterId: cluster.id, clusterName: cluster.name, name: cap.name },
        ]);
      }
      setAddValue('');
    }
  };

  const removeCapacity = (idx: number) => {
    setEditCapacities(prev => prev.filter((_, i) => i !== idx));
  };

  const setCourseStatus = (courseId: string, status: CompletionStatus | undefined) => {
    setEditCourseStatuses(prev => {
      const next = new Map(prev);
      if (status) next.set(courseId, status);
      else next.delete(courseId);
      return next;
    });
  };

  const setUnitStatus = (courseUnitId: string, status: CompletionStatus | undefined) => {
    setEditUnitStatuses(prev => {
      const next = new Map(prev);
      if (status) next.set(courseUnitId, status);
      else next.delete(courseUnitId);
      return next;
    });
  };

  const displayName = editing ? editName : person.name;
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase();
  const capacities: Array<{ name: string; clusterName: string }> = editing
    ? editCapacities
    : person.capacities;
  // Show the owning cluster alongside each capacity only when the person
  // spans more than one cluster — otherwise it's just noise.
  const showCapacityClusters = new Set(capacities.map(c => c.clusterName)).size > 1;
  const addCatalog = (clusterCatalogs[addClusterId] ?? []).filter(
    c => !editCapacities.some(ec => ec.capacityId === c.id),
  );

  const curriculum = buildCurriculum(allCourses);
  const courseStatuses = editing
    ? editCourseStatuses
    : new Map(person.courseEnrollments.map(ce => [ce.courseId, ce.status]));
  const unitStatuses = editing
    ? editUnitStatuses
    : new Map(person.unitEnrollments.map(ue => [ue.courseUnitId, ue.status]));

  return (
    <div className="min-h-screen bg-gray-50/50 font-sans">
      <header className="bg-white border-b border-gray-200/80 px-8 py-5 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            <ChevronLeftIcon className="w-4 h-4" />
            Back
          </button>
          <div className="flex-1 max-w-sm">
            <GlobalSearch />
          </div>
          {deletePermission === 'direct' && (
            <button
              onClick={() => { setDeleteConfirmInput(''); setDeleteError(null); setShowDeleteConfirm(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2Icon className="w-4 h-4" />
              Delete Person
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
      </header>

      {showRequest && person && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                <ClockIcon className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Request Person Deletion</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              You don't have permission to delete <strong>{person.name}</strong> directly. A coordinator will review your request.
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
                      targetType: 'person',
                      targetId: id!,
                      action: 'delete',
                      note: requestNote.trim() || undefined,
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

      {showDeleteConfirm && person && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2Icon className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Delete Person</h2>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              This will permanently remove <strong>{person.name}</strong> from the system, including all activity participation records, nucleus enrollment, and engagement level placement. This action cannot be undone.
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Type <strong>{person.name}</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmInput}
              onChange={e => setDeleteConfirmInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm mb-4"
              placeholder={person.name}
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
                disabled={deleteConfirmInput !== person.name || deleting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting…' : 'Delete Person'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto p-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
          {/* Header */}
          <div
            className="relative px-8 py-10 text-white overflow-hidden"
            style={{ background: 'linear-gradient(to right, #2563eb, #1e40af)' }}
          >
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl pointer-events-none" />
            <div className="flex items-start justify-between relative z-10">
              <div className="flex items-center gap-6">
                {/* Avatar: shows photo if available, otherwise initials; upload overlay in edit mode */}
                <div className="relative w-28 h-28 flex-shrink-0">
                  <div className="w-28 h-28 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 shadow-inner overflow-hidden flex items-center justify-center text-4xl font-bold">
                    {(editing ? editPhotoPreview : photoUrl) ? (
                      <img
                        src={editing ? (editPhotoPreview ?? photoUrl ?? undefined) : (photoUrl ?? undefined)}
                        alt={person.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>
                  {editing && (
                    <label className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/40 cursor-pointer opacity-0 hover:opacity-100 transition-opacity">
                      <CameraIcon className="w-6 h-6 text-white mb-1" />
                      <span className="text-white text-xs font-semibold">
                        {editPhotoPreview || photoUrl ? 'Change' : 'Add Photo'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setEditPhotoFile(file);
                            const reader = new FileReader();
                            reader.onloadend = () => setEditPhotoPreview(reader.result as string);
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
                <div>
                  {editing ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="text-3xl font-bold mb-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg px-3 py-1.5 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-white/50"
                    />
                  ) : (
                    <h1 className="text-3xl font-bold mb-2 tracking-tight">{person.name}</h1>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-blue-200 font-medium text-sm uppercase tracking-wider">
                      Nuclei:
                    </span>
                    <div className="flex gap-2 flex-wrap">
                      {person.nuclei.map(n => (
                        <span
                          key={n.id}
                          className="bg-blue-900/40 px-2.5 py-1 rounded-md text-sm font-medium border border-blue-400/30"
                        >
                          {n.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {saved && (
                  <span className="flex items-center gap-1.5 text-sm font-bold bg-green-500/20 text-green-100 border border-green-400/30 px-4 py-2 rounded-xl backdrop-blur-sm">
                    <CheckIcon className="w-4 h-4" /> Saved!
                  </span>
                )}
                {saveError && (
                  <span className="flex items-center gap-1.5 text-sm font-bold bg-red-500/20 text-red-100 border border-red-400/30 px-4 py-2 rounded-xl backdrop-blur-sm max-w-xs truncate" title={saveError}>
                    Save failed
                  </span>
                )}
                {editing ? (
                  <div className="flex gap-3">
                    <button
                      onClick={() => setEditing(false)}
                      className="px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl font-medium transition-all duration-200 backdrop-blur-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      className="flex items-center gap-2 px-5 py-2.5 bg-white text-blue-700 rounded-xl hover:bg-blue-50 font-bold transition-all duration-200 shadow-sm"
                    >
                      <SaveIcon className="w-4 h-4" />
                      Save Profile
                    </button>
                  </div>
                ) : !regionalOnly ? (
                  <button
                    onClick={startEditing}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl font-medium transition-all duration-200 backdrop-blur-sm"
                  >
                    <EditIcon className="w-4 h-4" />
                    Edit Profile
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Left: Nuclei + Capacities */}
            <div className="space-y-8">
              <div>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">
                  Associated Nuclei
                </h2>
                <div className="flex flex-wrap gap-2">
                  {person.nuclei.map(n => (
                    <button
                      key={n.id}
                      onClick={() => navigate(`/nucleus/${n.id}`)}
                      className="px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200/60 rounded-xl font-semibold hover:bg-blue-100 hover:border-blue-300 transition-all duration-200"
                    >
                      {n.name}
                    </button>
                  ))}
                  {person.nuclei.length === 0 && (
                    <p className="text-sm text-gray-400 italic">Not enrolled in any nucleus</p>
                  )}
                </div>
              </div>

              <div>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">
                  Identity
                </h2>
                {editing ? (
                  <div className="space-y-3 bg-gray-50/60 border border-gray-100 rounded-xl p-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                        Age group
                      </label>
                      <select
                        value={editAgeGroup}
                        onChange={e => {
                          const v = e.target.value as AgeGroup;
                          setEditAgeGroup(v);
                          if (v === 'child' || v === 'junior_youth') setEditMinorOverride(true);
                          else if (v === 'adult') setEditMinorOverride(false);
                        }}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="child">Child</option>
                        <option value="junior_youth">Junior Youth</option>
                        <option value="youth">Youth</option>
                        <option value="adult">Adult</option>
                        <option value="unknown">Unknown</option>
                      </select>
                    </div>
                    {ageGroupAllowsMinorToggle(editAgeGroup) ? (
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={editMinorOverride}
                          onChange={e => setEditMinorOverride(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Under 18 (minor)
                      </label>
                    ) : (
                      <p className="text-xs text-gray-500 italic">
                        {editAgeGroup === 'adult'
                          ? 'Adults are not minors.'
                          : 'Children and Junior Youth are always minors.'}
                      </p>
                    )}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                        Profile status
                      </label>
                      <select
                        value={editProfileStatus}
                        onChange={e => setEditProfileStatus(e.target.value as ProfileStatus)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="provisional">Provisional</option>
                        <option value="confirmed">Confirmed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                        Relationship to the Faith
                      </label>
                      <select
                        value={editReligiousStatus}
                        onChange={e => setEditReligiousStatus(e.target.value as ReligiousStatus)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="unknown">Unknown</option>
                        <option value="bahai">Bahá'í</option>
                        <option value="friend">Friend of the Faith</option>
                      </select>
                    </div>
                    {!isMinorForAgeGroup(editAgeGroup, editMinorOverride) && (
                      <>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                            Email
                          </label>
                          <input
                            type="email"
                            value={editEmail}
                            onChange={e => setEditEmail(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                            Phone
                          </label>
                          <input
                            type="tel"
                            value={editPhone}
                            onChange={e => setEditPhone(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </>
                    )}
                    {isMinorForAgeGroup(editAgeGroup, editMinorOverride) && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 leading-snug">
                        Minors: email and phone are not collected.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5 text-sm text-gray-700">
                    <div>
                      <span className="font-semibold text-gray-500">Age group:</span>{' '}
                      {AGE_GROUP_LABELS[person.ageGroup] || 'Unknown'}
                      {person.ageGroup === 'youth' && person.isMinor && (
                        <span className="text-gray-500"> (under 18)</span>
                      )}
                    </div>
                    <div>
                      <span className="font-semibold text-gray-500">Profile:</span>{' '}
                      {person.profileStatus === 'confirmed' ? 'Confirmed' : 'Provisional'}
                    </div>
                    <div>
                      <span className="font-semibold text-gray-500">Faith:</span>{' '}
                      {person.religiousStatus === 'bahai'
                        ? "Bahá'í"
                        : person.religiousStatus === 'friend'
                        ? 'Friend of the Faith'
                        : 'Unknown'}
                    </div>
                    {!person.isMinor && (person.email || person.phone) && (
                      <div className="pt-1 space-y-0.5 text-xs text-gray-500">
                        {person.email && <div>✉ {person.email}</div>}
                        {person.phone && <div>☎ {person.phone}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">
                  Capacities
                </h2>
                <ul className="space-y-3">
                  {capacities.map((capacity, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-3 text-gray-700 bg-gray-50/80 border border-gray-100 px-4 py-3 rounded-xl"
                    >
                      <span className="text-amber-500 mt-0.5">●</span>
                      <span className="flex-1 font-medium">
                        {capacity.name}
                        {showCapacityClusters && (
                          <span className="ml-2 text-xs font-semibold text-gray-400">
                            {capacity.clusterName}
                          </span>
                        )}
                      </span>
                      {editing && (
                        <button
                          onClick={() => removeCapacity(idx)}
                          className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded-md transition-colors"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {editing && (
                  personClusters.length === 0 ? (
                    <p className="text-sm text-gray-400 italic bg-gray-50 border border-gray-100 px-4 py-3 rounded-xl mt-4">
                      Add this person to a nucleus before recording capacities — each
                      capacity belongs to a cluster's shared list.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-2">
                      {personClusters.length > 1 && (
                        <select
                          value={addClusterId}
                          onChange={e => {
                            setAddClusterId(e.target.value);
                            setAddValue('');
                            setAddNewName('');
                          }}
                          className="w-full px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                        >
                          <option value="">Select a cluster…</option>
                          {personClusters.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      )}
                      <div className="flex gap-2">
                        <select
                          value={addValue}
                          disabled={!addClusterId}
                          onChange={e => {
                            const v = e.target.value;
                            if (v === NEW_CAPACITY) {
                              setAddValue(NEW_CAPACITY);
                              setAddNewName('');
                            } else {
                              if (v) addCapacity(v);
                              setAddValue('');
                            }
                          }}
                          className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          <option value="">Add a capacity…</option>
                          {addCatalog.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                          <option value={NEW_CAPACITY}>+ New capacity…</option>
                        </select>
                      </div>
                      {addValue === NEW_CAPACITY && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            autoFocus
                            value={addNewName}
                            onChange={e => setAddNewName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addCapacity()}
                            placeholder="Name the new capacity…"
                            className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                          />
                          <button
                            onClick={addCapacity}
                            className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-sm transition-colors"
                          >
                            <PlusIcon className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                )}
                {capacities.length === 0 && !editing && (
                  <p className="text-sm text-gray-400 italic bg-gray-50 border border-gray-100 px-4 py-3 rounded-xl">
                    No capacities recorded yet
                  </p>
                )}
              </div>
            </div>

            {/* Right: Curriculum progress */}
            <div className="space-y-8">
              <div>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">
                  Curriculum Progress
                </h2>
                <CurriculumProgress
                  curriculum={curriculum}
                  editing={editing}
                  courseStatuses={courseStatuses}
                  unitStatuses={unitStatuses}
                  onCourseStatusChange={setCourseStatus}
                  onUnitStatusChange={setUnitStatus}
                />
              </div>
            </div>
          </div>

          {/* Activities */}
          <div className="border-t border-gray-100 p-8 bg-gray-50/30">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-5">
              Core and Other Activities
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {person.activities.length > 0 ? (
                person.activities.map(activity => (
                  <div
                    key={activity.activityId}
                    className="bg-white border border-gray-200/80 px-5 py-4 rounded-xl shadow-sm hover:border-blue-200 hover:shadow-md transition-all duration-200"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                          <span className="text-blue-600 text-lg">📚</span>
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 tracking-tight">{activity.activityName}</p>
                          <p className="text-sm font-medium text-gray-500 mt-0.5">
                            Role:{' '}
                            <span className="text-gray-700">
                              {ROLE_DISPLAY[activity.role] ?? activity.role}
                            </span>
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          navigate(`/nucleus/${activity.nucleusId}/activity/${activity.activityId}`)
                        }
                        className="text-blue-600 hover:text-blue-800 font-semibold text-sm bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        View
                      </button>
                    </div>
                    <AttendanceBadge
                      data={attendance[activity.activityId]?.byPerson[id ?? '']}
                      recentSessionDates={attendance[activity.activityId]?.recentSessionDates ?? []}
                    />
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400 italic col-span-2 bg-white border border-gray-100 px-5 py-4 rounded-xl">
                  No activities recorded yet
                </p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="border-t border-gray-100 p-8">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">
              Notes (Conversations, Next Steps, etc.)
            </h2>
            <textarea
              value={personNotes}
              onChange={e => setPersonNotes(e.target.value)}
              placeholder={regionalOnly && !personNotes ? 'No notes for this person.' : 'Write any notes about conversations, next steps, observations...'}
              readOnly={regionalOnly}
              className={`w-full min-h-[120px] px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 resize-y shadow-sm ${
                regionalOnly
                  ? 'bg-gray-50 cursor-default focus:outline-none'
                  : 'focus:ring-2 focus:ring-blue-500 focus:border-transparent'
              }`}
            />
            {!regionalOnly && (
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={handleSaveNotes}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-sm hover:shadow-md"
                >
                  Save Notes
                </button>
                {notesSaved && (
                  <span className="flex items-center gap-1.5 text-sm text-green-700 font-bold bg-green-50 px-3 py-1.5 rounded-lg">
                    <CheckIcon className="w-4 h-4" />
                    Saved!
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Footer (edit mode) */}
          {editing && (
            <div className="border-t border-gray-200/80 px-8 py-5 bg-gray-50 flex items-center gap-3">
              <button
                onClick={() => setEditing(false)}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-sm hover:shadow-md transition-all duration-200"
              >
                Save Profile Changes
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
