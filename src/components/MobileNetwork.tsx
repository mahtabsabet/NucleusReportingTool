import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon } from 'lucide-react';
import { NetworkView } from './NetworkView';
import { fetchClusters, fetchNuclei } from '../lib/db/clusters';
import type { ClusterRow, NucleusRow } from '../lib/db/clusters';

export function MobileNetwork() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cluster = searchParams.get('cluster');
  const [nuclei, setNuclei] = useState<NucleusRow[]>([]);
  const [clusterName, setClusterName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchNuclei(), fetchClusters()])
      .then(([n, c]: [NucleusRow[], ClusterRow[]]) => {
        if (cancelled) return;
        setNuclei(n);
        if (cluster) setClusterName(c.find(x => x.id === cluster)?.name ?? null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cluster]);

  const filtered = useMemo(
    () => cluster ? nuclei.filter(n => n.clusterId === cluster) : nuclei,
    [nuclei, cluster],
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50 font-sans">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 px-4 py-4 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          aria-label="Back to home"
          className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 tracking-tight truncate">Network</h1>
          <p className="text-xs font-medium text-gray-500 truncate">
            {clusterName ? `${clusterName} cluster` : 'Cross-nucleus links'}
          </p>
        </div>
      </header>
      <div className="flex-1 min-h-0 relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
          </div>
        ) : (
          <NetworkView nuclei={filtered} clusterId={cluster} />
        )}
      </div>
    </div>
  );
}
