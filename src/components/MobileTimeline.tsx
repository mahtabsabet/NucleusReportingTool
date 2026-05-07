import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon } from 'lucide-react';
import { Timeline } from './Timeline';
import { fetchClusters } from '../lib/db/clusters';
import type { ClusterRow } from '../lib/db/clusters';

export function MobileTimeline() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cluster = searchParams.get('cluster');
  const [clusterName, setClusterName] = useState<string | null>(null);

  useEffect(() => {
    if (!cluster) return;
    let cancelled = false;
    fetchClusters().then((rows: ClusterRow[]) => {
      if (cancelled) return;
      setClusterName(rows.find(c => c.id === cluster)?.name ?? null);
    });
    return () => { cancelled = true; };
  }, [cluster]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 font-sans">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 px-4 py-4 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          aria-label="Back to home"
          className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 tracking-tight truncate">Timeline</h1>
          <p className="text-xs font-medium text-gray-500 truncate">
            {clusterName ? `${clusterName} cluster` : 'All Alberta clusters'}
          </p>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-auto">
        <Timeline clusterId={cluster} />
      </div>
    </div>
  );
}
