import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeftIcon,
  CheckCircleIcon,
  CircleIcon,
  EditIcon,
  PlusIcon,
  XIcon,
  CheckIcon,
  SaveIcon,
  ImageIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  fetchPersonDetail,
  updatePersonBasic,
  updatePersonNotes,
  syncCourseEnrollments,
  canDeletePerson,
  deletePerson,
  type PersonDetail,
} from '../lib/db/persons';
import { fetchCourses, type CourseRow } from '../lib/db/clusterProfile';

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

type EditCourseStatus = 'in_progress' | 'completed';

interface EditCourse {
  courseId: string;
  courseName: string;
  status: EditCourseStatus;
}

export function IndividualProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [allCourses, setAllCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCapacities, setEditCapacities] = useState<string[]>([]);
  const [editCourses, setEditCourses] = useState<EditCourse[]>([]);
  const [newCapacity, setNewCapacity] = useState('');
  const [saved, setSaved] = useState(false);

  const [bannerImage, setBannerImage] = useState<string | null>(null);
  const [personNotes, setPersonNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchPersonDetail(id), fetchCourses(), canDeletePerson()]).then(([p, courses, adminCheck]) => {
      setPerson(p);
      setAllCourses(courses);
      setIsAdmin(adminCheck);
      if (p) {
        setPersonNotes(p.notes);
        setBannerImage(null); // banner image is a future feature
      }
      setLoading(false);
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

  const startEditing = () => {
    setEditName(person.name);
    setEditCapacities([...person.capacities]);
    setEditCourses(person.courseEnrollments.map(ce => ({
      courseId: ce.courseId,
      courseName: ce.courseName,
      status: ce.status,
    })));
    setEditing(true);
  };

  const handleSave = async () => {
    try {
      await updatePersonBasic(id!, { name: editName, capacities: editCapacities });
      await syncCourseEnrollments(id!, editCourses.map(c => ({ courseId: c.courseId, status: c.status })));
      // Reflect changes locally without a full refetch
      setPerson(prev => prev ? {
        ...prev,
        name: editName,
        capacities: editCapacities,
        courseEnrollments: editCourses.map(c => ({
          courseId: c.courseId,
          courseName: c.courseName,
          status: c.status,
        })),
      } : prev);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save profile:', err);
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

  const addCapacity = () => {
    if (newCapacity.trim()) {
      setEditCapacities(prev => [...prev, newCapacity.trim()]);
      setNewCapacity('');
    }
  };

  const removeCapacity = (idx: number) => {
    setEditCapacities(prev => prev.filter((_, i) => i !== idx));
  };

  // Cycles: none → in_progress → completed → remove
  const toggleCourse = (courseId: string, courseName: string) => {
    const existing = editCourses.find(c => c.courseId === courseId);
    if (!existing) {
      setEditCourses(prev => [...prev, { courseId, courseName, status: 'in_progress' }]);
    } else if (existing.status === 'in_progress') {
      setEditCourses(prev => prev.map(c => c.courseId === courseId ? { ...c, status: 'completed' } : c));
    } else {
      setEditCourses(prev => prev.filter(c => c.courseId !== courseId));
    }
  };

  const getCourseStatus = (courseId: string): 'completed' | 'in_progress' | 'none' =>
    editCourses.find(c => c.courseId === courseId)?.status ?? 'none';

  const displayName = editing ? editName : person.name;
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase();

  const completedCourses = editing
    ? editCourses.filter(c => c.status === 'completed')
    : person.courseEnrollments.filter(c => c.status === 'completed');
  const inProgressCourses = editing
    ? editCourses.filter(c => c.status === 'in_progress')
    : person.courseEnrollments.filter(c => c.status === 'in_progress');
  const capacities = editing ? editCapacities : person.capacities;

  return (
    <div className="min-h-screen bg-gray-50/50 font-sans">
      <header className="bg-white border-b border-gray-200/80 px-8 py-5 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            <ChevronLeftIcon className="w-4 h-4" />
            Back
          </button>
          {isAdmin && (
            <button
              onClick={() => { setDeleteConfirmInput(''); setDeleteError(null); setShowDeleteConfirm(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2Icon className="w-4 h-4" />
              Delete Person
            </button>
          )}
        </div>
      </header>

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
            style={
              bannerImage
                ? {
                    backgroundImage: `linear-gradient(to bottom, rgba(37,99,235,0.85), rgba(30,64,175,0.92)), url(${bannerImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : { background: 'linear-gradient(to right, #2563eb, #1e40af)' }
            }
          >
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl pointer-events-none" />
            <div className="flex items-start justify-between relative z-10">
              <div className="flex items-center gap-6">
                <div className="w-28 h-28 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-4xl font-bold shadow-inner">
                  {initials}
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
                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-sm font-medium text-white rounded-lg border border-white/20 transition-all backdrop-blur-sm">
                  <ImageIcon className="w-4 h-4" />
                  {bannerImage ? 'Change Photo' : 'Add Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => setBannerImage(reader.result as string);
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="hidden"
                  />
                </label>
                {saved && (
                  <span className="flex items-center gap-1.5 text-sm font-bold bg-green-500/20 text-green-100 border border-green-400/30 px-4 py-2 rounded-xl backdrop-blur-sm">
                    <CheckIcon className="w-4 h-4" /> Saved!
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
                ) : (
                  <button
                    onClick={startEditing}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl font-medium transition-all duration-200 backdrop-blur-sm"
                  >
                    <EditIcon className="w-4 h-4" />
                    Edit Profile
                  </button>
                )}
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
                  Capacities
                </h2>
                <ul className="space-y-3">
                  {capacities.map((capacity, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-3 text-gray-700 bg-gray-50/80 border border-gray-100 px-4 py-3 rounded-xl"
                    >
                      <span className="text-amber-500 mt-0.5">●</span>
                      <span className="flex-1 font-medium">{capacity}</span>
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
                  <div className="flex gap-2 mt-4">
                    <input
                      type="text"
                      value={newCapacity}
                      onChange={e => setNewCapacity(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addCapacity()}
                      placeholder="Add a new capacity..."
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
                {capacities.length === 0 && !editing && (
                  <p className="text-sm text-gray-400 italic bg-gray-50 border border-gray-100 px-4 py-3 rounded-xl">
                    No capacities recorded yet
                  </p>
                )}
              </div>
            </div>

            {/* Right: Courses */}
            <div className="space-y-8">
              <div>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">
                  Ruhi Institute Courses
                </h2>

                {editing ? (
                  <div className="space-y-2.5">
                    {allCourses.map(course => {
                      const status = getCourseStatus(course.id);
                      return (
                        <button
                          key={course.id}
                          onClick={() => toggleCourse(course.id, course.name)}
                          className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 ${
                            status === 'completed'
                              ? 'bg-green-50 border-green-200 text-green-800 shadow-sm'
                              : status === 'in_progress'
                              ? 'bg-blue-50 border-blue-200 text-blue-800 shadow-sm'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {status === 'completed' && (
                            <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0" />
                          )}
                          {status === 'in_progress' && (
                            <CircleIcon className="w-5 h-5 text-blue-600 flex-shrink-0" />
                          )}
                          {status === 'none' && (
                            <CircleIcon className="w-5 h-5 text-gray-300 flex-shrink-0" />
                          )}
                          <span className="text-sm font-medium">{course.name}</span>
                          <span className="ml-auto text-xs font-semibold opacity-60 uppercase tracking-wider">
                            {status === 'none'
                              ? 'Click: In Progress'
                              : status === 'in_progress'
                              ? 'Click: Complete'
                              : 'Click: Remove'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {completedCourses.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold text-green-700 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <CheckCircleIcon className="w-4 h-4" /> Completed
                        </h3>
                        <ul className="space-y-2.5">
                          {completedCourses.map(course => (
                            <li
                              key={course.courseId}
                              className="flex items-start gap-3 text-gray-800 bg-green-50/50 border border-green-100 px-4 py-3 rounded-xl font-medium"
                            >
                              <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                              <span>{course.courseName}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {inProgressCourses.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <CircleIcon className="w-4 h-4" /> In Progress
                        </h3>
                        <ul className="space-y-2.5">
                          {inProgressCourses.map(course => (
                            <li
                              key={course.courseId}
                              className="flex items-start gap-3 text-gray-800 bg-blue-50/50 border border-blue-100 px-4 py-3 rounded-xl font-medium"
                            >
                              <CircleIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                              <span>{course.courseName}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {completedCourses.length === 0 && inProgressCourses.length === 0 && (
                      <p className="text-sm text-gray-400 italic bg-gray-50 border border-gray-100 px-4 py-3 rounded-xl">
                        No courses recorded yet
                      </p>
                    )}
                  </div>
                )}
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
                    className="flex items-center justify-between bg-white border border-gray-200/80 px-5 py-4 rounded-xl shadow-sm hover:border-blue-200 hover:shadow-md transition-all duration-200"
                  >
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
              placeholder="Write any notes about conversations, next steps, observations..."
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
                  <CheckIcon className="w-4 h-4" />
                  Saved!
                </span>
              )}
            </div>
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
