import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeftIcon, ChevronRightIcon, UsersIcon } from 'lucide-react';
import { fetchActivitiesByType, fetchClusterName, type ActivityReportRow } from '../lib/db/reports';
import type { Activity } from '../types';
import { GlobalSearch } from './GlobalSearch';
import { useIsMobile } from '../lib/useIsMobile';

const TYPE_LABELS: Record<string, string> = {
  'children-class': "Children's Classes",
  'junior-youth': 'Junior Youth Groups',
  'study-circle': 'Study Circles',
  devotional: 'Devotional Gatherings',
};

// DB enum keys for each activity type's primary role
const TYPE_ROLES: Record<string, string> = {
  'children-class': 'teacher',
  'junior-youth': 'animator',
  'study-circle': 'tutor',
  devotional: 'host',
};

export function ActivityTypeReport() {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const clusterId = searchParams.get('cluster');

  const [activities, setActivities] = useState<ActivityReportRow[]>([]);
  const [clusterName, setClusterName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!type) return;
    setLoading(true);
    const loadData = async () => {
      const [rows, cName] = await Promise.all([
        fetchActivitiesByType(type as Activity['type'], clusterId),
        clusterId ? fetchClusterName(clusterId) : Promise.resolve(null),
      ]);
      setActivities(rows);
      setClusterName(cName);
      setLoading(false);
    };
    loadData().catch(err => {
      console.error('Failed to load activities:', err);
      setLoading(false);
    });
  }, [type, clusterId]);

  const label = TYPE_LABELS[type ?? ''] ?? 'Activities';
  const primaryRole = TYPE_ROLES[type ?? ''] ?? 'participant';
  const scopeLabel = clusterName ? `${clusterName} cluster` : 'all clusters';
  const roleLabel = primaryRole.charAt(0).toUpperCase() + primaryRole.slice(1);

  const getPrimaryRoleNames = (row: ActivityReportRow) => {
    const ids = row.participants[primaryRole] ?? [];
    if (ids.length === 0)
      return <span className="text-gray-400 italic">None assigned</span>;
    return ids.map(id => row.personNames[id] ?? id).join(', ');
  };

  const getTotalParticipants = (row: ActivityReportRow) =>
    Object.values(row.participants).flat().length;

  return (
    <div className="min-h-screen bg-gray-50/50 font-sans">
      <header className="bg-white border-b border-gray-200/80 px-8 py-6 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-4">
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              {isMobile ? 'Back to Home' : 'Back to Map'}
            </button>
            <div className="flex-1 max-w-sm">
              <GlobalSearch />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center shadow-inner">
              <UsersIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                {label} Report
              </h1>
              <p className="text-sm font-medium text-gray-500 mt-1">
                Overview across {scopeLabel}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-bold text-gray-900">
              {loading ? 'Loading…' : `All ${label} (${activities.length})`}
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200/80">
                  <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Activity Name
                  </th>
                  <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Nucleus
                  </th>
                  <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    {roleLabel}
                  </th>
                  <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Total Participants
                  </th>
                  <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-400">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        Loading…
                      </div>
                    </td>
                  </tr>
                ) : (
                  <>
                    {activities.map((row, index) => (
                      <tr
                        key={row.id}
                        className={`border-b border-gray-100 last:border-b-0 hover:bg-blue-50/30 transition-colors duration-200 ${index % 2 === 1 ? 'bg-gray-50/30' : ''}`}
                      >
                        <td className="py-4 px-6 text-sm font-bold text-gray-900">
                          {row.name}
                          {row.currentBook && (
                            <span className="block text-xs font-medium text-blue-600 mt-1">
                              {row.currentBook}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-sm font-medium text-gray-700">
                          <button
                            onClick={() => navigate(`/nucleus/${row.nucleusId}`)}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {row.nucleusName}
                          </button>
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-600">
                          {getPrimaryRoleNames(row)}
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-600">
                          <span className="inline-flex items-center justify-center bg-gray-100 text-gray-700 font-bold rounded-md px-2.5 py-1">
                            {getTotalParticipants(row)}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button
                            onClick={() =>
                              navigate(`/nucleus/${row.nucleusId}/activity/${row.id}`)
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 font-semibold rounded-lg hover:bg-blue-600 hover:text-white transition-all duration-200 shadow-sm"
                          >
                            Manage <ChevronRightIcon className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {activities.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-gray-400 italic">
                          No {label.toLowerCase()} found
                          {clusterName ? ` in ${clusterName}` : ''}.
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
