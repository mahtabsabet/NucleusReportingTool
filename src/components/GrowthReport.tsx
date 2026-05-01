import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeftIcon,
  CalendarIcon,
  TrendingUpIcon,
  UsersIcon,
  BookOpenIcon,
  ArrowRightIcon,
  PlusCircleIcon,
  MinusCircleIcon,
  ActivityIcon,
  CircleIcon } from
'lucide-react';
import { getEventsSummary, EventLogEntry, getPersonName } from '../data/store';
import { mockNuclei, mockClusters } from '../data/mockData';
const EVENT_ICONS: Record<string, React.ReactNode> = {
  activity_created: <PlusCircleIcon className="w-4 h-4 text-emerald-600" />,
  participant_added: <UsersIcon className="w-4 h-4 text-blue-600" />,
  participant_removed: <MinusCircleIcon className="w-4 h-4 text-red-500" />,
  circle_movement: <ArrowRightIcon className="w-4 h-4 text-purple-600" />,
  course_completed: <BookOpenIcon className="w-4 h-4 text-green-600" />,
  course_started: <BookOpenIcon className="w-4 h-4 text-blue-500" />,
  person_created: <UsersIcon className="w-4 h-4 text-amber-600" />,
  nucleus_created: <CircleIcon className="w-4 h-4 text-blue-700" />
};
const EVENT_COLORS: Record<string, string> = {
  activity_created: 'bg-emerald-50 border-emerald-200',
  participant_added: 'bg-blue-50 border-blue-200',
  participant_removed: 'bg-red-50 border-red-200',
  circle_movement: 'bg-purple-50 border-purple-200',
  course_completed: 'bg-green-50 border-green-200',
  course_started: 'bg-sky-50 border-sky-200',
  person_created: 'bg-amber-50 border-amber-200',
  nucleus_created: 'bg-blue-50 border-blue-200'
};
function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}
function formatDateForInput(d: Date): string {
  return d.toISOString().split('T')[0];
}
export function GrowthReport() {
  const { nucleusId } = useParams<{
    nucleusId?: string;
  }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clusterId = !nucleusId ? searchParams.get('cluster') : null;
  const cluster = clusterId ?
  mockClusters.find((c) => c.id === clusterId) :
  null;
  const clusterNucleiIds = clusterId ?
  mockNuclei.filter((n) => n.clusterId === clusterId).map((n) => n.id) :
  null;
  const nucleus = nucleusId ? mockNuclei.find((n) => n.id === nucleusId) : null;
  const title = nucleus ?
  `${nucleus.name} Growth Report` :
  cluster ?
  `${cluster.name} Cluster Growth Report` :
  'Regional Growth Report';
  const backPath = nucleus ? `/nucleus/${nucleusId}` : '/';
  const backLabel = nucleus ? `Back to ${nucleus.name}` : 'Back to Map';
  // Default: last 30 days
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return formatDateForInput(d);
  });
  const [endDate, setEndDate] = useState(() => formatDateForInput(new Date()));
  // Quick range presets
  const setRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(formatDateForInput(start));
    setEndDate(formatDateForInput(end));
  };
  const summary = useMemo(() => {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    if (nucleusId) {
      return getEventsSummary({
        startDate: start,
        endDate: end,
        nucleusId
      });
    }
    // Get all events, then filter by cluster if needed
    const allSummary = getEventsSummary({
      startDate: start,
      endDate: end
    });
    if (!clusterNucleiIds) return allSummary;
    const filterByCluster = (events: EventLogEntry[]) =>
    events.filter(
      (e) => !e.nucleusId || clusterNucleiIds.includes(e.nucleusId)
    );
    return {
      activitiesCreated: filterByCluster(allSummary.activitiesCreated),
      participantsAdded: filterByCluster(allSummary.participantsAdded),
      participantsRemoved: filterByCluster(allSummary.participantsRemoved),
      circleMovements: filterByCluster(allSummary.circleMovements),
      coursesCompleted: filterByCluster(allSummary.coursesCompleted),
      coursesStarted: filterByCluster(allSummary.coursesStarted),
      peopleCreated: filterByCluster(allSummary.peopleCreated),
      nucleiCreated: filterByCluster(allSummary.nucleiCreated),
      total: 0 // will be recalculated
    };
  }, [startDate, endDate, nucleusId, clusterId, clusterNucleiIds]);
  const statCards = [
  {
    label: 'New Activities',
    count: summary.activitiesCreated.length,
    icon: <ActivityIcon className="w-5 h-5" />,
    color: 'text-emerald-700 bg-emerald-100'
  },
  {
    label: 'Participants Added',
    count: summary.participantsAdded.length,
    icon: <UsersIcon className="w-5 h-5" />,
    color: 'text-blue-700 bg-blue-100'
  },
  {
    label: 'Circle Movements',
    count: summary.circleMovements.length,
    icon: <ArrowRightIcon className="w-5 h-5" />,
    color: 'text-purple-700 bg-purple-100'
  },
  {
    label: 'Courses Completed',
    count: summary.coursesCompleted.length,
    icon: <BookOpenIcon className="w-5 h-5" />,
    color: 'text-green-700 bg-green-100'
  },
  {
    label: 'Courses Started',
    count: summary.coursesStarted.length,
    icon: <BookOpenIcon className="w-5 h-5" />,
    color: 'text-sky-700 bg-sky-100'
  },
  {
    label: 'New People',
    count: summary.peopleCreated.length,
    icon: <UsersIcon className="w-5 h-5" />,
    color: 'text-amber-700 bg-amber-100'
  }];

  // Combine all events for the timeline
  const allEvents = useMemo(() => {
    return [
    ...summary.activitiesCreated,
    ...summary.participantsAdded,
    ...summary.participantsRemoved,
    ...summary.circleMovements,
    ...summary.coursesCompleted,
    ...summary.coursesStarted,
    ...summary.peopleCreated,
    ...summary.nucleiCreated].
    sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [summary]);
  // Group events by date for timeline
  const groupedEvents = useMemo(() => {
    const groups: {
      date: string;
      events: EventLogEntry[];
    }[] = [];
    let currentDate = '';
    allEvents.forEach((event) => {
      const dateStr = formatDate(event.timestamp);
      if (dateStr !== currentDate) {
        currentDate = dateStr;
        groups.push({
          date: dateStr,
          events: []
        });
      }
      groups[groups.length - 1].events.push(event);
    });
    return groups;
  }, [allEvents]);
  return (
    <div className="min-h-screen bg-nucleus-pattern font-sans">
      <header className="bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 sm:px-8 py-5 sm:py-6 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => navigate(backPath)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 mb-3 transition-colors">
            
            <ChevronLeftIcon className="w-4 h-4" />
            {backLabel}
          </button>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center shadow-inner">
              <TrendingUpIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                {title}
              </h1>
              <p className="text-sm font-medium text-gray-500 mt-1">
                Track growth and changes over time
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-6 sm:space-y-8">
        {/* Date Range Picker */}
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-5 sm:p-7 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                <CalendarIcon className="w-3.5 h-3.5 inline mr-1.5" />
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium shadow-sm" />
              
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                <CalendarIcon className="w-3.5 h-3.5 inline mr-1.5" />
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium shadow-sm" />
              
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setRange(7)}
                className="px-3 py-2.5 text-xs font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                
                7 days
              </button>
              <button
                onClick={() => setRange(30)}
                className="px-3 py-2.5 text-xs font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                
                30 days
              </button>
              <button
                onClick={() => setRange(90)}
                className="px-3 py-2.5 text-xs font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                
                90 days
              </button>
              <button
                onClick={() => setRange(365)}
                className="px-3 py-2.5 text-xs font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                
                1 year
              </button>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {statCards.map((card) =>
          <div
            key={card.label}
            className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-sm text-center">
            
              <div
              className={`w-10 h-10 rounded-xl ${card.color} flex items-center justify-center mx-auto mb-3`}>
              
                {card.icon}
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                {card.count}
              </div>
              <div className="text-xs font-semibold text-gray-500 mt-1 uppercase tracking-wider">
                {card.label}
              </div>
            </div>
          )}
        </div>

        {/* Detailed Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
          {/* New Activities */}
          {summary.activitiesCreated.length > 0 &&
          <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-5 sm:p-7 shadow-sm">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <ActivityIcon className="w-4 h-4 text-emerald-500" />
                New Activities Started
              </h3>
              <div className="space-y-3">
                {summary.activitiesCreated.map((evt) =>
              <div
                key={evt.id}
                className="flex items-start gap-3 bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                
                    <PlusCircleIcon className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">
                        {evt.details?.activityName}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDate(evt.timestamp)}
                      </p>
                    </div>
                  </div>
              )}
              </div>
            </div>
          }

          {/* Course Completions */}
          {summary.coursesCompleted.length > 0 &&
          <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-5 sm:p-7 shadow-sm">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <BookOpenIcon className="w-4 h-4 text-green-500" />
                Course Completions
              </h3>
              <div className="space-y-3">
                {summary.coursesCompleted.map((evt) =>
              <div
                key={evt.id}
                className="flex items-start gap-3 bg-green-50/50 border border-green-100 rounded-xl p-4">
                
                    <BookOpenIcon className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">
                        {evt.personName}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {evt.details?.courseName}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDate(evt.timestamp)}
                      </p>
                    </div>
                  </div>
              )}
              </div>
            </div>
          }

          {/* Circle Movements */}
          {summary.circleMovements.length > 0 &&
          <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-5 sm:p-7 shadow-sm">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <ArrowRightIcon className="w-4 h-4 text-purple-500" />
                Engagement Changes
              </h3>
              <div className="space-y-3">
                {summary.circleMovements.map((evt) =>
              <div
                key={evt.id}
                className="flex items-start gap-3 bg-purple-50/50 border border-purple-100 rounded-xl p-4">
                
                    <ArrowRightIcon className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">
                        {evt.personName}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        <span className="capitalize">{evt.details?.from}</span>
                        <span className="mx-1.5">→</span>
                        <span className="capitalize font-bold">
                          {evt.details?.to}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDate(evt.timestamp)}
                      </p>
                    </div>
                  </div>
              )}
              </div>
            </div>
          }

          {/* Participant Growth */}
          {summary.participantsAdded.length > 0 &&
          <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-5 sm:p-7 shadow-sm">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <UsersIcon className="w-4 h-4 text-blue-500" />
                Participants Added
              </h3>
              <div className="space-y-3">
                {summary.participantsAdded.map((evt) =>
              <div
                key={evt.id}
                className="flex items-start gap-3 bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                
                    <UsersIcon className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">
                        {evt.description}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDate(evt.timestamp)}
                      </p>
                    </div>
                  </div>
              )}
              </div>
            </div>
          }
        </div>

        {/* Full Timeline */}
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-5 sm:p-7 shadow-sm">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-6 flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-gray-400" />
            Full Timeline ({allEvents.length} events)
          </h3>

          {groupedEvents.length === 0 &&
          <div className="text-center py-12">
              <TrendingUpIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">
                No events found in this date range.
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Try expanding the date range or making some changes to the data.
              </p>
            </div>
          }

          <div className="space-y-6">
            {groupedEvents.map((group) =>
            <div key={group.date}>
                <div className="sticky top-0 bg-white/90 backdrop-blur-sm py-2 mb-3 z-10">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    {group.date}
                  </h4>
                </div>
                <div className="space-y-2 pl-4 border-l-2 border-gray-100">
                  {group.events.map((evt) =>
                <div
                  key={evt.id}
                  className={`flex items-start gap-3 rounded-xl p-3 border ${EVENT_COLORS[evt.type] || 'bg-gray-50 border-gray-200'}`}>
                  
                      <div className="mt-0.5 flex-shrink-0">
                        {EVENT_ICONS[evt.type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {evt.description}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {evt.timestamp.toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                          {evt.nucleusId && !nucleusId &&
                      <span className="ml-2 text-gray-400">
                              •{' '}
                              {mockNuclei.find((n) => n.id === evt.nucleusId)?.
                        name || evt.nucleusId}
                            </span>
                      }
                        </p>
                      </div>
                      {evt.personId &&
                  <button
                    onClick={() =>
                    navigate(`/individual/${evt.personId}`)
                    }
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors flex-shrink-0">
                    
                          View
                        </button>
                  }
                    </div>
                )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>);

}