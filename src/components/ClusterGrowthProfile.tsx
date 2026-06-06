import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeftIcon,
  FileSpreadsheetIcon,
  PrinterIcon,
  BarChart3Icon,
} from 'lucide-react';
import { fetchClusterName } from '../lib/db/reports';
import { fetchClusterGrowthProfile } from '../lib/db/cgp';
import { cgpTables } from '../lib/cgpTables';
import { exportCgpToXlsx } from '../lib/cgpExport';
import type { ClusterGrowthProfile as Profile } from '../lib/cgp';

export function ClusterGrowthProfile() {
  const { clusterId } = useParams<{ clusterId: string }>();
  const navigate = useNavigate();

  const [clusterName, setClusterName] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!clusterId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchClusterName(clusterId), fetchClusterGrowthProfile(clusterId)])
      .then(([name, prof]) => {
        if (cancelled) return;
        setClusterName(name ?? '');
        setProfile(prof);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err?.message ?? 'Failed to load the growth profile.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId]);

  const tables = useMemo(() => (profile ? cgpTables(profile) : []), [profile]);

  const handleXlsx = async () => {
    if (!profile) return;
    setExporting(true);
    try {
      await exportCgpToXlsx(profile, clusterName || 'cluster');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Excel export failed.');
    } finally {
      setExporting(false);
    }
  };

  const generatedOn = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-nucleus-pattern font-sans print:bg-white">
      <header className="bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 sm:px-8 py-5 sm:py-6 sticky top-0 z-10 shadow-sm print:hidden">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-3">
            <button
              onClick={() => navigate(`/growth-report?cluster=${clusterId}`)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              Back to Growth Report
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handleXlsx}
                disabled={!profile || exporting}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 px-3 py-2 rounded-xl transition-colors"
              >
                <FileSpreadsheetIcon className="w-4 h-4" />
                {exporting ? 'Exporting…' : 'Excel'}
              </button>
              <button
                onClick={() => window.print()}
                disabled={!profile}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 px-3 py-2 rounded-xl transition-colors"
              >
                <PrinterIcon className="w-4 h-4" />
                Save as PDF
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center shadow-inner">
              <BarChart3Icon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                {clusterName ? `${clusterName} — Cluster Growth Profile` : 'Cluster Growth Profile'}
              </h1>
              <p className="text-sm font-medium text-gray-500 mt-1">
                A point-in-time snapshot · generated {generatedOn}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-6 sm:space-y-8">
        {/* Print-only title (the screen header is hidden when printing). */}
        <div className="hidden print:block mb-4">
          <h1 className="text-2xl font-bold text-gray-900">
            {clusterName ? `${clusterName} — Cluster Growth Profile` : 'Cluster Growth Profile'}
          </h1>
          <p className="text-sm text-gray-600">Point-in-time snapshot · generated {generatedOn}</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-5 text-sm font-medium">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            Generating profile…
          </div>
        )}

        {!loading &&
          !error &&
          tables.map(table => (
            <section
              key={table.key}
              className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-5 sm:p-7 shadow-sm print:shadow-none print:border-gray-300 break-inside-avoid"
            >
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">
                {table.title}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      {table.columns.map((col, i) => (
                        <th
                          key={i}
                          className={`py-2 px-3 font-semibold text-gray-500 ${
                            i === 0 ? 'text-left' : 'text-right'
                          }`}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, ri) => {
                      const isTotal = table.totalRowIndices?.includes(ri);
                      return (
                        <tr
                          key={ri}
                          className={`border-b border-gray-100 last:border-0 ${
                            isTotal ? 'font-bold text-gray-900 bg-gray-50/70' : 'text-gray-700'
                          }`}
                        >
                          {row.map((cell, ci) => (
                            <td
                              key={ci}
                              className={`py-2 px-3 ${ci === 0 ? 'text-left' : 'text-right tabular-nums'}`}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}
