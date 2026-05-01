import React, { Children } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeftIcon,
  BookOpenIcon,
  AwardIcon,
  CheckCircleIcon,
  CircleIcon,
  GlobeIcon } from
'lucide-react';
import { getAllPeople } from '../data/store';
import { mockNuclei, mockClusters } from '../data/mockData';
const RUHI_BOOKS = [
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
  name: "Book 8: The Covenant of Bahá'u'lláh"
}];

export function ClusterProfile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clusterId = searchParams.get('cluster');
  const cluster = clusterId ?
  mockClusters.find((c) => c.id === clusterId) :
  null;
  const clusterNucleiIds = clusterId ?
  mockNuclei.filter((n) => n.clusterId === clusterId).map((n) => n.id) :
  null;
  const allPeople = getAllPeople();
  const people = clusterNucleiIds ?
  allPeople.filter((p) =>
  p.nuclei.some((nId) => clusterNucleiIds.includes(nId))
  ) :
  allPeople;
  const title = cluster ? `${cluster.name} Cluster Profile` : 'Regional Profile';
  const subtitle = cluster ?
  `Educational progress and capacities across ${cluster.name} nuclei` :
  'Aggregated educational progress and capacities across all nuclei';
  // Extract unique capacities
  const allCapacities = new Set<string>();
  people.forEach((p) => p.capacities.forEach((c) => allCapacities.add(c)));
  const uniqueCapacities = Array.from(allCapacities);
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
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                {title}
              </h1>
              <p className="text-sm font-medium text-gray-500 mt-1">
                {subtitle}
              </p>
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
                {RUHI_BOOKS.map((book) => {
                  const completed = people.filter((p) =>
                  p.courses.some(
                    (c) => c.id === book.id && c.status === 'completed'
                  )
                  );
                  const inProgress = people.filter((p) =>
                  p.courses.some(
                    (c) => c.id === book.id && c.status === 'in-progress'
                  )
                  );
                  if (completed.length === 0 && inProgress.length === 0)
                  return null;
                  return (
                    <div
                      key={book.id}
                      className="bg-white border border-gray-200/80 rounded-xl p-5 shadow-sm hover:border-blue-200 transition-colors duration-200">
                      
                      <div className="flex justify-between items-start mb-4">
                        <h4 className="font-semibold text-gray-900 text-sm pr-4">
                          {book.name}
                        </h4>
                        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-md">
                          {completed.length + inProgress.length} total
                        </span>
                      </div>
                      <div className="space-y-3">
                        {completed.length > 0 &&
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 bg-green-100 p-1 rounded-full">
                              <CheckCircleIcon className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {completed.map((p) =>
                            <button
                              key={p.id}
                              onClick={() =>
                              navigate(`/individual/${p.id}`)
                              }
                              className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200/60 text-xs font-semibold rounded-md hover:bg-green-100 hover:border-green-300 transition-all duration-200">
                              
                                  {p.name}
                                </button>
                            )}
                            </div>
                          </div>
                        }
                        {inProgress.length > 0 &&
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 bg-blue-100 p-1 rounded-full">
                              <CircleIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {inProgress.map((p) =>
                            <button
                              key={p.id}
                              onClick={() =>
                              navigate(`/individual/${p.id}`)
                              }
                              className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200/60 text-xs font-semibold rounded-md hover:bg-blue-100 hover:border-blue-300 transition-all duration-200">
                              
                                  {p.name}
                                </button>
                            )}
                            </div>
                          </div>
                        }
                      </div>
                    </div>);

                })}
                {people.every((p) => p.courses.length === 0) &&
                <p className="text-sm text-gray-500 italic bg-gray-50 p-4 rounded-xl border border-gray-100">
                    No course progress recorded yet.
                  </p>
                }
              </div>
            </div>

            {/* Capacities */}
            <div>
              <h3 className="text-sm font-bold text-gray-500 mb-6 flex items-center gap-2 uppercase tracking-widest border-b border-gray-100 pb-3">
                <AwardIcon className="w-5 h-5 text-amber-500" />
                Capacities
              </h3>
              <div className="space-y-4">
                {uniqueCapacities.map((capacity) => {
                  const capablePeople = people.filter((p) =>
                  p.capacities.includes(capacity)
                  );
                  return (
                    <div
                      key={capacity}
                      className="bg-white border border-gray-200/80 rounded-xl p-5 shadow-sm hover:border-amber-200 transition-colors duration-200">
                      
                      <div className="flex justify-between items-start mb-4">
                        <h4 className="font-semibold text-gray-900 text-sm pr-4">
                          {capacity}
                        </h4>
                        <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                          {capablePeople.length}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {capablePeople.map((p) =>
                        <button
                          key={p.id}
                          onClick={() => navigate(`/individual/${p.id}`)}
                          className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200/60 text-xs font-semibold rounded-md hover:bg-amber-100 hover:border-amber-300 transition-all duration-200">
                          
                            {p.name}
                          </button>
                        )}
                      </div>
                    </div>);

                })}
                {uniqueCapacities.length === 0 &&
                <p className="text-sm text-gray-500 italic bg-gray-50 p-4 rounded-xl border border-gray-100">
                    No capacities recorded yet.
                  </p>
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>);

}