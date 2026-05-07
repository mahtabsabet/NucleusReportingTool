import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  GlobeIcon,
  TrendingUpIcon,
  UsersIcon,
  BookOpenIcon,
  HeartIcon,
  ChevronRightIcon,
} from 'lucide-react';

interface ReportEntry {
  label: string;
  to: string;
  icon: React.ReactNode;
  tint: string;
}

export function MobileReports() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cluster = searchParams.get('cluster');

  const withCluster = (path: string) =>
    cluster ? `${path}${path.includes('?') ? '&' : '?'}cluster=${cluster}` : path;

  const entries: ReportEntry[] = [
    {
      label: cluster ? 'Cluster Profile' : 'Regional Profile',
      to: withCluster('/cluster-profile'),
      icon: <GlobeIcon className="w-5 h-5 text-blue-600" />,
      tint: 'bg-blue-50',
    },
    {
      label: 'Growth Report',
      to: withCluster('/growth-report'),
      icon: <TrendingUpIcon className="w-5 h-5 text-emerald-600" />,
      tint: 'bg-emerald-50',
    },
    {
      label: "Children's Classes",
      to: withCluster('/report/children-class'),
      icon: <UsersIcon className="w-5 h-5 text-emerald-600" />,
      tint: 'bg-emerald-50',
    },
    {
      label: 'Junior Youth Groups',
      to: withCluster('/report/junior-youth'),
      icon: <UsersIcon className="w-5 h-5 text-amber-600" />,
      tint: 'bg-amber-50',
    },
    {
      label: 'Study Circles',
      to: withCluster('/report/study-circle'),
      icon: <BookOpenIcon className="w-5 h-5 text-purple-600" />,
      tint: 'bg-purple-50',
    },
    {
      label: 'Devotionals',
      to: withCluster('/report/devotional'),
      icon: <HeartIcon className="w-5 h-5 text-rose-600" />,
      tint: 'bg-rose-50',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-12">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">Reports</h1>
          <p className="text-xs font-medium text-gray-500">Insights & data</p>
        </div>
      </header>

      <div className="px-4 pt-4">
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-100">
          {entries.map(e => (
            <button
              key={e.label}
              type="button"
              onClick={() => navigate(e.to)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
            >
              <div className={`w-10 h-10 rounded-xl ${e.tint} flex items-center justify-center flex-shrink-0`}>
                {e.icon}
              </div>
              <span className="flex-1 text-sm font-bold text-gray-900">{e.label}</span>
              <ChevronRightIcon className="w-5 h-5 text-gray-400" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
