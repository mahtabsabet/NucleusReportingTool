import React, { useState, Children } from 'react';
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
  ImageIcon } from
'lucide-react';
import {
  getPerson,
  updatePerson,
  getProfileBannerImage,
  setProfileBannerImage,
  getPersonNotes,
  setPersonNotes } from
'../data/store';
import { Participant, Course } from '../types';
const ALL_RUHI_BOOKS: {
  id: string;
  name: string;
}[] = [
{
  id: 'c-1',
  name: 'Book 1: Reflections on the Life of the Spirit'
},
{
  id: 'c-2',
  name: 'Book 2: Arising to Serve'
},
{
  id: 'c-3',
  name: "Book 3: Teaching Children's Classes Grade 1"
},
{
  id: 'c-4',
  name: 'Book 4: The Twin Manifestations'
},
{
  id: 'c-5',
  name: 'Book 5: Releasing the Powers of Junior Youth'
},
{
  id: 'c-6',
  name: 'Book 6: Teaching the Cause'
},
{
  id: 'c-7',
  name: 'Book 7: Walking Together on a Path of Service'
},
{
  id: 'c-8',
  name: "Book 8: The Covenant of Bahá', u, 'lláh"
}];

export function IndividualProfile() {
  const { id } = useParams<{
    id: string;
  }>();
  const navigate = useNavigate();
  const participant = getPerson(id!);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(participant?.name || '');
  const [editCapacities, setEditCapacities] = useState<string[]>(
    participant?.capacities || []
  );
  const [editCourses, setEditCourses] = useState<Course[]>(
    participant?.courses || []
  );
  const [newCapacity, setNewCapacity] = useState('');
  const [saved, setSaved] = useState(false);
  const [bannerImage, setBannerImageState] = useState<string | null>(() =>
  getProfileBannerImage(id!)
  );
  const [personNotes, setPersonNotesState] = useState(() => getPersonNotes(id!));
  const [notesSaved, setNotesSaved] = useState(false);
  const handleSaveNotes = () => {
    setPersonNotes(id!, personNotes);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  };
  if (!participant) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Participant not found</p>
          <button
            onClick={() => navigate('/')}
            className="text-blue-600 hover:underline">
            
            Back to Cluster Map
          </button>
        </div>
      </div>);

  }
  const completedCourses = editing ?
  editCourses.filter((c) => c.status === 'completed') :
  participant.courses.filter((c) => c.status === 'completed');
  const inProgressCourses = editing ?
  editCourses.filter((c) => c.status === 'in-progress') :
  participant.courses.filter((c) => c.status === 'in-progress');
  const capacities = editing ? editCapacities : participant.capacities;
  const startEditing = () => {
    setEditName(participant.name);
    setEditCapacities([...participant.capacities]);
    setEditCourses([...participant.courses]);
    setEditing(true);
  };
  const handleSave = () => {
    updatePerson(id!, {
      name: editName,
      capacities: editCapacities,
      courses: editCourses
    });
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  const addCapacity = () => {
    if (newCapacity.trim()) {
      setEditCapacities((prev) => [...prev, newCapacity.trim()]);
      setNewCapacity('');
    }
  };
  const removeCapacity = (idx: number) => {
    setEditCapacities((prev) => prev.filter((_, i) => i !== idx));
  };
  const toggleCourse = (bookId: string, bookName: string) => {
    const existing = editCourses.find((c) => c.id === bookId);
    if (existing) {
      if (existing.status === 'completed') {
        setEditCourses((prev) => prev.filter((c) => c.id !== bookId));
      } else {
        setEditCourses((prev) =>
        prev.map((c) =>
        c.id === bookId ?
        {
          ...c,
          status: 'completed' as const
        } :
        c
        )
        );
      }
    } else {
      setEditCourses((prev) => [
      ...prev,
      {
        id: bookId,
        name: bookName,
        status: 'in-progress' as const
      }]
      );
    }
  };
  const getCourseStatus = (
  bookId: string)
  : 'completed' | 'in-progress' | 'none' => {
    const course = editCourses.find((c) => c.id === bookId);
    return course?.status || 'none';
  };
  return (
    <div className="min-h-screen bg-gray-50/50 font-sans">
      <header className="bg-white border-b border-gray-200/80 px-8 py-5 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
            
            <ChevronLeftIcon className="w-4 h-4" />
            Back
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
          {/* Header */}
          <div
            className="relative px-8 py-10 text-white overflow-hidden"
            style={
            bannerImage ?
            {
              backgroundImage: `linear-gradient(to bottom, rgba(37,99,235,0.85), rgba(30,64,175,0.92)), url(${bannerImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            } :
            {
              background: 'linear-gradient(to right, #2563eb, #1e40af)'
            }
            }>
            
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl pointer-events-none"></div>
            <div className="flex items-start justify-between relative z-10">
              <div className="flex items-center gap-6">
                <div className="w-28 h-28 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-4xl font-bold shadow-inner">
                  {(editing ? editName : participant.name).
                  split(' ').
                  map((n) => n[0]).
                  join('')}
                </div>
                <div>
                  {editing ?
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="text-3xl font-bold mb-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg px-3 py-1.5 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-white/50" /> :


                  <h1 className="text-3xl font-bold mb-2 tracking-tight">
                      {participant.name}
                    </h1>
                  }
                  <div className="flex items-center gap-2">
                    <span className="text-blue-200 font-medium text-sm uppercase tracking-wider">
                      Nuclei:
                    </span>
                    <div className="flex gap-2">
                      {participant.nuclei.map((n) =>
                      <span
                        key={n}
                        className="bg-blue-900/40 px-2.5 py-1 rounded-md text-sm font-medium border border-blue-400/30">
                        
                          {n.charAt(0).toUpperCase() + n.slice(1)}
                        </span>
                      )}
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
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          const dataUrl = reader.result as string;
                          setBannerImageState(dataUrl);
                          setProfileBannerImage(id!, dataUrl);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="hidden" />
                  
                </label>
                {saved &&
                <span className="flex items-center gap-1.5 text-sm font-bold bg-green-500/20 text-green-100 border border-green-400/30 px-4 py-2 rounded-xl backdrop-blur-sm">
                    <CheckIcon className="w-4 h-4" /> Saved!
                  </span>
                }
                {editing ?
                <div className="flex gap-3">
                    <button
                    onClick={() => setEditing(false)}
                    className="px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl font-medium transition-all duration-200 backdrop-blur-sm">
                    
                      Cancel
                    </button>
                    <button
                    onClick={handleSave}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white text-blue-700 rounded-xl hover:bg-blue-50 font-bold transition-all duration-200 shadow-sm">
                    
                      <SaveIcon className="w-4 h-4" />
                      Save Profile
                    </button>
                  </div> :

                <button
                  onClick={startEditing}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl font-medium transition-all duration-200 backdrop-blur-sm">
                  
                    <EditIcon className="w-4 h-4" />
                    Edit Profile
                  </button>
                }
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-8">
              {/* Nuclei */}
              <div>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">
                  Associated Nuclei
                </h2>
                <div className="flex flex-wrap gap-2">
                  {participant.nuclei.map((nucleus) =>
                  <button
                    key={nucleus}
                    onClick={() => navigate(`/nucleus/${nucleus}`)}
                    className="px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200/60 rounded-xl font-semibold hover:bg-blue-100 hover:border-blue-300 transition-all duration-200">
                    
                      {nucleus.charAt(0).toUpperCase() + nucleus.slice(1)}
                    </button>
                  )}
                </div>
              </div>

              {/* Capacities */}
              <div>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">
                  Capacities
                </h2>
                <ul className="space-y-3">
                  {capacities.map((capacity, idx) =>
                  <li
                    key={idx}
                    className="flex items-start gap-3 text-gray-700 bg-gray-50/80 border border-gray-100 px-4 py-3 rounded-xl">
                    
                      <span className="text-amber-500 mt-0.5">●</span>
                      <span className="flex-1 font-medium">{capacity}</span>
                      {editing &&
                    <button
                      onClick={() => removeCapacity(idx)}
                      className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded-md transition-colors">
                      
                          <XIcon className="w-4 h-4" />
                        </button>
                    }
                    </li>
                  )}
                </ul>
                {editing &&
                <div className="flex gap-2 mt-4">
                    <input
                    type="text"
                    value={newCapacity}
                    onChange={(e) => setNewCapacity(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCapacity()}
                    placeholder="Add a new capacity..."
                    className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm" />
                  
                    <button
                    onClick={addCapacity}
                    className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-sm transition-colors">
                    
                      <PlusIcon className="w-4 h-4" />
                    </button>
                  </div>
                }
                {capacities.length === 0 && !editing &&
                <p className="text-sm text-gray-400 italic bg-gray-50 border border-gray-100 px-4 py-3 rounded-xl">
                    No capacities recorded yet
                  </p>
                }
              </div>
            </div>

            {/* Courses */}
            <div className="space-y-8">
              <div>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">
                  Ruhi Institute Courses
                </h2>

                {editing ?
                <div className="space-y-2.5">
                    {ALL_RUHI_BOOKS.map((book) => {
                    const status = getCourseStatus(book.id);
                    return (
                      <button
                        key={book.id}
                        onClick={() => toggleCourse(book.id, book.name)}
                        className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 ${status === 'completed' ? 'bg-green-50 border-green-200 text-green-800 shadow-sm' : status === 'in-progress' ? 'bg-blue-50 border-blue-200 text-blue-800 shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}>
                        
                          {status === 'completed' &&
                        <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0" />
                        }
                          {status === 'in-progress' &&
                        <CircleIcon className="w-5 h-5 text-blue-600 flex-shrink-0" />
                        }
                          {status === 'none' &&
                        <CircleIcon className="w-5 h-5 text-gray-300 flex-shrink-0" />
                        }
                          <span className="text-sm font-medium">
                            {book.name}
                          </span>
                          <span className="ml-auto text-xs font-semibold opacity-60 uppercase tracking-wider">
                            {status === 'none' ?
                          'Click: In Progress' :
                          status === 'in-progress' ?
                          'Click: Complete' :
                          'Click: Remove'}
                          </span>
                        </button>);

                  })}
                  </div> :

                <div className="space-y-6">
                    {completedCourses.length > 0 &&
                  <div>
                        <h3 className="text-xs font-bold text-green-700 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <CheckCircleIcon className="w-4 h-4" /> Completed
                        </h3>
                        <ul className="space-y-2.5">
                          {completedCourses.map((course) =>
                      <li
                        key={course.id}
                        className="flex items-start gap-3 text-gray-800 bg-green-50/50 border border-green-100 px-4 py-3 rounded-xl font-medium">
                        
                              <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                              <span>{course.name}</span>
                            </li>
                      )}
                        </ul>
                      </div>
                  }
                    {inProgressCourses.length > 0 &&
                  <div>
                        <h3 className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <CircleIcon className="w-4 h-4" /> In Progress
                        </h3>
                        <ul className="space-y-2.5">
                          {inProgressCourses.map((course) =>
                      <li
                        key={course.id}
                        className="flex items-start gap-3 text-gray-800 bg-blue-50/50 border border-blue-100 px-4 py-3 rounded-xl font-medium">
                        
                              <CircleIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                              <span>{course.name}</span>
                            </li>
                      )}
                        </ul>
                      </div>
                  }
                    {completedCourses.length === 0 &&
                  inProgressCourses.length === 0 &&
                  <p className="text-sm text-gray-400 italic bg-gray-50 border border-gray-100 px-4 py-3 rounded-xl">
                          No courses recorded yet
                        </p>
                  }
                  </div>
                }
              </div>
            </div>
          </div>

          {/* Activities */}
          <div className="border-t border-gray-100 p-8 bg-gray-50/30">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-5">
              Core and Other Activities
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {participant.activities.length > 0 ?
              participant.activities.map((activity) =>
              <div
                key={activity.activityId}
                className="flex items-center justify-between bg-white border border-gray-200/80 px-5 py-4 rounded-xl shadow-sm hover:border-blue-200 hover:shadow-md transition-all duration-200">
                
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                        <span className="text-blue-600 text-lg">📚</span>
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 tracking-tight">
                          {activity.activityName}
                        </p>
                        <p className="text-sm font-medium text-gray-500 capitalize mt-0.5">
                          Role:{' '}
                          <span className="text-gray-700">{activity.role}</span>
                        </p>
                      </div>
                    </div>
                    <button
                  onClick={() =>
                  navigate(
                    `/nucleus/${activity.nucleusId}/activity/${activity.activityId}`
                  )
                  }
                  className="text-blue-600 hover:text-blue-800 font-semibold text-sm bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
                  
                      View
                    </button>
                  </div>
              ) :

              <p className="text-sm text-gray-400 italic col-span-2 bg-white border border-gray-100 px-5 py-4 rounded-xl">
                  No activities recorded yet
                </p>
              }
            </div>
          </div>

          {/* Notes */}
          <div className="border-t border-gray-100 p-8">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">
              Notes (Conversations, Next Steps, etc.)
            </h2>
            <textarea
              value={personNotes}
              onChange={(e) => setPersonNotesState(e.target.value)}
              placeholder="Write any notes about conversations, next steps, observations..."
              className="w-full min-h-[120px] px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y shadow-sm" />
            
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={handleSaveNotes}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-sm hover:shadow-md">
                
                Save Notes
              </button>
              {notesSaved &&
              <span className="flex items-center gap-1.5 text-sm text-green-700 font-bold bg-green-50 px-3 py-1.5 rounded-lg">
                  <CheckIcon className="w-4 h-4" />
                  Saved!
                </span>
              }
            </div>
          </div>

          {/* Footer */}
          {editing &&
          <div className="border-t border-gray-200/80 px-8 py-5 bg-gray-50 flex items-center gap-3">
              <button
              onClick={() => setEditing(false)}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-white transition-colors">
              
                Cancel
              </button>
              <button
              onClick={handleSave}
              className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-sm hover:shadow-md transition-all duration-200">
              
                Save Profile Changes
              </button>
            </div>
          }
        </div>
      </div>
    </div>);

}