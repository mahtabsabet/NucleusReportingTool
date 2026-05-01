import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeftIcon,
  BookOpenIcon,
  AwardIcon,
  CheckCircleIcon,
  CircleIcon,
  GlobeIcon,
} from 'lucide-react';
import { fetchCourses, fetchPersonsForCluster } from '../lib/db/clusterProfile';
import type { CourseRow, PersonProfile } from '../lib/db/clusterProfile';
import { fetchClusters } from '../lib/db/clusters';

export function ClusterProfile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clusterId = searchParams.get('cluster');

  const [clusterName, setClusterName] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [persons, setPersons] = useState<PersonProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [allClusters, allCourses, allPersons] = await Promise.all([
        fetchClusters(),
        fetchCourses(),
        fetchPersonsForCluster(clusterId),
      ]);
      if (clusterId) {
        setClusterName(allClusters.find(c => c.id === clusterId)?.name ?? null);
      }
      setCourses(allCourses);
      setPersons(allPersons);
      setLoading(false);
    }
    load();
  }, [clusterId]);

  const title = clusterName ? `${clusterName} Cluster Profile` : 'Regional Profile';
  const subtitle = clusterName
    ? `Educational progress and capacities across ${clusterName} nuclei`
    : 'Aggregated educational progress and capacities across all nuclei';

  const uniqueCapacities = [...new Set(persons.flatMap(p => p.capacities))];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 font-sans">
      <header className="bg-white border-b border-gray-200/80 px-8 py-6 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 mb-4 transition-colors">
            <ChevronLeftIcon className="w-4 h-4" />
            Back to Map
          </button>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-md">
              <GlobeIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{title}</h1>
              <p className="text-sm font-medium text-gray-500 mt-1">{subtitle}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">

            {/* Ruhi Books */}
            <div>
              <h3 className="text-sm font-bold text-gray-500 mb-6 flex items-center gap-2 uppercase tracking-widest border-b border-gray-100 pb-3">
                <BookOpenIcon className="w-5 h-5 text-blue-500" />
                Ruhi Institute Progress
              </h3>
              <div className="space-y-4">
                {courses.map(course => {
                  const completed = persons.filter(p =>
                    p.courseEnrollments.some(ce => ce.courseId === course.id && ce.status === 'completed')
                  );
                  const inProgress = persons.filter(p =>
                    p.courseEnrollments.some(ce => ce.courseId === course.id && ce.status === 'in_progress')
                  );
                  if (completed.length === 0 && inProgress.length === 0) return null;
                  return (
                    <div key={course.id} className="bg-white border border-gray-200/80 rounded-xl p-5 shadow-sm hover:border-blue-200 transition-colors duration-200">
                      <div className="flex justify-between items-start mb-4">
                        <h4 className="font-semibold text-gray-900 text-sm pr-4">{course.name}</h4>
                        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-md">
                          {completed.length + inProgress.length} total
                        </span>
                      </div>
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
                                  className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200/60 text-xs font-semibold rounded-md hover:bg-green-100 hover:border-green-300 transition-all duration-200">
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
                                  className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200/60 text-xs font-semibold rounded-md hover:bg-blue-100 hover:border-blue-300 transition-all duration-200">
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
                {persons.every(p => p.courseEnrollments.length === 0) && (
                  <p className="text-sm text-gray-500 italic bg-gray-50 p-4 rounded-xl border border-gray-100">
                    No course progress recorded yet.
                  </p>
                )}
              </div>
            </div>

            {/* Capacities */}
            <div>
              <h3 className="text-sm font-bold text-gray-500 mb-6 flex items-center gap-2 uppercase tracking-widest border-b border-gray-100 pb-3">
                <AwardIcon className="w-5 h-5 text-amber-500" />
                Capacities
              </h3>
              <div className="space-y-4">
                {uniqueCapacities.map(capacity => {
                  const capablePeople = persons.filter(p => p.capacities.includes(capacity));
                  return (
                    <div key={capacity} className="bg-white border border-gray-200/80 rounded-xl p-5 shadow-sm hover:border-amber-200 transition-colors duration-200">
                      <div className="flex justify-between items-start mb-4">
                        <h4 className="font-semibold text-gray-900 text-sm pr-4">{capacity}</h4>
                        <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                          {capablePeople.length}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {capablePeople.map(p => (
                          <button
                            key={p.id}
                            onClick={() => navigate(`/individual/${p.id}`)}
                            className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200/60 text-xs font-semibold rounded-md hover:bg-amber-100 hover:border-amber-300 transition-all duration-200">
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {uniqueCapacities.length === 0 && (
                  <p className="text-sm text-gray-500 italic bg-gray-50 p-4 rounded-xl border border-gray-100">
                    No capacities recorded yet.
                  </p>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
