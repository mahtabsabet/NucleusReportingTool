import React, { useMemo, useState, useEffect } from 'react';
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
  CircleIcon,
} from 'lucide-react';
import {
  fetchEventSummary,
  fetchClusterName,
  fetchNucleusIdsForCluster,
  type EventEntry,
  type EventSummary,
} from '../lib/db/reports';
import { fetchNucleus } from '../lib/db/nucleus';
import { GlobalSearch } from './GlobalSearch';
import { useIsMobile } from '../lib/useIsMobile';

const EVENT_ICONS: Record<string, React.ReactNode> = {
  activity_created: <PlusCircleIcon className="w-4 h-4 text-emerald-600" />,
  participant_added: <UsersIcon className="w-4 h-4 text-blue-600" />,
  participant_removed: <MinusCircleIcon className="w-4 h-4 text-red-500" />,
  circle_movement: <ArrowRightIcon className="w-4 h-4 text-purple-600" />,
  course_completed: <BookOpenIcon className="w-4 h-4 text-green-600" />,
  course_started: <BookOpenIcon className="w-4 h-4 text-blue-500" />,
  person_created: <UsersIcon className="w-4 h-4 text-amber-600" />,
  nucleus_created: <CircleIcon className="w-4 h-4 text-blue-700" />,
};

const EVENT_COLORS: Record<string, string> = {
  activity_created: 'bg-emerald-50 border-emerald-200',
  participant_added: 'bg-blue-50 border-blue-200',
  participant_removed: 'bg-red-50 border-red-200',
  circle_movement: 'bg-purple-50 border-purple-200',
  course_completed: 'bg-green-50 border-green-200',
  course_started: 'bg-sky-50 border-sky-200',
  person_created: 'bg-amber-50 border-amber-200',
  nucleus_created: 'bg-blue-50 border-blue-200',
};

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateForInput(d: Date): string {
  return d.toISOString().split('T')[0];
}

const EMPTY_SUMMARY: EventSummary = {
  activitiesCreated: [],
  participantsAdded: [],
  participantsRemoved: [],
  circleMovements: [],
  coursesCompleted: [],
  coursesStarted: [],
  peopleCreated: [],
  nucleiCreated: [],
  total: 0,
};

export function GrowthReport() {
  const isMobile = useIsMobile();
  const { nucleusId } = useParams<{ nucleusId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clusterId = !nucleusId ? searchParams.get('cluster') : null;

  const [nucleusName, setNucleusName] = useState('');
  const [clusterName, setClusterName] = useState<string | null>(null);
  const [clusterNucleusIds, setClusterNucleusIds] = useState<string[] | null>(null);
  const [summary, setSummary] = useState<EventSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return formatDateForInput(d);
  });
  const [endDate, setEndDate] = useState(() => formatDateForInput(new Date()));

  // Load scope names (nucleus name or cluster name + nuclei IDs)
  useEffect(() => {
    if (nucleusId) {
      fetchNucleus(nucleusId).then(n => setNucleusName(n?.name ?? ''));
    } else if (clusterId) {
      Promise.all([
        fetchClusterName(clusterId),
        fetchNucleusIdsForCluster(clusterId),
      ]).then(([cName, nIds]) => {
        setClusterName(cName);
        setClusterNucleusIds(nIds);
      });
    }
  }, [nucleusId, clusterId]);

  // Fetch events whenever date range or scope changes
  useEffect(() => {
    if (!startDate || !endDate) return;
    // If cluster-scoped, wait until we have nucleus IDs
    if (clusterId && clusterNucleusIds === null) return;

    setLoading(true);
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');

    const params: Parameters<typeof fetchEventSummary>[0] = { startDate: start, endDate: end };
    if (nucleusId) params.nucleusId = nucleusId;
    else if (clusterNucleusIds) params.nucleusIds = clusterNucleusIds;

    fetchEventSummary(params)
      .then(s => { setSummary(s); setLoading(false); })
      .catch(err => { console.error('Failed to load events:', err); setLoading(false); });
  }, [startDate, endDate, nucleusId, clusterId, clusterNucleusIds]);

  const setRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(formatDateForInput(start));
    setEndDate(formatDateForInput(end));
  };

  const title = nucleusName
    ? `${nucleusName} Growth Report`
    : clusterName
    ? `${clusterName} Cluster Growth Report`
    : 'Regional Growth Report';

  const backPath = nucleusId ? `/nucleus/${nucleusId}` : '/';
  const backLabel = nucleusName
    ? `Back to ${nucleusName}`
    : isMobile ? 'Back to Home' : 'Back to Map';

  const statCards = [
    { label: 'New Activities', count: summary.activitiesCreated.length, icon: <ActivityIcon className="w-5 h-5" />, color: 'text-emerald-700 bg-emerald-100' },
    { label: 'Participants Added', count: summary.participantsAdded.length, icon: <UsersIcon className="w-5 h-5" />, color: 'text-blue-700 bg-blue-100' },
    { label: 'Circle Movements', count: summary.circleMovements.length, icon: <ArrowRightIcon className="w-5 h-5" />, color: 'text-purple-700 bg-purple-100' },
    { label: 'Courses Completed', count: summary.coursesCompleted.length, icon: <BookOpenIcon className="w-5 h-5" />, color: 'text-green-700 bg-green-100' },
    { label: 'Courses Started', count: summary.coursesStarted.length, icon: <BookOpenIcon className="w-5 h-5" />, color: 'text-sky-700 bg-sky-100' },
    { label: 'New People', count: summary.peopleCreated.length, icon: <UsersIcon className="w-5 h-5" />, color: 'text-amber-700 bg-amber-100' },
  ];

  const allEvents = useMemo(() => [
    ...summary.activitiesCreated,
    ...summary.participantsAdded,
    ...summary.participantsRemoved,
    ...summary.circleMovements,
    ...summary.coursesCompleted,
    ...summary.coursesStarted,
    ...summary.peopleCreated,
    ...summary.nucleiCreated,
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()), [summary]);

  const groupedEvents = useMemo(() => {
    const groups: { date: string; events: EventEntry[] }[] = [];
    let currentDate = '';
    allEvents.forEach(event => {
      const dateStr = formatDate(event.timestamp);
      if (dateStr !== currentDate) {
        currentDate = dateStr;
        groups.push({ date: dateStr, events: [] });
      }
      groups[groups.length - 1].events.push(event);
    });
    return groups;
  }, [allEvents]);

  return (
    <div className="min-h-screen bg-nucleus-pattern font-sans">
      <header className="bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 sm:px-8 py-5 sm:py-6 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-3">
            <button
              onClick={() => navigate(backPath)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              {backLabel}
            </button>
            <div className="flex-1 max-w-sm">
              <GlobalSearch />
            </div>
          </div>
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
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium shadow-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                <CalendarIcon className="w-3.5 h-3.5 inline mr-1.5" />
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium shadow-sm"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {[7, 30, 90, 365].map(days => (
                <button
                  key={days}
                  onClick={() => setRange(days)}
                  className="px-3 py-2.5 text-xs font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  {days === 365 ? '1 year' : `${days} days`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {statCards.map(card => (
            <div
              key={card.label}
              className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-sm text-center"
            >
              <div className={`w-10 h-10 rounded-xl ${card.color} flex items-center justify-center mx-auto mb-3`}>
                {card.icon}
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                {loading ? '—' : card.count}
              </div>
              <div className="text-xs font-semibold text-gray-500 mt-1 uppercase tracking-wider">
                {card.label}
              </div>
            </div>
          ))}
        </div>

        {/* Detailed Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
          {summary.activitiesCreated.length > 0 && (
            <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-5 sm:p-7 shadow-sm">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <ActivityIcon className="w-4 h-4 text-emerald-500" />
                New Activities Started
              </h3>
              <div className="space-y-3">
                {summary.activitiesCreated.map(evt => (
                  <div key={evt.id} className="flex items-start gap-3 bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                    <PlusCircleIcon className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">
                        {(evt.details?.activityName as string) ?? evt.description}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{formatDate(evt.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary.coursesCompleted.length > 0 && (
            <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-5 sm:p-7 shadow-sm">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <BookOpenIcon className="w-4 h-4 text-green-500" />
                Course Completions
              </h3>
              <div className="space-y-3">
                {summary.coursesCompleted.map(evt => (
                  <div key={evt.id} className="flex items-start gap-3 bg-green-50/50 border border-green-100 rounded-xl p-4">
                    <BookOpenIcon className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{evt.personName ?? evt.description}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{(evt.details?.courseName as string) ?? ''}</p>
                      <p className="text-xs text-gray-500 mt-1">{formatDate(evt.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary.circleMovements.length > 0 && (
            <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-5 sm:p-7 shadow-sm">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <ArrowRightIcon className="w-4 h-4 text-purple-500" />
                Engagement Changes
              </h3>
              <div className="space-y-3">
                {summary.circleMovements.map(evt => (
                  <div key={evt.id} className="flex items-start gap-3 bg-purple-50/50 border border-purple-100 rounded-xl p-4">
                    <ArrowRightIcon className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{evt.personName ?? evt.description}</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        <span className="capitalize">{evt.details?.from as string}</span>
                        <span className="mx-1.5">→</span>
                        <span className="capitalize font-bold">{evt.details?.to as string}</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{formatDate(evt.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary.participantsAdded.length > 0 && (
            <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-5 sm:p-7 shadow-sm">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <UsersIcon className="w-4 h-4 text-blue-500" />
                Participants Added
              </h3>
              <div className="space-y-3">
                {summary.participantsAdded.map(evt => (
                  <div key={evt.id} className="flex items-start gap-3 bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                    <UsersIcon className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{evt.description}</p>
                      <p className="text-xs text-gray-500 mt-1">{formatDate(evt.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Full Timeline */}
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-5 sm:p-7 shadow-sm">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-6 flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-gray-400" />
            Full Timeline ({loading ? '…' : `${allEvents.length} events`})
          </h3>

          {!loading && groupedEvents.length === 0 && (
            <div className="text-center py-12">
              <TrendingUpIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No events found in this date range.</p>
              <p className="text-sm text-gray-400 mt-1">
                Try expanding the date range or making some changes to the data.
              </p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Loading events…
            </div>
          )}

          <div className="space-y-6">
            {groupedEvents.map(group => (
              <div key={group.date}>
                <div className="sticky top-0 bg-white/90 backdrop-blur-sm py-2 mb-3 z-10">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    {group.date}
                  </h4>
                </div>
                <div className="space-y-2 pl-4 border-l-2 border-gray-100">
                  {group.events.map(evt => (
                    <div
                      key={evt.id}
                      className={`flex items-start gap-3 rounded-xl p-3 border ${EVENT_COLORS[evt.type] ?? 'bg-gray-50 border-gray-200'}`}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        {EVENT_ICONS[evt.type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{evt.description}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {evt.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          {evt.nucleusId && !nucleusId && evt.nucleusName && (
                            <span className="ml-2 text-gray-400">• {evt.nucleusName}</span>
                          )}
                        </p>
                      </div>
                      {evt.personId && (
                        <button
                          onClick={() => navigate(`/individual/${evt.personId}`)}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors flex-shrink-0"
                        >
                          View
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
